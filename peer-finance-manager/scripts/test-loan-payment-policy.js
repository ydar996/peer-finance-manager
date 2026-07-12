#!/usr/bin/env node
/**
 * Loan payment policy: flexible default, strict late fees, historical loans unchanged.
 * Run: node peer-finance-manager/scripts/test-loan-payment-policy.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-loan-policy-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb } = require("../db/database");
const {
  POLICY_FLEXIBLE,
  POLICY_STRICT,
  getLoanPaymentPolicy,
  setLoanPaymentPolicy,
  isPaymentLate,
  getPolicyForLoanRow,
  getPolicyForDisbursement,
  recordDisbursementPolicySnapshot,
  assessLateFeeOnce,
  ensureLoanPolicySchema,
} = require("../lib/loan-policy-service");
const { createLoan, applyLoanRepayment } = require("../lib/loan-service");
const { addTransaction } = require("../lib/balance-service");

const ORG = "policy-test-coop";

function seedMembers(db) {
  const insert = db.prepare(
    `INSERT INTO members (name, joined_at) VALUES (?, ?)`
  );
  const borrowerId = insert.run("Borrower One", "2020-01-01").lastInsertRowid;
  const g1 = insert.run("Guarantor One", "2020-01-01").lastInsertRowid;
  const g2 = insert.run("Guarantor Two", "2020-01-01").lastInsertRowid;
  const deposit = db.prepare(
    `INSERT INTO transactions
      (member_id, type, amount, transaction_date, description, source)
     VALUES (?, 'deposit', ?, '2020-02-01', 'seed', 'manual')`
  );
  deposit.run(borrowerId, 5000);
  deposit.run(g1, 5000);
  deposit.run(g2, 5000);
  return { borrowerId, g1, g2 };
}

function testIsPaymentLate() {
  assert.strictEqual(isPaymentLate("2026-05-10", "2026-05-10"), false);
  assert.strictEqual(isPaymentLate("2026-05-10", "2026-05-09"), false);
  assert.strictEqual(isPaymentLate("2026-05-10", "2026-05-14"), true);
  console.log("  isPaymentLate: OK");
}

function testFlexibleDefaultAndSnapshot() {
  runWithOrg(ORG, () => {
    openOrgDatabase(ORG);
    const db = require("../db/database").getDb();
    ensureLoanPolicySchema(db);
    const members = seedMembers(db);

    const policy = getLoanPaymentPolicy();
    assert.strictEqual(policy.mode, POLICY_FLEXIBLE);
    assert.strictEqual(policy.lateFeeAmount, 25);

    const loanId = createLoan({
      borrowerId: members.borrowerId,
      principal: 1000,
      annualRate: 0.08,
      termMonths: 2,
      startDate: "2026-01-01",
      guarantor1Id: members.g1,
      guarantor2Id: members.g2,
    });
    const loan = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId);
    assert.strictEqual(loan.repayment_policy, POLICY_FLEXIBLE);

    setLoanPaymentPolicy({ mode: POLICY_STRICT, lateFeeAmount: 30 });
    assert.strictEqual(getLoanPaymentPolicy().mode, POLICY_STRICT);
    assert.strictEqual(getLoanPaymentPolicy().lateFeeAmount, 30);

    const loanId2 = createLoan({
      borrowerId: members.borrowerId,
      principal: 500,
      annualRate: 0.08,
      termMonths: 2,
      startDate: "2026-03-01",
      guarantor1Id: members.g1,
      guarantor2Id: members.g2,
    });
    const loan2 = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId2);
    assert.strictEqual(loan2.repayment_policy, POLICY_STRICT);
    assert.strictEqual(loan2.late_fee_amount, 30);

    // Historical loan stays flexible after toggle.
    const loanAgain = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId);
    assert.strictEqual(loanAgain.repayment_policy, POLICY_FLEXIBLE);
    assert.strictEqual(getPolicyForLoanRow(loanAgain).isStrict, false);

    setLoanPaymentPolicy({ mode: POLICY_FLEXIBLE, lateFeeAmount: 25 });
    const loan2Again = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(loanId2);
    assert.strictEqual(loan2Again.repayment_policy, POLICY_STRICT);

    closeDb(ORG);
  });
  console.log("  flexible default + per-loan snapshot: OK");
}

function testStrictLateFeeOnRepayment() {
  const org = "policy-test-strict";
  runWithOrg(org, () => {
    openOrgDatabase(org);
    const db = require("../db/database").getDb();
    ensureLoanPolicySchema(db);
    const members = seedMembers(db);
    setLoanPaymentPolicy({ mode: POLICY_STRICT, lateFeeAmount: 25 });

    const loanId = createLoan({
      borrowerId: members.borrowerId,
      principal: 1200,
      annualRate: 0,
      termMonths: 2,
      startDate: "2026-01-01",
      guarantor1Id: members.g1,
      guarantor2Id: members.g2,
    });

    const inst = db
      .prepare(
        `SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY installment_number LIMIT 1`
      )
      .get(loanId);

    const result = applyLoanRepayment({
      loanId,
      amount: inst.total_due,
      paymentDate: "2026-03-14",
      source: "manual",
    });
    assert.ok(result.lateFees.length === 1, "expected one late fee");
    assert.strictEqual(result.lateFees[0].amount, 25);

    const feeTx = db
      .prepare(`SELECT * FROM transactions WHERE type = 'late_fee' AND loan_id = ?`)
      .get(loanId);
    assert.ok(feeTx, "late_fee transaction created");
    assert.strictEqual(Math.abs(feeTx.amount), 25);

    const feeCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM loan_late_fee_events WHERE loan_id = ? AND installment_id = ?`
      )
      .get(loanId, inst.id);
    assert.strictEqual(feeCount.c, 1);

    const inst2 = db
      .prepare(
        `SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY installment_number LIMIT 1 OFFSET 1`
      )
      .get(loanId);
    const onTime = applyLoanRepayment({
      loanId,
      amount: inst2.total_due,
      paymentDate: inst2.due_date,
      source: "manual",
    });
    assert.strictEqual(onTime.lateFees.length, 0, "on-time installment has no late fee");

    const again = applyLoanRepayment({
      loanId,
      amount: 1,
      paymentDate: "2026-12-31",
      source: "manual",
    });
    // Loan may already be paid off; either way installment 1 must not get a second fee.
    const feeCountAgain = db
      .prepare(
        `SELECT COUNT(*) AS c FROM loan_late_fee_events WHERE loan_id = ? AND installment_id = ?`
      )
      .get(loanId, inst.id);
    assert.strictEqual(feeCountAgain.c, 1, "no double late fee on same installment");
    void again;

    closeDb(org);
  });
  console.log("  strict late fee on late repayment: OK");
}

function testDisbursementSnapshotNotRetroactive() {
  const org = "policy-test-disb";
  runWithOrg(org, () => {
    openOrgDatabase(org);
    const db = require("../db/database").getDb();
    ensureLoanPolicySchema(db);
    const members = seedMembers(db);

    setLoanPaymentPolicy({ mode: POLICY_FLEXIBLE, lateFeeAmount: 25 });
    const txId = addTransaction({
      memberId: members.borrowerId,
      type: "loan_disbursement",
      amount: -2000,
      transactionDate: "2025-06-01",
      description: "Old loan",
      source: "manual",
    });
    recordDisbursementPolicySnapshot({
      disbursementTxId: txId,
      memberId: members.borrowerId,
      disbursementDate: "2025-06-01",
      principal: 2000,
    });
    const snap1 = require("../db/database")
      .getDb()
      .prepare(`SELECT * FROM loan_policy_snapshots WHERE disbursement_tx_id = ?`)
      .get(txId);
    assert.ok(snap1, "first disbursement snapshot exists");
    assert.strictEqual(snap1.repayment_policy, POLICY_FLEXIBLE);
    assert.strictEqual(getPolicyForDisbursement(txId).isStrict, false);

    setLoanPaymentPolicy({ mode: POLICY_STRICT, lateFeeAmount: 40 });
    const txId2 = addTransaction({
      memberId: members.borrowerId,
      type: "loan_disbursement",
      amount: -1500,
      transactionDate: "2026-07-01",
      description: "New loan",
      source: "manual",
    });
    recordDisbursementPolicySnapshot({
      disbursementTxId: txId2,
      memberId: members.borrowerId,
      disbursementDate: "2026-07-01",
      principal: 1500,
    });
    assert.strictEqual(getPolicyForDisbursement(txId2).isStrict, true);
    assert.strictEqual(getPolicyForDisbursement(txId2).lateFeeAmount, 40);
    assert.strictEqual(getPolicyForDisbursement(txId).isStrict, false);

    // Natural-key reuse after "refresh" with new tx id
    const reused = recordDisbursementPolicySnapshot({
      disbursementTxId: 99999,
      memberId: members.borrowerId,
      disbursementDate: "2025-06-01",
      principal: 2000,
    });
    assert.strictEqual(reused.repayment_policy, POLICY_FLEXIBLE);

    closeDb(org);
  });
  console.log("  disbursement snapshot not retroactive: OK");
}

console.log("test-loan-payment-policy");
testIsPaymentLate();
testFlexibleDefaultAndSnapshot();
testStrictLateFeeOnRepayment();
testDisbursementSnapshotNotRetroactive();
console.log("test-loan-payment-policy: OK");

try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch (_) {}
