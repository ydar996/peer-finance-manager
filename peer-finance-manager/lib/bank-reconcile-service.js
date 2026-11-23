const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  setCooperativeSetting,
  getCooperativeSetting,
} = require("./cooperative-settings");
const { getLedgerEndingBalance } = require("./cooperative-bank-ledger-csv");

const SETTING_KEYS = {
  balance: "bank_reconcile_balance",
  asOf: "bank_reconcile_as_of",
  bankImportRows: "bank_reconcile_bank_import_rows",
  verifiedAt: "bank_reconcile_verified_at",
  source: "bank_reconcile_source",
  label: "bank_reconcile_label",
  bankAccountId: "bank_reconcile_bank_account_id",
};

const BALANCE_TOLERANCE = 0.02;

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function primaryBankAccountId(db = getDb()) {
  try {
    return db.prepare(`SELECT id FROM bank_accounts WHERE is_primary = 1`).get()?.id ?? null;
  } catch (_) {
    return null;
  }
}

// Same rule as import dedupe: rows with no account id belong to the primary
// account. An anchor with no stored account was captured on the primary.
function resolveAnchorAccountId(anchorAccountId, db = getDb()) {
  return anchorAccountId != null ? Number(anchorAccountId) : primaryBankAccountId(db);
}

function countBankImportRows(db = getDb(), bankAccountId = null) {
  if (bankAccountId == null) {
    return db
      .prepare(`SELECT COUNT(1) AS c FROM transactions WHERE source = 'bank_import'`)
      .get().c;
  }
  const primaryId = primaryBankAccountId(db);
  const targetId = Number(bankAccountId);
  return db
    .prepare(
      `SELECT COUNT(1) AS c FROM transactions
       WHERE source = 'bank_import'
         AND (bank_account_id = ? OR (bank_account_id IS NULL AND ? = 1))`
    )
    .get(targetId, targetId === primaryId || primaryId == null ? 1 : 0).c;
}

function readStoredAnchor() {
  const balanceRaw = getCooperativeSetting(SETTING_KEYS.balance);
  const asOf = getCooperativeSetting(SETTING_KEYS.asOf);
  const rowsRaw = getCooperativeSetting(SETTING_KEYS.bankImportRows);
  const verifiedAt = getCooperativeSetting(SETTING_KEYS.verifiedAt);
  const source = getCooperativeSetting(SETTING_KEYS.source);
  const label = getCooperativeSetting(SETTING_KEYS.label);
  const bankAccountIdRaw = getCooperativeSetting(SETTING_KEYS.bankAccountId);

  if (balanceRaw == null || !asOf || rowsRaw == null || !verifiedAt) {
    return null;
  }

  const balance = Number(balanceRaw);
  const bankImportRows = Number(rowsRaw);
  if (!Number.isFinite(balance) || !Number.isFinite(bankImportRows)) {
    return null;
  }

  return {
    balance: roundMoney(balance),
    asOf,
    bankImportRows,
    verifiedAt,
    source: source || null,
    label: label || null,
    bankAccountId:
      bankAccountIdRaw != null && bankAccountIdRaw !== ""
        ? Number(bankAccountIdRaw)
        : null,
  };
}

function captureBankReconcileAnchor({
  balance,
  asOf,
  source,
  label = null,
  bankAccountId = null,
  db = getDb(),
} = {}) {
  const amount = Number(balance);
  const asOfDate = String(asOf || "").slice(0, 10);
  if (!Number.isFinite(amount)) {
    throw new Error("Reconcile anchor balance must be a number");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    throw new Error("Reconcile anchor as-of date must be YYYY-MM-DD");
  }

  ensureSettingsTable(db);
  const anchorAccountId = resolveAnchorAccountId(bankAccountId, db);
  const bankImportRows = countBankImportRows(db, anchorAccountId);
  const verifiedAt = new Date().toISOString();

  setCooperativeSetting(db, SETTING_KEYS.balance, roundMoney(amount));
  setCooperativeSetting(db, SETTING_KEYS.asOf, asOfDate);
  setCooperativeSetting(db, SETTING_KEYS.bankImportRows, bankImportRows);
  setCooperativeSetting(db, SETTING_KEYS.verifiedAt, verifiedAt);
  setCooperativeSetting(db, SETTING_KEYS.source, source || "unknown");
  setCooperativeSetting(
    db,
    SETTING_KEYS.bankAccountId,
    anchorAccountId != null ? String(anchorAccountId) : ""
  );
  if (label != null && String(label).trim()) {
    setCooperativeSetting(db, SETTING_KEYS.label, String(label).trim());
  }

  return {
    balance: roundMoney(amount),
    asOf: asOfDate,
    bankImportRows,
    verifiedAt,
    source: source || "unknown",
    label: label || null,
    bankAccountId: anchorAccountId,
  };
}

function captureBankReconcileAnchorFromLedger({ source, label = null, bankAccountId = null, db = getDb() } = {}) {
  const anchorAccountId = resolveAnchorAccountId(bankAccountId, db);
  const ledger = getLedgerEndingBalance(null, anchorAccountId);
  if (ledger?.balance == null || !ledger?.asOf) {
    return null;
  }
  return captureBankReconcileAnchor({
    balance: ledger.balance,
    asOf: ledger.asOf,
    source,
    label,
    bankAccountId: anchorAccountId,
    db,
  });
}

function compareBankReconcileStatus({ anchor, liveBalanceAtAnchor, liveBankImportRows, liveLedger }) {
  if (!anchor) {
    return {
      status: "not_set",
      anchor: null,
      live: {
        balanceAtAnchor: liveBalanceAtAnchor?.balance ?? null,
        asOf: liveLedger?.asOf ?? null,
        bankImportRows: liveBankImportRows,
        balanceLatest: liveLedger?.balance ?? null,
      },
      divergences: [],
    };
  }

  const divergences = [];

  if (liveBankImportRows !== anchor.bankImportRows) {
    divergences.push({
      field: "bankImportRows",
      anchor: anchor.bankImportRows,
      live: liveBankImportRows,
      delta: liveBankImportRows - anchor.bankImportRows,
    });
  }

  if (liveBalanceAtAnchor?.balance != null) {
    const delta = roundMoney(liveBalanceAtAnchor.balance - anchor.balance);
    if (Math.abs(delta) > BALANCE_TOLERANCE) {
      divergences.push({
        field: "balanceAtAnchor",
        anchor: anchor.balance,
        live: liveBalanceAtAnchor.balance,
        delta,
        asOf: anchor.asOf,
      });
    }
  }

  return {
    status: divergences.length ? "out_of_sync" : "reconciled",
    anchor,
    live: {
      balanceAtAnchor: liveBalanceAtAnchor?.balance ?? null,
      asOf: liveLedger?.asOf ?? null,
      bankImportRows: liveBankImportRows,
      balanceLatest: liveLedger?.balance ?? null,
    },
    divergences,
  };
}

function getBankReconcileStatus() {
  const anchor = readStoredAnchor();
  const db = getDb();
  // The anchor is per bank account: compare against rows on that account
  // only, so appends to other accounts do not move the anchor's baseline.
  const anchorAccountId = resolveAnchorAccountId(anchor?.bankAccountId, db);
  const liveLedger = getLedgerEndingBalance(null, anchorAccountId);
  const liveBalanceAtAnchor = anchor?.asOf
    ? getLedgerEndingBalance(anchor.asOf, anchorAccountId)
    : null;
  const liveBankImportRows = countBankImportRows(db, anchorAccountId);

  let compared = compareBankReconcileStatus({
    anchor,
    liveBalanceAtAnchor,
    liveBankImportRows,
    liveLedger,
  });

  // Split/reclassify expands one bank transaction into any number of bank_import rows
  // (2-way, 3-way, …) without changing cash balance. Align row-count when balance matches.
  if (
    compared.status === "out_of_sync" &&
    compared.divergences.length === 1 &&
    compared.divergences[0].field === "bankImportRows" &&
    liveBalanceAtAnchor?.balance != null &&
    Math.abs(liveBalanceAtAnchor.balance - anchor.balance) <= BALANCE_TOLERANCE
  ) {
    captureBankReconcileAnchor({
      balance: anchor.balance,
      asOf: anchor.asOf,
      source: "classification_row_align",
      label: anchor.label || "split/reclassify",
      bankAccountId: anchorAccountId,
      db,
    });
    compared = compareBankReconcileStatus({
      anchor: readStoredAnchor(),
      liveBalanceAtAnchor,
      liveBankImportRows: countBankImportRows(db, anchorAccountId),
      liveLedger,
    });
  }

  return compared;
}

/**
 * After split/reclassify rebuild: keep balance/as-of, refresh bank_import row count.
 */
function refreshBankReconcileAfterClassification({ label = "split/reclassify" } = {}) {
  const anchor = readStoredAnchor();
  if (!anchor?.asOf) return null;
  const db = getDb();
  const anchorAccountId = resolveAnchorAccountId(anchor.bankAccountId, db);
  const liveBalanceAtAnchor = getLedgerEndingBalance(anchor.asOf, anchorAccountId);
  if (
    liveBalanceAtAnchor?.balance == null ||
    Math.abs(liveBalanceAtAnchor.balance - anchor.balance) > BALANCE_TOLERANCE
  ) {
    return null;
  }
  return captureBankReconcileAnchor({
    balance: anchor.balance,
    asOf: anchor.asOf,
    source: "ledger_adjustment",
    label,
    bankAccountId: anchorAccountId,
    db,
  });
}

function captureBankReconcileAfterAppend({ preview, ledgerEndingBalance, ledgerEndingAsOf, originalName, bankAccountId }) {
  const bc = preview?.summary?.balanceCheck || {};
  const statementEnding = bc.statementEnding;
  const ledgerMatches =
    bc.ledgerMatchesStatementEnding ||
    (statementEnding != null &&
      ledgerEndingBalance != null &&
      Math.abs(ledgerEndingBalance - statementEnding) <= BALANCE_TOLERANCE);

  if (!ledgerMatches) {
    return null;
  }

  const balance = statementEnding != null ? statementEnding : ledgerEndingBalance;
  const asOf = ledgerEndingAsOf || getLedgerEndingBalance()?.asOf;
  if (balance == null || !asOf) {
    return null;
  }

  return captureBankReconcileAnchor({
    balance,
    asOf,
    source: "append",
    label: originalName || null,
    bankAccountId: bankAccountId ?? preview?.bankAccount?.id ?? null,
  });
}

module.exports = {
  SETTING_KEYS,
  BALANCE_TOLERANCE,
  countBankImportRows,
  readStoredAnchor,
  captureBankReconcileAnchor,
  captureBankReconcileAnchorFromLedger,
  compareBankReconcileStatus,
  getBankReconcileStatus,
  refreshBankReconcileAfterClassification,
  captureBankReconcileAfterAppend,
};
