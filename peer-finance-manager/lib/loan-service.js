const { getDb } = require("../db/database");
const {
  DEFAULT_LOAN_ANNUAL_RATE,
  DEFAULT_LOAN_TERM_MONTHS,
  MIN_MEMBERSHIP_MONTHS_FOR_LOAN,
  REQUIRED_GUARANTORS,
  LATE_FEE_AMOUNT,
  TRANSACTION_TYPES,
} = require("./constants");
const { getMemberBalance } = require("./balance-service");
const { addMonths, monthsBetween } = require("./dates");
const { addTransaction } = require("./balance-service");
const {
  snapshotCurrentPolicy,
  getPolicyForLoanRow,
  assessLateFeeOnce,
} = require("./loan-policy-service");

function getMemberDepositTotal(memberId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE member_id = ? AND type IN ('deposit', 'distribution')`
    )
    .get(memberId);
  return row.total;
}

function isEligibleForLoan(memberId, asOfDate) {
  const db = getDb();
  const member = db.prepare(`SELECT * FROM members WHERE id = ?`).get(memberId);
  if (!member) return { eligible: false, reason: "Member not found" };
  if (!member.joined_at) {
    return { eligible: false, reason: "Member join date unknown" };
  }
  const months = monthsBetween(member.joined_at, asOfDate);
  if (months < MIN_MEMBERSHIP_MONTHS_FOR_LOAN) {
    return {
      eligible: false,
      reason: `Member must be active for at least ${MIN_MEMBERSHIP_MONTHS_FOR_LOAN} months`,
    };
  }
  return { eligible: true };
}

function maxLoanAmount(borrowerId, guarantor1Id, guarantor2Id) {
  const borrowerDeposits = getMemberDepositTotal(borrowerId);
  const g1 = getMemberDepositTotal(guarantor1Id);
  const g2 = getMemberDepositTotal(guarantor2Id);
  const guarantorPool = g1 + g2;
  return Math.min(borrowerDeposits, guarantorPool);
}

function validateLoanApplication({
  borrowerId,
  principal,
  guarantor1Id,
  guarantor2Id,
  startDate,
}) {
  const errors = [];
  if (!borrowerId) errors.push("Borrower required");
  if (!guarantor1Id || !guarantor2Id) {
    errors.push(`${REQUIRED_GUARANTORS} guarantors required`);
  }
  if (guarantor1Id === borrowerId || guarantor2Id === borrowerId) {
    errors.push("Borrower cannot be their own guarantor");
  }
  if (guarantor1Id === guarantor2Id) {
    errors.push("Guarantors must be different members");
  }

  const { assertActiveDirectoryMember } = require("./membership-status-service");
  try {
    if (borrowerId) {
      assertActiveDirectoryMember(borrowerId, { action: "New loans" });
    }
    if (guarantor1Id) {
      assertActiveDirectoryMember(guarantor1Id, { action: "Serving as guarantor" });
    }
    if (guarantor2Id) {
      assertActiveDirectoryMember(guarantor2Id, { action: "Serving as guarantor" });
    }
  } catch (err) {
    errors.push(err.message);
  }

  const eligibility = isEligibleForLoan(borrowerId, startDate);
  if (!eligibility.eligible) errors.push(eligibility.reason);

  const maxAmount = maxLoanAmount(borrowerId, guarantor1Id, guarantor2Id);
  if (principal > maxAmount) {
    errors.push(
      `Loan amount exceeds maximum allowed (${maxAmount.toFixed(2)}). ` +
        `Cannot exceed borrower contributions or combined guarantor contributions.`
    );
  }

  return { valid: errors.length === 0, errors, maxAmount };
}

function generateAmortizationSchedule(principal, annualRate, termMonths, startDate) {
  const monthlyRate = annualRate / 12;
  const payment =
    monthlyRate === 0
      ? principal / termMonths
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
        (Math.pow(1 + monthlyRate, termMonths) - 1);

  let balance = principal;
  const installments = [];

  for (let i = 1; i <= termMonths; i++) {
    const interest = balance * monthlyRate;
    const principalPart = payment - interest;
    balance = Math.max(0, balance - principalPart);
    const dueDate = addMonths(startDate, i);
    installments.push({
      installmentNumber: i,
      dueDate,
      principalDue: principalPart,
      interestDue: interest,
      totalDue: payment,
    });
  }

  return installments;
}

function createLoan({
  borrowerId,
  principal,
  annualRate = DEFAULT_LOAN_ANNUAL_RATE,
  termMonths = DEFAULT_LOAN_TERM_MONTHS,
  startDate,
  guarantor1Id,
  guarantor2Id,
  notes,
}) {
  const validation = validateLoanApplication({
    borrowerId,
    principal,
    guarantor1Id,
    guarantor2Id,
    startDate,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  const db = getDb();
  const schedule = generateAmortizationSchedule(
    principal,
    annualRate,
    termMonths,
    startDate
  );
  const policySnap = snapshotCurrentPolicy();

  const create = db.transaction(() => {
    const loanResult = db
      .prepare(
        `INSERT INTO loans
          (borrower_id, principal, annual_rate, term_months, start_date,
           guarantor1_id, guarantor2_id, schedule_imported, notes,
           repayment_policy, late_fee_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .run(
        borrowerId,
        principal,
        annualRate,
        termMonths,
        startDate,
        guarantor1Id,
        guarantor2Id,
        notes ?? null,
        policySnap.repaymentPolicy,
        policySnap.lateFeeAmount
      );
    const loanId = loanResult.lastInsertRowid;

    const insertInst = db.prepare(
      `INSERT INTO loan_installments
        (loan_id, installment_number, due_date, principal_due, interest_due, total_due)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const inst of schedule) {
      insertInst.run(
        loanId,
        inst.installmentNumber,
        inst.dueDate,
        inst.principalDue,
        inst.interestDue,
        inst.totalDue
      );
    }

    return loanId;
  });

  return create();
}

function importLoanSchedule(loanId, rows) {
  const db = getDb();
  const loan = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId);
  if (!loan) throw new Error("Loan not found");

  const importTx = db.transaction(() => {
    db.prepare(`DELETE FROM loan_installments WHERE loan_id = ?`).run(loanId);
    const insert = db.prepare(
      `INSERT INTO loan_installments
        (loan_id, installment_number, due_date, principal_due, interest_due, total_due, paid_amount, paid_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    rows.forEach((row, idx) => {
      insert.run(
        loanId,
        row.installmentNumber ?? idx + 1,
        row.dueDate,
        row.principalDue ?? 0,
        row.interestDue ?? 0,
        row.totalDue,
        row.paidAmount ?? 0,
        row.paidDate ?? null
      );
    });
    db.prepare(`UPDATE loans SET schedule_imported = 1 WHERE id = ?`).run(loanId);
  });
  importTx();
}

function applyLoanRepayment({
  loanId,
  amount,
  paymentDate,
  bankImportId,
  source = "manual",
  description,
}) {
  const db = getDb();
  const loan = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId);
  if (!loan) throw new Error("Loan not found");
  const policy = getPolicyForLoanRow(loan);

  const pending = db
    .prepare(
      `SELECT * FROM loan_installments
       WHERE loan_id = ? AND paid_amount < total_due
       ORDER BY installment_number`
    )
    .all(loanId);

  let remaining = amount;
  const allocations = [];
  const lateFees = [];

  for (const inst of pending) {
    if (remaining <= 0) break;
    const owed = inst.total_due - inst.paid_amount;
    const applied = Math.min(remaining, owed);
    const newPaid = inst.paid_amount + applied;
    db.prepare(
      `UPDATE loan_installments SET paid_amount = ?, paid_date = ? WHERE id = ?`
    ).run(newPaid, paymentDate, inst.id);
    remaining -= applied;
    allocations.push({ installmentId: inst.id, applied });

    if (policy.isStrict && applied > 0.005) {
      const assessed = assessLateFeeOnce({
        loanId,
        installmentId: inst.id,
        periodDueDate: inst.due_date,
        amount: policy.lateFeeAmount,
        paymentDate,
        memberId: loan.borrower_id,
        description: `Late fee: Loan #${loanId} installment due ${String(inst.due_date).slice(0, 10)}`,
      });
      if (assessed) lateFees.push(assessed);
    }
  }

  const repaymentAmount = amount - remaining;
  if (repaymentAmount > 0) {
    addTransaction({
      memberId: null,
      type: TRANSACTION_TYPES.LOAN_REPAYMENT,
      amount: repaymentAmount,
      transactionDate: paymentDate,
      description: description || `Loan #${loanId} repayment`,
      loanId,
      bankImportId,
      source: bankImportId ? "bank_import" : source,
    });
  }

  if (remaining > 0) {
    addTransaction({
      memberId: loan.borrower_id,
      type: TRANSACTION_TYPES.LOAN_OVERPAYMENT,
      amount: remaining,
      transactionDate: paymentDate,
      description: `Loan #${loanId} overpayment credited to member`,
      loanId,
      bankImportId,
      source: bankImportId ? "bank_import" : source,
    });
  }

  const unpaid = db
    .prepare(
      `SELECT COUNT(*) AS c FROM loan_installments
       WHERE loan_id = ? AND paid_amount < total_due`
    )
    .get(loanId);
  if (unpaid.c === 0) {
    db.prepare(`UPDATE loans SET status = 'paid_off' WHERE id = ?`).run(loanId);
  }

  return { allocations, overpayment: remaining, lateFees };
}

function calculateLateFee(dueDate, asOfDate, feeAmount = LATE_FEE_AMOUNT) {
  if (!dueDate || !asOfDate) return 0;
  const due = String(dueDate).slice(0, 10);
  const asOf = String(asOfDate).slice(0, 10);
  if (!due || !asOf || asOf <= due) return 0;
  return Number(feeAmount) || LATE_FEE_AMOUNT;
}

function listLoans(status) {
  const db = getDb();
  const sql = status
    ? `SELECT l.*, m.name AS borrower_name FROM loans l
       JOIN members m ON m.id = l.borrower_id WHERE l.status = ? ORDER BY l.id DESC`
    : `SELECT l.*, m.name AS borrower_name FROM loans l
       JOIN members m ON m.id = l.borrower_id ORDER BY l.id DESC`;
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

module.exports = {
  isEligibleForLoan,
  maxLoanAmount,
  validateLoanApplication,
  generateAmortizationSchedule,
  createLoan,
  importLoanSchedule,
  applyLoanRepayment,
  calculateLateFee,
  listLoans,
  getMemberDepositTotal,
};
