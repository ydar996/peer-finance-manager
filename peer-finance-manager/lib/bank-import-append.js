const fs = require("fs");
const path = require("path");
const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const { registerBankImport, archiveUploadedBankFiles } = require("./bank-import");
const { auditLedgerImport } = require("./ledger-import-audit");
const {
  buildImportFingerprint,
  buildImportFingerprintVariants,
  descriptionTokenSet,
  ledgerTransactionKey,
  ledgerTransactionKeyVariants,
  tokenOverlapScore,
} = require("./import-fingerprint");
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
  TRANSACTION_TYPES.SHARE_CAPITAL,
  TRANSACTION_TYPES.SHARE_CAPITAL_REDEMPTION,
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

const NARRATION_SIMILARITY_THRESHOLD = 0.5;

function loadExistingFingerprintSet(db, bankAccountId) {
  const fingerprints = new Set();
  const legacyKeys = new Set();
  const narrationByDateAmount = new Map();

  // Dedupe is per bank account: a row in another account must not block the
  // same posting's other leg here (e.g. an internal transfer exists once per
  // account). Rows with no account assignment belong to the primary account.
  let primaryAccountId = null;
  try {
    primaryAccountId =
      db.prepare(`SELECT id FROM bank_accounts WHERE is_primary = 1`).get()?.id ?? null;
  } catch (_) {}
  const targetId = bankAccountId != null ? Number(bankAccountId) : primaryAccountId;
  const inScope = (acctId) =>
    acctId === targetId ||
    (acctId == null && (targetId === primaryAccountId || primaryAccountId == null));

  const withFingerprint = db
    .prepare(
      `SELECT import_fingerprint, bank_account_id FROM transactions
       WHERE import_fingerprint IS NOT NULL AND import_fingerprint != ''`
    )
    .all();
  for (const row of withFingerprint) {
    if (inScope(row.bank_account_id)) fingerprints.add(row.import_fingerprint);
  }

  const rows = db
    .prepare(
      `SELECT transaction_date, amount, description, bank_account_id
       FROM transactions
       WHERE source IN ('bank_import', 'manual')`
    )
    .all();

  for (const row of rows) {
    if (!inScope(row.bank_account_id)) continue;
    for (const key of ledgerTransactionKeyVariants(row.transaction_date, row.amount, row.description)) {
      legacyKeys.add(key);
    }
    const acct = row.bank_account_id != null ? row.bank_account_id : bankAccountId;
    for (const fp of buildImportFingerprintVariants(acct, row.transaction_date, row.amount, row.description)) {
      fingerprints.add(fp);
    }
    const dateAmt = `${row.transaction_date}|${Math.abs(Number(row.amount)).toFixed(2)}`;
    if (!narrationByDateAmount.has(dateAmt)) narrationByDateAmount.set(dateAmt, []);
    narrationByDateAmount.get(dateAmt).push(descriptionTokenSet(row.description));
  }

  const memberByFingerprint = new Map();
  const memberByLegacy = new Map();
  const typeByFingerprint = new Map();
  const typeByLegacy = new Map();
  const namedRows = db
    .prepare(
      `SELECT t.import_fingerprint AS fp, t.transaction_date AS transactionDate, t.amount,
              t.description, t.type AS ledgerType, t.bank_account_id AS bankAccountId,
              m.name AS memberName
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
       WHERE t.source IN ('bank_import', 'manual')`
    )
    .all();
  for (const row of namedRows) {
    if (!inScope(row.bankAccountId)) continue;
    const legacyVariants = ledgerTransactionKeyVariants(row.transactionDate, row.amount, row.description);
    const rebuiltVariants = buildImportFingerprintVariants(
      row.bankAccountId != null ? row.bankAccountId : bankAccountId,
      row.transactionDate,
      row.amount,
      row.description
    );
    for (const legacy of legacyVariants) typeByLegacy.set(legacy, row.ledgerType);
    for (const rebuilt of rebuiltVariants) typeByFingerprint.set(rebuilt, row.ledgerType);
    if (row.fp) typeByFingerprint.set(row.fp, row.ledgerType);
    if (row.memberName) {
      for (const legacy of legacyVariants) memberByLegacy.set(legacy, row.memberName);
      if (row.fp) memberByFingerprint.set(row.fp, row.memberName);
      for (const rebuilt of rebuiltVariants) memberByFingerprint.set(rebuilt, row.memberName);
    }
  }

  return { fingerprints, legacyKeys, memberByFingerprint, memberByLegacy, typeByFingerprint, typeByLegacy, narrationByDateAmount };
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

function computeAppendBalanceCheck({
  ledgerBefore,
  statementBeginning,
  statementEnding,
  projectedLedger,
  readyCount,
  skippedCount,
  skippedDelta,
}) {
  // All-tenant append contract: block only when the ledger is short of the
  // expected position at the append point, or when New rows would not tie to
  // statement ending. The append anchor is the statement beginning plus the net
  // of rows already in the ledger (Skipped). Within-period credits and debits
  // move the running balance both ways, so a ledger that ends mid-period below
  // the period opening is normal when debits were imported. With no skipped
  // rows the anchor is the statement beginning itself.
  const openingAnchor =
    statementBeginning != null && skippedDelta != null
      ? Math.round((statementBeginning + skippedDelta) * 100) / 100
      : statementBeginning;
  const openingAligned =
    openingAnchor == null ||
    ledgerBefore == null ||
    Math.abs(ledgerBefore - openingAnchor) <= 0.02;
  const periodOpenGap =
    openingAnchor != null && ledgerBefore != null
      ? Math.round((ledgerBefore - openingAnchor) * 100) / 100
      : null;
  const ledgerShort =
    openingAnchor != null &&
    ledgerBefore != null &&
    ledgerBefore < openingAnchor - 0.02;
  const periodCloseMismatch =
    statementEnding != null &&
    projectedLedger != null &&
    Math.abs(projectedLedger - statementEnding) > 0.02;
  const hasNewRows = readyCount > 0;
  return {
    statementBeginning,
    statementEnding,
    ledgerBefore,
    projectedLedger,
    openingAnchor,
    periodOpenGap,
    openingAligned,
    ledgerShort,
    periodCloseMismatch,
    openingBlock: ledgerShort,
    mismatch: hasNewRows && periodCloseMismatch,
    idempotentReplay: !hasNewRows && skippedCount > 0,
    ledgerMatchesStatementEnding:
      statementEnding != null &&
      ledgerBefore != null &&
      Math.abs(ledgerBefore - statementEnding) <= 0.02,
  };
}

function buildPreviewRow(row, index, memberNames, bankAccountId, existing) {
  const fingerprint = rowFingerprint(bankAccountId, row);
  const legacy = rowLegacyKey(row);
  const fingerprintVariants = buildImportFingerprintVariants(
    bankAccountId,
    row.date,
    row.amount,
    row.description,
    row.reference
  );
  const legacyVariants = ledgerTransactionKeyVariants(row.date, row.amount, row.description, row.reference);
  const validationIssues = validateParsedRow({ ...row }, memberNames);

  let isDuplicate =
    fingerprintVariants.some((fp) => existing.fingerprints.has(fp)) ||
    legacyVariants.some((key) => existing.legacyKeys.has(key));

  // Narration-drift fallback: same posting rendered differently across export
  // formats. Only applies when date and absolute amount already coincide.
  if (!isDuplicate && existing.narrationByDateAmount) {
    const dateAmt = `${row.date}|${Math.abs(Number(row.amount)).toFixed(2)}`;
    const candidates = existing.narrationByDateAmount.get(dateAmt);
    if (candidates && candidates.length) {
      const rowTokens = descriptionTokenSet(row.description);
      isDuplicate = candidates.some(
        (stored) => tokenOverlapScore(stored, rowTokens) >= NARRATION_SIMILARITY_THRESHOLD
      );
    }
  }

  let bucket = "ready";
  if (isDuplicate) {
    bucket = "skipped";
  } else if (validationIssues.length) {
    bucket = "needsReview";
  }

  const lookup = (byFp, byLegacy) =>
    fingerprintVariants.map((fp) => byFp?.get(fp)).find(Boolean) ||
    legacyVariants.map((key) => byLegacy?.get(key)).find(Boolean) ||
    null;
  const ledgerMember = lookup(existing.memberByFingerprint, existing.memberByLegacy);
  const storedType = lookup(existing.typeByFingerprint, existing.typeByLegacy);
  const effectiveType =
    bucket === "skipped" && storedType ? storedType : row.ledgerType || null;

  return {
    index,
    fingerprint,
    date: row.date,
    description: row.description,
    amount: row.amount,
    reference: row.reference || null,
    member: bucket === "skipped" ? ledgerMember || row.member || null : row.member || null,
    ledgerType: effectiveType,
    typeLabel: effectiveType ? typeLabelForLedger(effectiveType) : null,
    typeSource: row.typeSource,
    bucket,
    issues: bucket === "skipped" ? [] : validationIssues,
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

  const parsedResult = parseUploadedStatement({
    filePath,
    originalName,
    memberNames,
    bankAccountId: account.id,
  });
  const parsed = parsedResult.rows || [];
  if (!parsed.length) {
    throw new Error("No transactions found in the uploaded file.");
  }

  const existing = loadExistingFingerprintSet(db, account.id);
  let previewRows = parsed.map((row, index) =>
    buildPreviewRow(row, index, memberNames, account.id, existing)
  );
  try {
    const { applyApprovedLoanDisbursementMatches } = require("./approved-loan-disbursement");
    applyApprovedLoanDisbursementMatches(previewRows, memberNames);
  } catch (_) {
    /* approved-loan matching is optional */
  }

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

  const ledger = getLedgerEndingBalance(null, account.id);
  const readyDelta = previewRows
    .filter((r) => r.bucket === "ready")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const projectedLedger = Math.round(((ledger?.balance ?? 0) + readyDelta) * 100) / 100;
  const readyCount = previewRows.filter((r) => r.bucket === "ready").length;
  const skippedCount = previewRows.filter((r) => r.bucket === "skipped").length;
  const skippedDelta = previewRows
    .filter((r) => r.bucket === "skipped")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const balanceCheck = computeAppendBalanceCheck({
    ledgerBefore: ledger?.balance ?? null,
    statementBeginning: parsedResult.statementSummary?.beginning ?? null,
    statementEnding: parsedResult.statementSummary?.ending ?? null,
    projectedLedger,
    readyCount,
    skippedCount,
    skippedDelta,
  });

  const summary = {
    total: previewRows.length,
    ready: previewRows.filter((r) => r.bucket === "ready").length,
    skipped: previewRows.filter((r) => r.bucket === "skipped").length,
    needsReview: previewRows.filter((r) => r.bucket === "needsReview").length,
    warningCount: audit.warningCount,
    resolvedFormat: parsedResult.resolvedFormat,
    balanceCheck,
  };

  return {
    bankAccount: account,
    summary,
    rows: previewRows,
    audit,
  };
}

function summarizePreviewRows(rows) {
  return {
    total: rows.length,
    ready: rows.filter((r) => r.bucket === "ready").length,
    skipped: rows.filter((r) => r.bucket === "skipped").length,
    needsReview: rows.filter((r) => r.bucket === "needsReview").length,
  };
}

function rebucketEditablePreviewRows(previewRows, memberNames) {
  for (const row of previewRows) {
    if (row.bucket === "skipped") continue;
    const issues = validateParsedRow(
      {
        date: row.date,
        description: row.description,
        amount: row.amount,
        ledgerType: row.ledgerType,
        member: row.member,
        typeSource: row.userOverride ? "explicit" : row.typeSource || "inferred",
        reference: row.reference,
      },
      memberNames
    );
    row.issues = issues;
    row.bucket = issues.length ? "needsReview" : "ready";
  }
}

function applyRowOverridesToPreview(preview, rowOverrides, memberNames) {
  if (!preview?.rows?.length || !rowOverrides) return preview;

  for (const row of preview.rows) {
    if (row.bucket === "skipped") continue;
    const override = rowOverrides[String(row.index)] ?? rowOverrides[row.index];
    if (!override) continue;
    if (override.ledgerType) {
      row.ledgerType = override.ledgerType;
      row.typeLabel = typeLabelForLedger(override.ledgerType);
      row.typeSource = "explicit";
      row.userOverride = true;
    }
    if (override.member !== undefined) {
      row.member = override.member ? String(override.member).trim() : null;
    }
  }

  rebucketEditablePreviewRows(preview.rows, memberNames);

  const counts = summarizePreviewRows(preview.rows);
  const readyDelta = preview.rows
    .filter((r) => r.bucket === "ready")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const ledgerBefore = preview.summary?.balanceCheck?.ledgerBefore ?? null;
  const projectedLedger =
    ledgerBefore != null
      ? Math.round((ledgerBefore + readyDelta) * 100) / 100
      : null;
  const skippedDelta = preview.rows
    .filter((r) => r.bucket === "skipped")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const balanceCheck = computeAppendBalanceCheck({
    ledgerBefore,
    statementBeginning: preview.summary?.balanceCheck?.statementBeginning ?? null,
    statementEnding: preview.summary?.balanceCheck?.statementEnding ?? null,
    projectedLedger,
    readyCount: counts.ready,
    skippedCount: counts.skipped,
    skippedDelta,
  });

  preview.summary = {
    ...preview.summary,
    ...counts,
    balanceCheck,
  };

  return preview;
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
  if (!type) return { inserted: false };

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
    return { inserted: true, type };
  }

  if (
    type === TRANSACTION_TYPES.CD_PURCHASE ||
    type === TRANSACTION_TYPES.CD_LIQUIDATION ||
    type === TRANSACTION_TYPES.INVESTMENT ||
    type === TRANSACTION_TYPES.OTHER_INCOME
  ) {
    const memberId = tx.member ? nameToId[tx.member] : null;
    insertTx.run(
      memberId || null,
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
    if (type === TRANSACTION_TYPES.OTHER_INCOME) counts.otherIncome = (counts.otherIncome || 0) + 1;
    return { inserted: true, type };
  }

  if (!MEMBER_LEDGER_TYPES.has(type)) return { inserted: false };

  const memberId = tx.member ? nameToId[tx.member] : null;
  if (!memberId && memberRequiredForType(type)) return { inserted: false };

  let signedAmount = tx.amount;
  if (type === TRANSACTION_TYPES.WITHDRAWAL && signedAmount > 0) {
    signedAmount = -signedAmount;
  }
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT && signedAmount > 0) {
    signedAmount = -signedAmount;
  }
  if (type === TRANSACTION_TYPES.SHARE_CAPITAL_REDEMPTION && signedAmount > 0) {
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
    importId,
    bankAccountId,
    fingerprint
  );
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT && memberId) {
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
  counts.inserted += 1;
  if (type === TRANSACTION_TYPES.DEPOSIT && memberId) {
    try {
      const { learnPaymentAliasFromDescription } = require("./member-payment-alias-service");
      learnPaymentAliasFromDescription(memberId, tx.member, tx.description);
    } catch (_) {}
    try {
      require("./member-service").applyMembershipFeeFromFirstDeposit(memberId);
    } catch (_) {}
    try {
      require("./flexxforms-membership-service").maybeNotifyDepositsVerified(memberId);
    } catch (_) {}
  }
  if (type === TRANSACTION_TYPES.DEPOSIT) counts.deposits += 1;
  if (type === TRANSACTION_TYPES.WITHDRAWAL) counts.withdrawals += 1;
  if (type === TRANSACTION_TYPES.LOAN_REPAYMENT) counts.loanRepayments += 1;
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT) counts.loanDisbursements += 1;
  if (type === TRANSACTION_TYPES.DISTRIBUTION) counts.distributions += 1;
  if (type === TRANSACTION_TYPES.SHARE_CAPITAL) counts.shareCapital = (counts.shareCapital || 0) + 1;
  if (type === TRANSACTION_TYPES.SHARE_CAPITAL_REDEMPTION) counts.shareCapitalRedemptions = (counts.shareCapitalRedemptions || 0) + 1;
  return {
    inserted: true,
    transactionId: Number(insertInfo.lastInsertRowid) || null,
    memberId: memberId || null,
    type,
    date: tx.date,
    amount: signedAmount,
    description: tx.description,
    member: tx.member || null,
  };
}

function applyBankStatementAppend({
  filePath,
  originalName,
  bankAccountId,
  allowPartial = true,
  rowOverrides = null,
} = {}) {
  let preview = previewBankStatementAppend({
    filePath,
    originalName,
    bankAccountId,
  });

  const db = getDb();
  const members = db.prepare(`SELECT id, name FROM members`).all();
  const memberNames = members.map((m) => m.name);

  if (rowOverrides && Object.keys(rowOverrides).length) {
    preview = applyRowOverridesToPreview(preview, rowOverrides, memberNames);
  }

  if (preview.summary.needsReview > 0 && !allowPartial) {
    const err = new Error(
      `${preview.summary.needsReview} row(s) need review before import. Set Type and Member in the preview table.`
    );
    err.preview = preview;
    throw err;
  }

  const bc = preview.summary?.balanceCheck || {};
  if (bc.openingBlock || bc.ledgerShort) {
    const expected = bc.openingAnchor != null ? bc.openingAnchor : bc.statementBeginning;
    const err = new Error(
      `Ledger balance (${bc.ledgerBefore}) is below the expected balance (${expected}) at this point in the statement. The ledger is missing history. Run Full Ledger Refresh with your cooperative master ledger file, then upload the statement again.`
    );
    err.preview = preview;
    throw err;
  }

  if (bc.mismatch) {
    const err = new Error(
      `After import, ledger would be ${bc.projectedLedger} but statement ending is ${bc.statementEnding}. Fix Type/Member on preview rows or run Full Ledger Refresh if the base ledger is wrong.`
    );
    err.preview = preview;
    throw err;
  }

  const readyRows = preview.rows.filter((r) => r.bucket === "ready");
  if (!readyRows.length) {
    const ledgerIdle = getLedgerEndingBalance(null, preview.bankAccount?.id);
    const { captureBankReconcileAfterAppend, getBankReconcileStatus } = require(
      "./bank-reconcile-service"
    );
    captureBankReconcileAfterAppend({
      preview,
      ledgerEndingBalance: ledgerIdle?.balance ?? null,
      ledgerEndingAsOf: ledgerIdle?.asOf ?? null,
      originalName,
    });
    return {
      ...preview,
      applied: false,
      inserted: 0,
      message: "No new transactions to import.",
      bankReconcile: getBankReconcileStatus(),
    };
  }

  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));
  const parsedResult = parseUploadedStatement({
    filePath,
    originalName,
    memberNames,
    bankAccountId: preview.bankAccount.id,
  });
  const parsedByIndex = parsedResult.rows || [];

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
      const parsed = parsedByIndex[row.index];
      if (!parsed) continue;
      const tx = {
        ...parsed,
        ledgerType: row.ledgerType || parsed.ledgerType,
        member: row.member != null ? row.member : parsed.member,
      };
      const inserted = insertAppendTransaction({
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
      if (inserted?.inserted) {
        insertedRows.push({
          transactionId: inserted.transactionId || null,
          date: inserted.date || tx.date,
          amount: inserted.amount != null ? inserted.amount : tx.amount,
          member: inserted.member || tx.member || null,
          memberId: inserted.memberId || null,
          description: inserted.description || tx.description,
          type: inserted.type || tx.ledgerType,
        });
        if (
          inserted.type === TRANSACTION_TYPES.LOAN_DISBURSEMENT &&
          (row.approvedApplicationId || inserted.transactionId)
        ) {
          try {
            const {
              markApprovedLoanDisbursed,
              matchPendingApprovedLoan,
              listPendingApprovedLoans,
            } = require("./approved-loan-disbursement");
            const applicationId =
              row.approvedApplicationId ||
              matchPendingApprovedLoan(row, listPendingApprovedLoans(), new Set())
                ?.applicationId;
            if (applicationId) {
              markApprovedLoanDisbursed({
                applicationId,
                transactionId: inserted.transactionId,
                disbursementDate: inserted.date || tx.date,
                memberId: inserted.memberId,
              });
            }
          } catch (_) {
            /* linking the approved application is best-effort */
          }
        }
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

  const ledger = getLedgerEndingBalance(null, preview.bankAccount?.id);

  let message =
    counts.inserted > 0
      ? `Added ${counts.inserted} new transaction(s). ${preview.summary.skipped} already in ledger.`
      : "No new transactions were added.";

  if (
    counts.inserted > 0 &&
    bc.statementEnding != null &&
    ledger?.balance != null &&
    Math.abs(ledger.balance - bc.statementEnding) > 0.02
  ) {
    message += ` Warning: ledger balance ${ledger.balance} does not match statement ending ${bc.statementEnding}.`;
  }

  const { captureBankReconcileAfterAppend, getBankReconcileStatus } = require(
    "./bank-reconcile-service"
  );
  captureBankReconcileAfterAppend({
    preview,
    ledgerEndingBalance: ledger?.balance ?? null,
    ledgerEndingAsOf: ledger?.asOf ?? null,
    originalName,
  });

  return {
    ...preview,
    applied: counts.inserted > 0,
    inserted: counts.inserted,
    importId,
    counts,
    insertedRows,
    archived,
    ledgerEndingBalance: ledger?.balance ?? null,
    message,
    bankReconcile: getBankReconcileStatus(),
  };
}

module.exports = {
  previewBankStatementAppend,
  applyBankStatementAppend,
  applyRowOverridesToPreview,
  summarizePreviewRows,
  computeAppendBalanceCheck,
};
