const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");

const DEPOSIT_LEDGER_TYPES = [
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.DISTRIBUTION,
  TRANSACTION_TYPES.MEMBERSHIP_FEE,
];

const DEPOSIT_AND_WITHDRAWAL_TYPES = [
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
];

const DEPOSIT_WITHDRAWAL_FEE_TYPES = [
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.MEMBERSHIP_FEE,
];

function sumTransactions(memberId, types) {
  const db = getDb();
  const placeholders = types.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE member_id = ? AND type IN (${placeholders})`
    )
    .get(memberId, ...types).total;
}

function memberHasWithdrawal(memberId) {
  const db = getDb();
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM transactions
         WHERE member_id = ? AND type = ? LIMIT 1`
      )
      .get(memberId, TRANSACTION_TYPES.WITHDRAWAL)
  );
}

function memberHasDistribution(memberId) {
  const db = getDb();
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM transactions
         WHERE member_id = ? AND type = ? LIMIT 1`
      )
      .get(memberId, TRANSACTION_TYPES.DISTRIBUTION)
  );
}

/**
 * Member deposit account balance — sum of all bank-recorded deposit-account cashflows.
 */
function getMemberDepositAccountBalance(memberId) {
  return sumTransactions(memberId, DEPOSIT_LEDGER_TYPES);
}

function depositTransactionAffectsBalance(memberId, type) {
  return DEPOSIT_LEDGER_TYPES.includes(type);
}

function attachDepositRunningBalances(memberId, transactions) {
  const sorted = [...transactions].sort((a, b) => {
    const byDate = String(a.transaction_date).localeCompare(String(b.transaction_date));
    return byDate !== 0 ? byDate : a.id - b.id;
  });

  let balance = 0;
  const balanceById = new Map();
  for (const tx of sorted) {
    if (depositTransactionAffectsBalance(memberId, tx.type)) {
      balance += tx.amount;
    }
    balanceById.set(tx.id, balance);
  }

  return transactions.map((tx) => ({
    ...tx,
    balance_after: balanceById.get(tx.id) ?? balance,
  }));
}

function getMemberBalance(memberId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS balance
       FROM transactions WHERE member_id = ?`
    )
    .get(memberId);
  return row.balance;
}

function listMembersWithBalances() {
  const db = getDb();
  const members = db
    .prepare(
      `SELECT m.id, m.name, m.joined_at, m.membership_fee_paid
       FROM members m
       ORDER BY m.name`
    )
    .all();
  const txCountStmt = db.prepare(
    `SELECT COUNT(*) AS c FROM transactions WHERE member_id = ?`
  );
  return members.map((m) => ({
    ...m,
    balance: getMemberDepositAccountBalance(m.id),
    transaction_count: txCountStmt.get(m.id).c,
  }));
}

function getMemberTransactions(memberId, limit = 200) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM transactions
       WHERE member_id = ?
       ORDER BY transaction_date DESC, id DESC
       LIMIT ?`
    )
    .all(memberId, limit);
}

function addTransaction({
  memberId,
  type,
  amount,
  transactionDate,
  periodYear,
  periodMonth,
  description,
  reference,
  loanId,
  bankImportId,
  source = "manual",
}) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO transactions
        (member_id, type, amount, transaction_date, period_year, period_month,
         description, reference, loan_id, bank_import_id, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      memberId ?? null,
      type,
      amount,
      transactionDate,
      periodYear ?? null,
      periodMonth ?? null,
      description ?? null,
      reference ?? null,
      loanId ?? null,
      bankImportId ?? null,
      source
    );
  return result.lastInsertRowid;
}

function creditTypes() {
  return [
    TRANSACTION_TYPES.DEPOSIT,
    TRANSACTION_TYPES.DISTRIBUTION,
    TRANSACTION_TYPES.LOAN_OVERPAYMENT,
  ];
}

module.exports = {
  getMemberBalance,
  getMemberDepositAccountBalance,
  memberHasWithdrawal,
  memberHasDistribution,
  depositTransactionAffectsBalance,
  attachDepositRunningBalances,
  listMembersWithBalances,
  getMemberTransactions,
  addTransaction,
};
