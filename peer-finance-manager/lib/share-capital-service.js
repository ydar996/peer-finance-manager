/**
 * Optional member Share Capital accounts.
 * Cooperatives that issue shares (common in Nigeria) enable this in Membership Policy.
 * Disabled by default: the account, balances, record form, and import types stay hidden.
 */
const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  getCooperativeSetting,
  setCooperativeSetting,
} = require("./cooperative-settings");
const { TRANSACTION_TYPES } = require("./constants");

const SETTING_SHARE_CAPITAL_ENABLED = "share_capital_enabled";

const SHARE_CAPITAL_TYPES = [
  TRANSACTION_TYPES.SHARE_CAPITAL,
  TRANSACTION_TYPES.SHARE_CAPITAL_REDEMPTION,
];

function isShareCapitalEnabled() {
  try {
    return getCooperativeSetting(SETTING_SHARE_CAPITAL_ENABLED) === "1";
  } catch (_) {
    return false;
  }
}

function setShareCapitalEnabled(enabled) {
  const db = getDb();
  ensureSettingsTable(db);
  setCooperativeSetting(db, SETTING_SHARE_CAPITAL_ENABLED, enabled ? "1" : "0");
  return isShareCapitalEnabled();
}

function assertShareCapitalEnabled() {
  if (!isShareCapitalEnabled()) {
    throw new Error(
      "Share Capital accounts are not enabled for this Cooperative. Turn them on in Record: Membership Policy."
    );
  }
}

function getMemberShareCapitalBalance(memberId) {
  const db = getDb();
  const placeholders = SHARE_CAPITAL_TYPES.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE member_id = ? AND type IN (${placeholders})`
    )
    .get(memberId, ...SHARE_CAPITAL_TYPES).total;
}

function getTotalShareCapital() {
  const db = getDb();
  const placeholders = SHARE_CAPITAL_TYPES.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE type IN (${placeholders})`
    )
    .get(...SHARE_CAPITAL_TYPES).total;
}

function attachShareCapitalRunningBalances(transactions) {
  const sorted = [...transactions].sort((a, b) => {
    const byDate = String(a.transaction_date).localeCompare(String(b.transaction_date));
    return byDate !== 0 ? byDate : a.id - b.id;
  });
  let balance = 0;
  const balanceById = new Map();
  for (const tx of sorted) {
    balance += tx.amount;
    balanceById.set(tx.id, balance);
  }
  return transactions.map((tx) => ({
    ...tx,
    balance_after: balanceById.get(tx.id) ?? balance,
  }));
}

function parsePeriodFromDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { periodYear: null, periodMonth: null };
  return { periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 };
}

/**
 * Record a share purchase (credit) or redemption (debit) on a member's
 * share capital account. Redemptions may settle a former member account;
 * purchases are active-only, mirroring contribution rules.
 */
function recordMemberShareCapitalEntry({
  memberId,
  direction,
  amount,
  transactionDate,
  description,
  reference,
}) {
  assertShareCapitalEnabled();
  if (!memberId) throw new Error("Member is required");
  const isRedemption = direction === "redemption";
  const type = isRedemption
    ? TRANSACTION_TYPES.SHARE_CAPITAL_REDEMPTION
    : TRANSACTION_TYPES.SHARE_CAPITAL;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    throw new Error("Amount must be a non-zero number");
  }
  if (!transactionDate) throw new Error("Date is required");

  if (!isRedemption) {
    const { assertActiveDirectoryMember } = require("./membership-status-service");
    assertActiveDirectoryMember(memberId, { action: "Share Capital Purchases" });
  }

  const signedAmount = isRedemption
    ? -Math.abs(numericAmount)
    : Math.abs(numericAmount);

  const { periodYear, periodMonth } = parsePeriodFromDate(transactionDate);
  const { addTransaction } = require("./balance-service");
  const txId = addTransaction({
    memberId,
    type,
    amount: signedAmount,
    transactionDate,
    periodYear,
    periodMonth,
    description:
      description ||
      (isRedemption ? "Share capital redemption" : "Share capital purchase"),
    reference: reference || null,
    source: "manual",
  });

  const { queueCooperativeBankLedgerCsvSync } = require("./cooperative-bank-ledger-csv");
  queueCooperativeBankLedgerCsvSync("manual_share_capital_entry");
  return { transactionId: txId, amount: signedAmount };
}

module.exports = {
  SETTING_SHARE_CAPITAL_ENABLED,
  SHARE_CAPITAL_TYPES,
  isShareCapitalEnabled,
  setShareCapitalEnabled,
  assertShareCapitalEnabled,
  getMemberShareCapitalBalance,
  getTotalShareCapital,
  attachShareCapitalRunningBalances,
  recordMemberShareCapitalEntry,
};
