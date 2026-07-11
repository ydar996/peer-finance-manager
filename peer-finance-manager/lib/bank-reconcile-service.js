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
};

const BALANCE_TOLERANCE = 0.02;

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function countBankImportRows(db = getDb()) {
  return db
    .prepare(`SELECT COUNT(1) AS c FROM transactions WHERE source = 'bank_import'`)
    .get().c;
}

function readStoredAnchor() {
  const balanceRaw = getCooperativeSetting(SETTING_KEYS.balance);
  const asOf = getCooperativeSetting(SETTING_KEYS.asOf);
  const rowsRaw = getCooperativeSetting(SETTING_KEYS.bankImportRows);
  const verifiedAt = getCooperativeSetting(SETTING_KEYS.verifiedAt);
  const source = getCooperativeSetting(SETTING_KEYS.source);
  const label = getCooperativeSetting(SETTING_KEYS.label);

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
  };
}

function captureBankReconcileAnchor({
  balance,
  asOf,
  source,
  label = null,
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
  const bankImportRows = countBankImportRows(db);
  const verifiedAt = new Date().toISOString();

  setCooperativeSetting(db, SETTING_KEYS.balance, roundMoney(amount));
  setCooperativeSetting(db, SETTING_KEYS.asOf, asOfDate);
  setCooperativeSetting(db, SETTING_KEYS.bankImportRows, bankImportRows);
  setCooperativeSetting(db, SETTING_KEYS.verifiedAt, verifiedAt);
  setCooperativeSetting(db, SETTING_KEYS.source, source || "unknown");
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
  };
}

function captureBankReconcileAnchorFromLedger({ source, label = null, db = getDb() } = {}) {
  const ledger = getLedgerEndingBalance();
  if (ledger?.balance == null || !ledger?.asOf) {
    return null;
  }
  return captureBankReconcileAnchor({
    balance: ledger.balance,
    asOf: ledger.asOf,
    source,
    label,
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
  const liveLedger = getLedgerEndingBalance();
  const liveBalanceAtAnchor = anchor?.asOf
    ? getLedgerEndingBalance(anchor.asOf)
    : null;
  const liveBankImportRows = countBankImportRows();

  return compareBankReconcileStatus({
    anchor,
    liveBalanceAtAnchor,
    liveBankImportRows,
    liveLedger,
  });
}

function captureBankReconcileAfterAppend({ preview, ledgerEndingBalance, ledgerEndingAsOf, originalName }) {
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
  captureBankReconcileAfterAppend,
};
