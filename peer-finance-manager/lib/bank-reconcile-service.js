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

// Per-account anchor keys, e.g. bank_reconcile_balance_acct_3. The
// unsuffixed keys remain the primary account's legacy anchor.
function accountSettingKeys(accountId) {
  const suffix = `_acct_${accountId}`;
  return {
    balance: SETTING_KEYS.balance + suffix,
    asOf: SETTING_KEYS.asOf + suffix,
    bankImportRows: SETTING_KEYS.bankImportRows + suffix,
    verifiedAt: SETTING_KEYS.verifiedAt + suffix,
    source: SETTING_KEYS.source + suffix,
    label: SETTING_KEYS.label + suffix,
  };
}

function readStoredAnchor(bankAccountId = null, db = getDb()) {
  const accountId = resolveAnchorAccountId(bankAccountId, db);
  const primaryId = primaryBankAccountId(db);
  let keys = accountSettingKeys(accountId);
  let balanceRaw = getCooperativeSetting(keys.balance);
  let asOf = getCooperativeSetting(keys.asOf);
  let rowsRaw = getCooperativeSetting(keys.bankImportRows);
  let verifiedAt = getCooperativeSetting(keys.verifiedAt);
  let source = getCooperativeSetting(keys.source);
  let label = getCooperativeSetting(keys.label);

  // Legacy anchors (pre per-account storage) live on the primary account.
  if (
    (balanceRaw == null || !asOf || rowsRaw == null || !verifiedAt) &&
    (accountId == null || accountId === primaryId || primaryId == null)
  ) {
    keys = SETTING_KEYS;
    balanceRaw = getCooperativeSetting(SETTING_KEYS.balance);
    asOf = getCooperativeSetting(SETTING_KEYS.asOf);
    rowsRaw = getCooperativeSetting(SETTING_KEYS.bankImportRows);
    verifiedAt = getCooperativeSetting(SETTING_KEYS.verifiedAt);
    source = getCooperativeSetting(SETTING_KEYS.source);
    label = getCooperativeSetting(SETTING_KEYS.label);
  }
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
      accountId ??
      (bankAccountIdRaw != null && bankAccountIdRaw !== ""
        ? Number(bankAccountIdRaw)
        : null),
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

  const keys = accountSettingKeys(anchorAccountId);
  setCooperativeSetting(db, keys.balance, roundMoney(amount));
  setCooperativeSetting(db, keys.asOf, asOfDate);
  setCooperativeSetting(db, keys.bankImportRows, bankImportRows);
  setCooperativeSetting(db, keys.verifiedAt, verifiedAt);
  setCooperativeSetting(db, keys.source, source || "unknown");
  if (label != null && String(label).trim()) {
    setCooperativeSetting(db, keys.label, String(label).trim());
  }

  // Keep the legacy (unsuffixed) keys in step for the primary account so
  // older anchors and any reader that predates per-account storage agree.
  if (anchorAccountId === primaryBankAccountId(db) || primaryBankAccountId(db) == null) {
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

function getBankReconcileStatus(bankAccountId = null) {
  const db = getDb();
  // The anchor is per bank account: compare against rows on that account
  // only, so appends to other accounts do not move the anchor's baseline.
  const anchorAccountId = resolveAnchorAccountId(bankAccountId, db);
  const anchor = readStoredAnchor(anchorAccountId, db);
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
      anchor: readStoredAnchor(anchorAccountId, db),
      liveBalanceAtAnchor,
      liveBankImportRows: countBankImportRows(db, anchorAccountId),
      liveLedger,
    });
  }

  return compared;
}

/**
 * Reconcile status for every configured bank account. The overall status is
 * out_of_sync when any account diverges, reconciled when at least one anchor
 * verifies, otherwise not_set. anchor/live/divergences mirror the worst
 * (diverging) account so the headline card can surface its details.
 */
function getBankReconcileStatusAll() {
  const db = getDb();
  let accounts = [];
  try {
    accounts = db
      .prepare(
        `SELECT id, institution_name, account_label, is_primary
         FROM bank_accounts ORDER BY is_primary DESC, id ASC`
      )
      .all();
  } catch (_) {
    accounts = [];
  }

  const results = accounts.map((account) => ({
    account: {
      id: account.id,
      institutionName: account.institution_name,
      accountLabel: account.account_label,
      isPrimary: !!account.is_primary,
    },
    ...getBankReconcileStatus(account.id),
  }));

  const display =
    results.find((r) => r.status === "out_of_sync") ||
    results.find((r) => r.status === "reconciled") ||
    results[0] ||
    getBankReconcileStatus(null);

  const status = results.some((r) => r.status === "out_of_sync")
    ? "out_of_sync"
    : results.some((r) => r.status === "reconciled")
      ? "reconciled"
      : "not_set";

  return {
    status,
    anchor: display.anchor,
    live: display.live,
    divergences: display.divergences,
    accounts: results,
  };
}

/**
 * After split/reclassify rebuild: keep balance/as-of, refresh bank_import row count.
 */
function refreshBankReconcileAfterClassification({ label = "split/reclassify" } = {}) {
  const anchor = readStoredAnchor(null);
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
  getBankReconcileStatusAll,
  refreshBankReconcileAfterClassification,
  captureBankReconcileAfterAppend,
};
