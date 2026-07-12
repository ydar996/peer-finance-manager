const fs = require("fs");
const path = require("path");
const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const { loadMergedBankTransactions } = require("./parse-bank-sources");
const { registerBankImport } = require("./bank-import");
const {
  ensureSettingsTable,
  setCooperativeSetting,
  getCooperativeSetting,
} = require("./cooperative-settings");
const {
  LEDGER_TYPES,
  getCooperativeBankLedgerXlsxPath,
  getCooperativeBankLedgerCsvPath,
  getLedgerEndingBalance,
  ledgerCsvAutoSyncEnabled,
  syncCooperativeBankLedgerCsvFiles,
} = require("./cooperative-bank-ledger-csv");
const { trace } = require("./trace-log");
const { todayIso: cooperativeTodayIso } = require("./cooperative-time");
const { getOrgDataDir } = require("./organization-service");
const { getOrgSlug } = require("./org-context");

const MEMBER_LEDGER_TYPES = new Set([
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.LOAN_REPAYMENT,
  TRANSACTION_TYPES.LOAN_DISBURSEMENT,
  TRANSACTION_TYPES.DISTRIBUTION,
  TRANSACTION_TYPES.MEMBERSHIP_FEE,
]);

function mapLedgerType(ledgerType) {
  const map = {
    deposit: TRANSACTION_TYPES.DEPOSIT,
    withdrawal: TRANSACTION_TYPES.WITHDRAWAL,
    loan_repayment: TRANSACTION_TYPES.LOAN_REPAYMENT,
    loan_disbursement: TRANSACTION_TYPES.LOAN_DISBURSEMENT,
    distribution: TRANSACTION_TYPES.DISTRIBUTION,
    membership_fee: TRANSACTION_TYPES.MEMBERSHIP_FEE,
    expense: TRANSACTION_TYPES.EXPENSE,
    cd_purchase: TRANSACTION_TYPES.CD_PURCHASE,
    cd_liquidation: TRANSACTION_TYPES.CD_LIQUIDATION,
    investment: TRANSACTION_TYPES.INVESTMENT,
  };
  return map[ledgerType] || null;
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

const { buildImportFingerprint, ledgerTransactionKey } = require("./import-fingerprint");

function findReferenceLedgerPath() {
  const slug = getOrgSlug();
  const candidates = [
    getCooperativeBankLedgerXlsxPath(),
    getCooperativeBankLedgerCsvPath(),
    path.join(getOrgDataDir(slug), "bank-imports", "latest-workbook.xlsx"),
    path.join(getOrgDataDir(slug), "bank-imports", "latest-workbook.csv"),
    path.join(getOrgDataDir(slug), "bank-imports", "latest-statement.csv"),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function insertBankLedgerTransaction({
  db,
  insertTx,
  insertExpense,
  tx,
  nameToId,
  importId,
  counts,
}) {
  const type = mapLedgerType(tx.ledgerType);
  if (!type) return false;

  const [year, month] = (tx.date || "").split("-").map(Number);
  const reference = `${tx.source}:${tx.date}:${tx.amount}`;

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
      importId
    );
    counts.expenses += 1;
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
      importId
    );
    if (type === TRANSACTION_TYPES.CD_PURCHASE) counts.cdPurchases += 1;
    if (type === TRANSACTION_TYPES.CD_LIQUIDATION) counts.cdLiquidations += 1;
    if (type === TRANSACTION_TYPES.INVESTMENT) counts.investments += 1;
    return true;
  }

  if (!MEMBER_LEDGER_TYPES.has(type)) return false;

  const memberId = tx.member ? nameToId[tx.member] : null;
  if (!memberId) {
    if (type === TRANSACTION_TYPES.DEPOSIT) {
      insertTx.run(
        null,
        type,
        tx.amount,
        tx.date,
        year || null,
        month || null,
        tx.description,
        reference,
        importId
      );
      counts.deposits += 1;
      counts.unassignedDeposits = (counts.unassignedDeposits || 0) + 1;
      return true;
    }
    counts.skippedNoMember += 1;
    return false;
  }

  let signedAmount = tx.amount;
  if (type === TRANSACTION_TYPES.WITHDRAWAL && signedAmount > 0) {
    signedAmount = -signedAmount;
  }
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT && signedAmount > 0) {
    signedAmount = -signedAmount;
  }
  const insertInfo = insertTx.run(
    memberId,
    type,
    signedAmount,
    tx.date,
    year || null,
    month || null,
    tx.description,
    reference,
    importId
  );
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT) {
    try {
      const { recordDisbursementPolicySnapshot } = require("./loan-policy-service");
      recordDisbursementPolicySnapshot({
        disbursementTxId: Number(insertInfo.lastInsertRowid),
        memberId,
        disbursementDate: tx.date,
        principal: Math.abs(signedAmount),
      });
    } catch (_) {}
  }
  if (type === TRANSACTION_TYPES.DEPOSIT) counts.deposits += 1;
  if (type === TRANSACTION_TYPES.WITHDRAWAL) counts.withdrawals += 1;
  if (type === TRANSACTION_TYPES.LOAN_REPAYMENT) counts.loanRepayments += 1;
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT) counts.loanDisbursements += 1;
  if (type === TRANSACTION_TYPES.DISTRIBUTION) counts.distributions = (counts.distributions || 0) + 1;
  if (type === TRANSACTION_TYPES.MEMBERSHIP_FEE) counts.membershipFees = (counts.membershipFees || 0) + 1;
  return true;
}

function importBankLedgerCore({
  bankTxs,
  importLabel,
  cdBalance,
  replaceSpreadsheetDeposits = true,
  captureReconcileAnchor = true,
}) {
  const db = getDb();
  ensureSettingsTable(db);

  const members = db.prepare(`SELECT id, name FROM members`).all();
  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));

  const importId = registerBankImport(importLabel);

  const insertTx = db.prepare(
    `INSERT INTO transactions
      (member_id, type, amount, transaction_date, period_year, period_month,
       description, reference, bank_import_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bank_import')`
  );
  const insertExpense = db.prepare(
    `INSERT INTO expenses (description, amount, expense_date, category)
     VALUES (?, ?, ?, ?)`
  );

  const counts = {
    deposits: 0,
    withdrawals: 0,
    loanRepayments: 0,
    loanDisbursements: 0,
    distributions: 0,
    membershipFees: 0,
    expenses: 0,
    cdPurchases: 0,
    cdLiquidations: 0,
    investments: 0,
    skippedNoMember: 0,
    unassignedDeposits: 0,
  };

  const run = db.transaction(() => {
    if (replaceSpreadsheetDeposits) {
      db.prepare(
        `DELETE FROM transactions
         WHERE source = 'spreadsheet' AND type IN ('deposit', 'withdrawal')`
      ).run();
    }

    db.prepare(`DELETE FROM transactions WHERE source = 'bank_import'`).run();
    const manualPlaceholders = LEDGER_TYPES.map(() => "?").join(", ");
    db.prepare(
      `DELETE FROM transactions WHERE source = 'manual' AND type IN (${manualPlaceholders})`
    ).run(...LEDGER_TYPES);
    db.prepare(`DELETE FROM expenses`).run();
    db.prepare(`DELETE FROM transactions WHERE type = 'expense'`).run();

    for (const tx of bankTxs) {
      insertBankLedgerTransaction({
        db,
        insertTx,
        insertExpense,
        tx,
        nameToId,
        importId,
        counts,
      });
    }

    if (cdBalance != null && cdBalance !== "") {
      setCooperativeSetting(db, "cd_balance", cdBalance);
      setCooperativeSetting(db, "cd_balance_as_of", cooperativeTodayIso());
    }
  });

  run();

  db.prepare(`UPDATE bank_imports SET status = 'applied' WHERE id = ?`).run(importId);

  let bankReconcile = null;
  if (captureReconcileAnchor) {
    const {
      captureBankReconcileAnchorFromLedger,
      getBankReconcileStatus,
    } = require("./bank-reconcile-service");
    captureBankReconcileAnchorFromLedger({
      source: "full_refresh",
      label: importLabel,
      db,
    });
    bankReconcile = getBankReconcileStatus();
  }

  return {
    importId,
    totalBankRows: bankTxs.length,
    ...counts,
    cdBalance: cdBalance != null ? Number(cdBalance) : null,
    bankReconcile,
  };
}

function syncMissingBankLedgerRows({ referencePath } = {}) {
  // Never trust a on-disk reference file ahead of the live DB. Refresh export from DB
  // first so a stale cooperative-bank-ledger-reference.csv cannot inject phantom rows.
  if (ledgerCsvAutoSyncEnabled()) {
    try {
      syncCooperativeBankLedgerCsvFiles();
    } catch (err) {
      trace.warn("Pre-sync reference refresh failed", { error: err.message });
    }
  }

  const refPath = referencePath || findReferenceLedgerPath();
  if (!refPath) {
    return { skipped: true, reason: "no_reference_file", inserted: 0 };
  }

  const db = getDb();
  const members = db.prepare(`SELECT id, name FROM members`).all();
  const memberNames = members.map((m) => m.name);
  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));
  const isCsv = refPath.toLowerCase().endsWith(".csv");

  const bankTxs = loadMergedBankTransactions({
    xlsxPath: isCsv ? null : refPath,
    csvPath: isCsv ? refPath : null,
    memberNames,
    xlsxOriginalName: path.basename(refPath),
    csvOriginalName: isCsv ? path.basename(refPath) : null,
  });

  const existingRows = db
    .prepare(
      `SELECT transaction_date, amount, description
       FROM transactions
       WHERE source IN ('bank_import', 'manual')`
    )
    .all();
  const existingKeys = new Set(
    existingRows.map((row) =>
      ledgerTransactionKey(row.transaction_date, row.amount, row.description)
    )
  );

  const before = getLedgerEndingBalance();
  const importId = registerBankImport(`sync-missing:${path.basename(refPath)}`);
  const insertTx = db.prepare(
    `INSERT INTO transactions
      (member_id, type, amount, transaction_date, period_year, period_month,
       description, reference, bank_import_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bank_import')`
  );
  const insertExpense = db.prepare(
    `INSERT INTO expenses (description, amount, expense_date, category)
     VALUES (?, ?, ?, ?)`
  );

  const counts = {
    deposits: 0,
    withdrawals: 0,
    loanRepayments: 0,
    loanDisbursements: 0,
    expenses: 0,
    cdPurchases: 0,
    cdLiquidations: 0,
    investments: 0,
    skippedNoMember: 0,
    unassignedDeposits: 0,
    inserted: 0,
  };
  const insertedRows = [];

  const run = db.transaction(() => {
    for (const tx of bankTxs) {
      const key = ledgerTransactionKey(tx.date, tx.amount, tx.description);
      if (existingKeys.has(key)) continue;
      const inserted = insertBankLedgerTransaction({
        db,
        insertTx,
        insertExpense,
        tx,
        nameToId,
        importId,
        counts,
      });
      if (inserted) {
        counts.inserted += 1;
        insertedRows.push({
          date: tx.date,
          amount: tx.amount,
          member: tx.member || null,
          description: tx.description,
        });
        existingKeys.add(key);
      }
    }
  });

  run();

  if (counts.inserted > 0) {
    db.prepare(`UPDATE bank_imports SET status = 'applied' WHERE id = ?`).run(importId);
    const { queueCooperativeBankLedgerCsvSync } = require("./cooperative-bank-ledger-csv");
    queueCooperativeBankLedgerCsvSync("sync_missing");
  }

  const after = getLedgerEndingBalance();
  return {
    skipped: false,
    referencePath: refPath,
    inserted: counts.inserted,
    insertedRows,
    beforeBalance: before?.balance ?? null,
    afterBalance: after?.balance ?? null,
    ...counts,
  };
}

function importBankLedger({
  xlsxPath,
  csvPath,
  xlsxOriginalName,
  csvOriginalName,
  cdBalance,
  replaceSpreadsheetDeposits = true,
}) {
  const db = getDb();
  ensureSettingsTable(db);

  const members = db.prepare(`SELECT id, name FROM members`).all();
  const memberNames = members.map((m) => m.name);

  if (!xlsxPath && !csvPath) {
    throw new Error("Upload your master ledger file (cooperative-bank-ledger-reference.csv).");
  }

  let bankTxs = loadMergedBankTransactions({
    xlsxPath: xlsxPath || null,
    csvPath: csvPath || null,
    memberNames,
    xlsxOriginalName: xlsxOriginalName || null,
    csvOriginalName: csvOriginalName || null,
  });
  const { applyAdjustmentsToBankTransactions } = require("./ledger-adjustment-service");
  bankTxs = applyAdjustmentsToBankTransactions(bankTxs);

  return importBankLedgerCore({
    bankTxs,
    importLabel: [xlsxPath, csvPath]
      .filter(Boolean)
      .map((p) => p.split(/[/\\]/).pop())
      .join(" + "),
    cdBalance,
    replaceSpreadsheetDeposits,
  });
}

function importBankLedgerFromTransactions({
  bankTxs,
  sourceLabel = "adjustment-rebuild",
  cdBalance,
  replaceSpreadsheetDeposits = true,
  captureReconcileAnchor = false,
}) {
  return importBankLedgerCore({
    bankTxs,
    importLabel: sourceLabel,
    cdBalance,
    replaceSpreadsheetDeposits,
    captureReconcileAnchor,
  });
}

module.exports = {
  importBankLedger,
  importBankLedgerFromTransactions,
  syncMissingBankLedgerRows,
  findReferenceLedgerPath,
  getCooperativeSetting,
  setCooperativeSetting,
};
