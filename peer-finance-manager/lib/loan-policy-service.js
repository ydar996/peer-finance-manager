const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  getCooperativeSetting,
  setCooperativeSetting,
} = require("./cooperative-settings");
const { LATE_FEE_AMOUNT, TRANSACTION_TYPES } = require("./constants");

const POLICY_FLEXIBLE = "flexible";
const POLICY_STRICT = "strict";
const SETTING_MODE = "loan_repayment_policy";
const SETTING_LATE_FEE = "loan_late_fee_amount";

function ensureLoanPolicySchema(database) {
  const db = database || getDb();
  ensureSettingsTable(db);

  const loanCols = db.prepare(`PRAGMA table_info(loans)`).all().map((c) => c.name);
  if (!loanCols.includes("repayment_policy")) {
    db.exec(
      `ALTER TABLE loans ADD COLUMN repayment_policy TEXT NOT NULL DEFAULT 'flexible'`
    );
  }
  if (!loanCols.includes("late_fee_amount")) {
    db.exec(`ALTER TABLE loans ADD COLUMN late_fee_amount REAL NOT NULL DEFAULT 25`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS loan_policy_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      disbursement_tx_id INTEGER UNIQUE,
      loan_id INTEGER,
      member_id INTEGER,
      disbursement_date TEXT NOT NULL,
      principal REAL NOT NULL,
      repayment_policy TEXT NOT NULL DEFAULT 'flexible',
      late_fee_amount REAL NOT NULL DEFAULT 25,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loan_late_fee_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER,
      installment_id INTEGER,
      disbursement_tx_id INTEGER,
      period_due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      transaction_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  try {
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_late_fee_loan_inst
       ON loan_late_fee_events(loan_id, installment_id)
       WHERE loan_id IS NOT NULL AND installment_id IS NOT NULL`
    );
  } catch (_) {}
  try {
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_late_fee_disb_due
       ON loan_late_fee_events(disbursement_tx_id, period_due_date)
       WHERE disbursement_tx_id IS NOT NULL`
    );
  } catch (_) {}
}

function normalizeMode(value) {
  const mode = String(value || "")
    .trim()
    .toLowerCase();
  return mode === POLICY_STRICT ? POLICY_STRICT : POLICY_FLEXIBLE;
}

function normalizeLateFeeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return LATE_FEE_AMOUNT;
  return Math.round(n * 100) / 100;
}

function getLoanPaymentPolicy() {
  const mode = normalizeMode(getCooperativeSetting(SETTING_MODE) || POLICY_FLEXIBLE);
  const rawFee = getCooperativeSetting(SETTING_LATE_FEE);
  const lateFeeAmount =
    rawFee == null || rawFee === ""
      ? LATE_FEE_AMOUNT
      : normalizeLateFeeAmount(rawFee);
  return {
    mode,
    lateFeeAmount,
    isStrict: mode === POLICY_STRICT,
    labels: {
      flexible: "Flexible: Pay Within Loan Term (No Late Fee)",
      strict: "Strict Timelines: Late Fee When Past Due",
    },
  };
}

function setLoanPaymentPolicy({ mode, lateFeeAmount } = {}) {
  const db = getDb();
  ensureLoanPolicySchema(db);
  if (mode != null) {
    setCooperativeSetting(db, SETTING_MODE, normalizeMode(mode));
  }
  if (lateFeeAmount != null) {
    setCooperativeSetting(db, SETTING_LATE_FEE, String(normalizeLateFeeAmount(lateFeeAmount)));
  }
  return getLoanPaymentPolicy();
}

function snapshotCurrentPolicy() {
  const policy = getLoanPaymentPolicy();
  return {
    repaymentPolicy: policy.mode,
    lateFeeAmount: policy.lateFeeAmount,
  };
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function isPaymentLate(dueDate, paymentDate) {
  const due = dateOnly(dueDate);
  const paid = dateOnly(paymentDate);
  if (!due || !paid) return false;
  return paid > due;
}

/**
 * Snapshot policy at disbursement time. Existing rows without a snapshot stay flexible forever.
 * New disbursements capture whatever the Cooperative currently has selected.
 */
function recordDisbursementPolicySnapshot({
  disbursementTxId,
  loanId = null,
  memberId = null,
  disbursementDate,
  principal,
  policyOverride = null,
}) {
  if (!disbursementTxId && !loanId) return null;
  const db = getDb();
  ensureLoanPolicySchema(db);
  const date = dateOnly(disbursementDate) || null;
  const principalAbs = Math.abs(Number(principal) || 0);

  if (disbursementTxId) {
    const existing = db
      .prepare(`SELECT * FROM loan_policy_snapshots WHERE disbursement_tx_id = ?`)
      .get(disbursementTxId);
    if (existing) return existing;
  }

  // Preserve policy across Full Ledger Refresh (new transaction ids, same disbursement).
  if (memberId && date) {
    const byNaturalKey = db
      .prepare(
        `SELECT * FROM loan_policy_snapshots
         WHERE member_id = ?
           AND disbursement_date = ?
           AND ABS(principal - ?) < 0.015
         ORDER BY id ASC
         LIMIT 1`
      )
      .get(memberId, date, principalAbs);
    if (byNaturalKey) {
      if (disbursementTxId && byNaturalKey.disbursement_tx_id !== disbursementTxId) {
        db.prepare(
          `UPDATE loan_policy_snapshots SET disbursement_tx_id = ?, loan_id = COALESCE(?, loan_id)
           WHERE id = ?`
        ).run(disbursementTxId, loanId, byNaturalKey.id);
      }
      return db.prepare(`SELECT * FROM loan_policy_snapshots WHERE id = ?`).get(byNaturalKey.id);
    }
  }

  const snap = policyOverride || snapshotCurrentPolicy();
  const info = db
    .prepare(
      `INSERT INTO loan_policy_snapshots
        (disbursement_tx_id, loan_id, member_id, disbursement_date, principal,
         repayment_policy, late_fee_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      disbursementTxId ?? null,
      loanId ?? null,
      memberId ?? null,
      date,
      principalAbs,
      snap.repaymentPolicy,
      snap.lateFeeAmount
    );

  return db.prepare(`SELECT * FROM loan_policy_snapshots WHERE id = ?`).get(info.lastInsertRowid);
}

function getPolicyForLoanRow(loan) {
  if (!loan) {
    return { repaymentPolicy: POLICY_FLEXIBLE, lateFeeAmount: LATE_FEE_AMOUNT, isStrict: false };
  }
  const repaymentPolicy = normalizeMode(loan.repayment_policy || POLICY_FLEXIBLE);
  const lateFeeAmount = normalizeLateFeeAmount(
    loan.late_fee_amount != null ? loan.late_fee_amount : LATE_FEE_AMOUNT
  );
  return {
    repaymentPolicy,
    lateFeeAmount,
    isStrict: repaymentPolicy === POLICY_STRICT,
  };
}

function getPolicyForDisbursement(disbursementTxId) {
  if (!disbursementTxId) {
    return { repaymentPolicy: POLICY_FLEXIBLE, lateFeeAmount: LATE_FEE_AMOUNT, isStrict: false };
  }
  const db = getDb();
  ensureLoanPolicySchema(db);
  const row = db
    .prepare(`SELECT * FROM loan_policy_snapshots WHERE disbursement_tx_id = ?`)
    .get(disbursementTxId);
  if (!row) {
    return { repaymentPolicy: POLICY_FLEXIBLE, lateFeeAmount: LATE_FEE_AMOUNT, isStrict: false };
  }
  return {
    repaymentPolicy: normalizeMode(row.repayment_policy),
    lateFeeAmount: normalizeLateFeeAmount(row.late_fee_amount),
    isStrict: normalizeMode(row.repayment_policy) === POLICY_STRICT,
  };
}

function sumAssessedLateFeesForDisbursement(disbursementTxId) {
  if (!disbursementTxId) return 0;
  const db = getDb();
  ensureLoanPolicySchema(db);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM loan_late_fee_events
       WHERE disbursement_tx_id = ?`
    )
    .get(disbursementTxId);
  return Number(row?.total) || 0;
}

function sumAssessedLateFeesForLoan(loanId) {
  if (!loanId) return 0;
  const db = getDb();
  ensureLoanPolicySchema(db);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM loan_late_fee_events
       WHERE loan_id = ?`
    )
    .get(loanId);
  return Number(row?.total) || 0;
}

function assessLateFeeOnce({
  loanId = null,
  installmentId = null,
  disbursementTxId = null,
  periodDueDate,
  amount,
  paymentDate,
  memberId,
  description,
}) {
  const db = getDb();
  ensureLoanPolicySchema(db);
  const fee = normalizeLateFeeAmount(amount);
  if (fee <= 0.005) return null;
  if (!memberId) return null;
  if (!isPaymentLate(periodDueDate, paymentDate)) return null;

  if (loanId && installmentId) {
    const existing = db
      .prepare(
        `SELECT id FROM loan_late_fee_events WHERE loan_id = ? AND installment_id = ?`
      )
      .get(loanId, installmentId);
    if (existing) return null;
  } else if (disbursementTxId && periodDueDate) {
    const existing = db
      .prepare(
        `SELECT id FROM loan_late_fee_events
         WHERE disbursement_tx_id = ? AND period_due_date = ?`
      )
      .get(disbursementTxId, dateOnly(periodDueDate));
    if (existing) return null;
  } else {
    return null;
  }

  const info = db
    .prepare(
      `INSERT INTO transactions
        (member_id, type, amount, transaction_date, description, loan_id, source)
       VALUES (?, ?, ?, ?, ?, ?, 'system')`
    )
    .run(
      memberId,
      TRANSACTION_TYPES.LATE_FEE,
      -Math.abs(fee),
      dateOnly(paymentDate),
      description ||
        `Late fee for payment after due date ${dateOnly(periodDueDate)}`,
      loanId ?? null
    );
  const txId = info.lastInsertRowid;

  db.prepare(
    `INSERT INTO loan_late_fee_events
      (loan_id, installment_id, disbursement_tx_id, period_due_date, amount, payment_date, transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    loanId ?? null,
    installmentId ?? null,
    disbursementTxId ?? null,
    dateOnly(periodDueDate),
    fee,
    dateOnly(paymentDate),
    txId
  );

  if (installmentId) {
    db.prepare(
      `UPDATE loan_installments SET late_fee_applied = ? WHERE id = ?`
    ).run(fee, installmentId);
  }

  return { transactionId: txId, amount: fee, periodDueDate: dateOnly(periodDueDate) };
}

/**
 * For workbook/bank lots: when a repayment covers a schedule period after its due date, charge once.
 */
function assessLateFeesForBankLot({ lot, memberId, memberName }) {
  const policy = getPolicyForDisbursement(lot.disbursementId);
  if (!policy.isStrict) return [];
  const schedule = Array.isArray(lot.schedule) ? lot.schedule : [];
  if (!schedule.length || !lot.repayments?.length) return [];

  const events = [];
  const repayments = [...lot.repayments].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  let cumulativeBefore = 0;
  for (const repayment of repayments) {
    const paidBefore = cumulativeBefore;
    cumulativeBefore =
      Math.round((cumulativeBefore + (Number(repayment.amount) || 0)) * 100) / 100;
    let periodCursor = 0;
    for (const period of schedule) {
      const totalDue =
        Number(period.totalDue) ||
        Math.round(((Number(period.interest) || 0) + (Number(period.principal) || 0)) * 100) /
          100;
      const periodStart = periodCursor;
      const periodEnd = Math.round((periodCursor + totalDue) * 100) / 100;
      periodCursor = periodEnd;

      const newlyCovered =
        paidBefore < periodEnd - 0.005 && cumulativeBefore >= periodStart + 0.005;
      if (!newlyCovered) continue;
      if (!isPaymentLate(period.dueDate, repayment.date)) continue;

      const assessed = assessLateFeeOnce({
        disbursementTxId: lot.disbursementId,
        periodDueDate: period.dueDate,
        amount: policy.lateFeeAmount,
        paymentDate: repayment.date,
        memberId,
        description: `Late fee: ${memberName || "Member"} loan payment after due ${dateOnly(
          period.dueDate
        )}`,
      });
      if (assessed) events.push(assessed);
    }
  }
  return events;
}

module.exports = {
  POLICY_FLEXIBLE,
  POLICY_STRICT,
  ensureLoanPolicySchema,
  getLoanPaymentPolicy,
  setLoanPaymentPolicy,
  snapshotCurrentPolicy,
  recordDisbursementPolicySnapshot,
  getPolicyForLoanRow,
  getPolicyForDisbursement,
  isPaymentLate,
  assessLateFeeOnce,
  assessLateFeesForBankLot,
  sumAssessedLateFeesForDisbursement,
  sumAssessedLateFeesForLoan,
};
