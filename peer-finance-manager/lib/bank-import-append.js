const fs = require("fs");
const path = require("path");
const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const { registerBankImport, archiveUploadedBankFiles } = require("./bank-import");
const { auditLedgerImport } = require("./ledger-import-audit");
const { buildImportFingerprint, ledgerTransactionKey } = require("./import-fingerprint");
const { typeLabelForLedger, memberRequiredForType } = require("./transaction-import-types");
const { parseUploadedStatement, validateParsedRow } = require("./statement-import-parser");
const {
  getBankAccount,
  ensureDefaultBankAccount,
} = require("./bank-account-service");
const { queueCooperativeBankLedgerCsvSync, getLedgerEndingBalance } = require(
  "./cooperative-bank-ledger-csv"
);

const MEMBER_LEDGER_TYPES = new Set([
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.LOAN_REPAYMENT,
  TRANSACTION_TYPES.LOAN_DISBURSEMENT,
  TRANSACTION_TYPES.DISTRIBUTION,
]);

function mapLedgerType(ledgerType) {
  return ledgerType;
}

function expenseCategory(description) {
  const d = String(description || "").toLowerCase();
  if (d.includes("monthly fee") || d.includes("bank fee")) return "Bank Fees";
  if (d.includes("food") || d.includes("catering") || d.includes("suya")) return "Meeting/Event";
  if (d.includes("form") || d.includes("subscription") || d.includes("clubhouse")) {
    return "Administrative";
  }
  return "Other";
}

function loadExistingFingerprintSet(db, bankAccountId) {
  const fingerprints = new Set();
  const legacyKeys = new Set();

  const withFingerprint = db
    .prepare(
      `SELECT import_fingerprint FROM transactions
       WHERE import_fingerprint IS NOT NULL AND import_fingerprint != ''`
    )
    .all();
  for (const row of withFingerprint) {
    fingerprints.add(row.import_fingerprint);
  }

  const rows = db
    .prepare(
      `SELECT transaction_date, amount, description, bank_account_id
       FROM transactions
       WHERE source IN ('bank_import', 'manual')`
    )
    .all();

  for (const row of rows) {
    const legacy = ledgerTransactionKey(row.transaction_date, row.amount, row.description);
    legacyKeys.add(legacy);
    if (row.bank_account_id != null) {
      fingerprints.add(buildImportFingerprint(row.bank_account_id, row.transaction_date, row.amount, row.description));
    } else {
      fingerprints.add(buildImportFingerprint(bankAccountId, row.transaction_date, row.amount, row.description));
    }
  }

  return { fingerprints, legacyKeys };
}

function rowFingerprint(bankAccountId, row) {
  return buildImportFingerprint(
    bankAccountId,
    row.date,
    row.amount,
    row.description,
    row.reference
  );
}

function rowLegacyKey(row) {
  return ledgerTransactionKey(row.date, row.amount, row.description, row.reference);
}

function buildPreviewRow(row, index, memberNames, bankAccountId, existing) {
  const fingerprint = rowFingerprint(bankAccountId, row);
  const legacy = rowLegacyKey(row);
  const validationIssues = validateParsedRow({ ...row }, memberNames);

  let bucket = "ready";
  if (existing.fingerprints.has(fingerprint) || existing.legacyKeys.has(legacy)) {
    bucket = "skipped";
  } else if (validationIssues.length) {
    bucket = "needsReview";
  }

  return {
    index,
    fingerprint,
    date: row.date,
    description: row.description,
    amount: row.amount,
    reference: row.reference || null,
    member: row.member || null,
    ledgerType: row.ledgerType || null,
    typeLabel: row.ledgerType ? typeLabelForLedger(row.ledgerType) : null,
    typeSource: row.typeSource,
    bucket,
    issues: validationIssues,
  };
}

function applyAuditWarnings(previewRows, transactionsForAudit, memberNames) {
  const audit = auditLedgerImport(transactionsForAudit, memberNames);
  const warningByKey = new Map();
  for (const warning of audit.warnings) {
    const key = `${warning.date}|${Number(warning.amount).toFixed(2)}|${String(warning.description || "").slice(0, 48)}`;
    warningByKey.set(key, warning);
  }

  for (const row of previewRows) {
    if (row.bucket !== "ready") continue;
    const key = `${row.date}|${Number(row.amount).toFixed(2)}|${String(row.description || "").slice(0, 48)}`;
    const warning = warningByKey.get(key);
    if (warning) {
      row.bucket = "needsReview";
      row.issues = [...(row.issues || []), warning.message];
      row.auditKind = warning.kind;
    }
  }

  return { audit, previewRows };
}

function previewBankStatementAppend({
  filePath,
  originalName,
  bankAccountId,
} = {}) {
  const db = getDb();
  const account = bankAccountId
    ? getBankAccount(bankAccountId)
    : ensureDefaultBankAccount();
  if (!account) throw new Error("Configure a bank account first.");

  const members = db.prepare(`SELECT id, name FROM members`).all();
  const memberNames = members.map((m) => m.name);

  const parsed = parseUploadedStatement({
    filePath,
    originalName,
    memberNames,
  });
  if (!parsed.length) {
    throw new Error("No transactions found in the uploaded file.");
  }

  const existing = loadExistingFingerprintSet(db, account.id);
  let previewRows = parsed.map((row, index) =>
    buildPreviewRow(row, index, memberNames, account.id, existing)
  );

  const auditInput = parsed
    .filter((_, i) => previewRows[i].bucket === "ready")
    .map((row) => ({
      date: row.date,
      amount: row.amount,
      description: row.description,
      ledgerType: row.ledgerType,
      member: row.member,
    }));

  const { audit } = applyAuditWarnings(previewRows, auditInput, memberNames);

  const summary = {
    total: previewRows.length,
    ready: previewRows.filter((r) => r.bucket === "ready").length,
    skipped: previewRows.filter((r) => r.bucket === "skipped").length,
    needsReview: previewRows.filter((r) => r.bucket === "needsReview").length,
    warningCount: audit.warningCount,
  };

  return {
    bankAccount: account,
    summary,
    rows: previewRows,
    audit,
  };
}

function insertAppendTransaction({
  db,
  insertTx,
  insertExpense,
  tx,
  nameToId,
  importId,
  bankAccountId,
  fingerprint,
  counts,
}) {
  const type = mapLedgerType(tx.ledgerType);
  if (!type) return false;

  const [year, month] = (tx.date || "").split("-").map(Number);
  const reference = `append:${tx.date}:${tx.amount}:${fingerprint.slice(-24)}`;

  if (type === TRANSACTION_TYPES.EXPENSE) {
    const amount = Math.abs(tx.amount);
    const category = expenseCategory(tx.description);
    insertExpense.run(tx.description, amount, tx.date, category);
    insertTx.run(
      null,
      type,
      -amount,
      tx.date,
      year || null,
      month || null,
      `${category}: ${tx.description}`,
      reference,
      importId,
      bankAccountId,
      fingerprint
    );
    counts.expenses += 1;
    counts.inserted += 1;
    return true;
  }

  if (
    type === TRANSACTION_TYPES.CD_PURCHASE ||
    type === TRANSACTION_TYPES.CD_LIQUIDATION ||
    type === TRANSACTION_TYPES.INVESTMENT
  ) {
    insertTx.run(
      null,
      type,
      tx.amount,
      tx.date,
      year || null,
      month || null,
      tx.description,
      reference,
      importId,
      bankAccountId,
      fingerprint
    );
    counts.inserted += 1;
    if (type === TRANSACTION_TYPES.CD_PURCHASE) counts.cdPurchases += 1;
    if (type === TRANSACTION_TYPES.CD_LIQUIDATION) counts.cdLiquidations += 1;
    if (type === TRANSACTION_TYPES.INVESTMENT) counts.investments += 1;
    return true;
  }

  if (!MEMBER_LEDGER_TYPES.has(type)) return false;

  const memberId = tx.member ? nameToId[tx.member] : null;
  if (!memberId && memberRequiredForType(type)) return false;

  let signedAmount = tx.amount;
  if (type === TRANSACTION_TYPES.WITHDRAWAL && signedAmount > 0) {
    signedAmount = -signedAmount;
  }
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT && signedAmount > 0) {
    signedAmount = -signedAmount;
  }

  insertTx.run(
    memberId,
    type,
    signedAmount,
    tx.date,
    year || null,
    month || null,
    tx.description,
    reference,
    importId,
    bankAccountId,
    fingerprint
  );
  counts.inserted += 1;
  if (type === TRANSACTION_TYPES.DEPOSIT) counts.deposits += 1;
  if (type === TRANSACTION_TYPES.WITHDRAWAL) counts.withdrawals += 1;
  if (type === TRANSACTION_TYPES.LOAN_REPAYMENT) counts.loanRepayments += 1;
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT) counts.loanDisbursements += 1;
  if (type === TRANSACTION_TYPES.DISTRIBUTION) counts.distributions += 1;
  return true;
}

function applyBankStatementAppend({
  filePath,
  originalName,
  bankAccountId,
  allowPartial = true,
} = {}) {
  const preview = previewBankStatementAppend({
    filePath,
    originalName,
    bankAccountId,
  });

  if (preview.summary.needsReview > 0 && !allowPartial) {
    const err = new Error(
      `${preview.summary.needsReview} row(s) need review before import. Fix Type/Member or resolve warnings.`
    );
    err.preview = preview;
    throw err;
  }

  const readyRows = preview.rows.filter((r) => r.bucket === "ready");
  if (!readyRows.length) {
    return {
      ...preview,
      applied: false,
      inserted: 0,
      message: "No new transactions to import.",
    };
  }

  const db = getDb();
  const members = db.prepare(`SELECT id, name FROM members`).all();
  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));
  const parsedByIndex = parseUploadedStatement({
    filePath,
    originalName,
    memberNames: members.map((m) => m.name),
  });

  const archived = archiveUploadedBankFiles({ statementPath: filePath });
  const importId = registerBankImport(
    `append:${originalName || path.basename(filePath || "statement")}`
  );

  const insertTx = db.prepare(
    `INSERT OR IGNORE INTO transactions
      (member_id, type, amount, transaction_date, period_year, period_month,
       description, reference, bank_import_id, source, bank_account_id, import_fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bank_import', ?, ?)`
  );
  const insertExpense = db.prepare(
    `INSERT INTO expenses (description, amount, expense_date, category)
     VALUES (?, ?, ?, ?)`
  );

  const counts = {
    inserted: 0,
    deposits: 0,
    withdrawals: 0,
    loanRepayments: 0,
    loanDisbursements: 0,
    distributions: 0,
    expenses: 0,
    cdPurchases: 0,
    cdLiquidations: 0,
    investments: 0,
  };

  const insertedRows = [];

  const run = db.transaction(() => {
    for (const row of readyRows) {
      const tx = parsedByIndex[row.index];
      if (!tx) continue;
      const ok = insertAppendTransaction({
        db,
        insertTx,
        insertExpense,
        tx,
        nameToId,
        importId,
        bankAccountId: preview.bankAccount.id,
        fingerprint: row.fingerprint,
        counts,
      });
      if (ok) {
        insertedRows.push({
          date: tx.date,
          amount: tx.amount,
          member: tx.member,
          description: tx.description,
          type: tx.ledgerType,
        });
      }
    }
    if (counts.inserted > 0) {
      db.prepare(`UPDATE bank_imports SET status = 'applied' WHERE id = ?`).run(importId);
    }
  });

  run();

  if (counts.inserted > 0) {
    queueCooperativeBankLedgerCsvSync("append_import");
  }

  const ledger = getLedgerEndingBalance();

  return {
    ...preview,
    applied: counts.inserted > 0,
    inserted: counts.inserted,
    counts,
    insertedRows,
    archived,
    ledgerEndingBalance: ledger?.balance ?? null,
    message:
      counts.inserted > 0
        ? `Added ${counts.inserted} new transaction(s). ${preview.summary.skipped} already in ledger.`
        : "No new transactions were added.",
  };
}

module.exports = {
  previewBankStatementAppend,
  applyBankStatementAppend,
};
