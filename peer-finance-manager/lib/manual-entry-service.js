const { getDb } = require("../db/database");
const { addTransaction } = require("./balance-service");
const { TRANSACTION_TYPES, EXPENSE_CATEGORIES } = require("./constants");
const { createLoan, applyLoanRepayment } = require("./loan-service");

const DEPOSIT_ENTRY_TYPES = [
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.DISTRIBUTION,
];

function parsePeriodFromDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { periodYear: null, periodMonth: null };
  return { periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 };
}

function recordMemberDepositEntry({
  memberId,
  type,
  amount,
  transactionDate,
  description,
  reference,
}) {
  if (!memberId) throw new Error("Member is required");
  if (!DEPOSIT_ENTRY_TYPES.includes(type)) {
    throw new Error("Type must be deposit, withdrawal, or distribution");
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    throw new Error("Amount must be a non-zero number");
  }
  if (!transactionDate) throw new Error("Date is required");

  let signedAmount = numericAmount;
  if (type === TRANSACTION_TYPES.WITHDRAWAL && signedAmount > 0) {
    signedAmount = -signedAmount;
  }
  if (type === TRANSACTION_TYPES.DEPOSIT && signedAmount < 0) {
    signedAmount = Math.abs(signedAmount);
  }
  if (type === TRANSACTION_TYPES.DISTRIBUTION && signedAmount < 0) {
    signedAmount = Math.abs(signedAmount);
  }

  const { periodYear, periodMonth } = parsePeriodFromDate(transactionDate);
  const txId = addTransaction({
    memberId,
    type,
    amount: signedAmount,
    transactionDate,
    periodYear,
    periodMonth,
    description: description || defaultDescription(type, signedAmount),
    reference: reference || null,
    source: "manual",
  });

  return { transactionId: txId, amount: signedAmount };
}

function defaultDescription(type, amount) {
  if (type === TRANSACTION_TYPES.DEPOSIT) return "Manual deposit";
  if (type === TRANSACTION_TYPES.WITHDRAWAL) return "Manual withdrawal";
  if (type === TRANSACTION_TYPES.DISTRIBUTION) return "Manual distribution credit";
  return "Manual entry";
}

function recordExpense({ description, amount, expenseDate, category }) {
  const numericAmount = Number(amount);
  if (!description?.trim()) throw new Error("Description is required");
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Amount must be greater than zero");
  }
  if (!expenseDate) throw new Error("Date is required");

  const cat = (category || "Other").trim();
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO expenses (description, amount, expense_date, category)
       VALUES (?, ?, ?, ?)`
    )
    .run(description.trim(), numericAmount, expenseDate, cat);

  addTransaction({
    memberId: null,
    type: TRANSACTION_TYPES.EXPENSE,
    amount: -Math.abs(numericAmount),
    transactionDate: expenseDate,
    description: `${cat}: ${description.trim()}`,
    reference: `expense-${result.lastInsertRowid}`,
    source: "manual",
  });

  return { expenseId: result.lastInsertRowid };
}

function listExpenses(limit = 100) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM expenses ORDER BY expense_date DESC, id DESC LIMIT ?`
    )
    .all(limit);
}

function getExpenseCategories() {
  return [...EXPENSE_CATEGORIES];
}

function createManualLoan(payload) {
  const loanId = createLoan(payload);
  const db = getDb();
  const loan = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId);

  addTransaction({
    memberId: loan.borrower_id,
    type: TRANSACTION_TYPES.LOAN_DISBURSEMENT,
    amount: -Math.abs(loan.principal),
    transactionDate: loan.start_date,
    description: `Loan #${loanId} disbursement`,
    loanId,
    source: "manual",
  });

  return { loanId };
}

function recordManualLoanRepayment({ loanId, amount, paymentDate, description }) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Repayment amount must be greater than zero");
  }
  if (!paymentDate) throw new Error("Payment date is required");

  return applyLoanRepayment({
    loanId,
    amount: numericAmount,
    paymentDate,
    description,
    source: "manual",
  });
}

module.exports = {
  recordMemberDepositEntry,
  recordExpense,
  listExpenses,
  getExpenseCategories,
  createManualLoan,
  recordManualLoanRepayment,
  DEPOSIT_ENTRY_TYPES,
};
