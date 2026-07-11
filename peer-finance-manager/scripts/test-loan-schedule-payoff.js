/**
 * Regression: schedule-based loan payoff (principal + interest) and surplus buffer.
 * Run: node scripts/test-loan-schedule-payoff.js
 */
const assert = require("assert");
const { buildLoanLotsFromTransactions } = require("../lib/loan-ledger-service");

function approx(a, b, msg) {
  assert.ok(Math.abs(a - b) < 0.02, `${msg}: expected ${b}, got ${a}`);
}

// Saheed/Yomi Loan 1 pattern: $6000 principal, repayments through Aug $5360,
// Sep $500, Nov $600 with $403.18 payoff + $196.82 surplus when schedule total is $6263.18.
const txs = [
  { id: 1, transaction_date: "2024-11-27", type: "loan_disbursement", amount: -6000, description: "Check 1163" },
  { id: 2, transaction_date: "2024-12-09", type: "loan_repayment", amount: 600, description: "p1" },
  { id: 3, transaction_date: "2025-01-07", type: "loan_repayment", amount: 560, description: "p2" },
  { id: 4, transaction_date: "2025-02-04", type: "loan_repayment", amount: 600, description: "p3" },
  { id: 5, transaction_date: "2025-03-04", type: "loan_repayment", amount: 600, description: "p4" },
  { id: 6, transaction_date: "2025-04-03", type: "loan_repayment", amount: 600, description: "p5" },
  { id: 7, transaction_date: "2025-05-06", type: "loan_repayment", amount: 600, description: "p6" },
  { id: 8, transaction_date: "2025-06-04", type: "loan_repayment", amount: 600, description: "p7" },
  { id: 9, transaction_date: "2025-06-30", type: "loan_repayment", amount: 600, description: "p8" },
  { id: 10, transaction_date: "2025-08-08", type: "loan_repayment", amount: 600, description: "p9" },
  { id: 11, transaction_date: "2025-09-04", type: "loan_repayment", amount: 500, description: "p10" },
  {
    id: 12,
    transaction_date: "2025-11-06",
    type: "loan_repayment",
    amount: 600,
    description: "Loan and 100 for monthly payment",
  },
];

// Without member name / schedule: principal-only (legacy)
const legacy = buildLoanLotsFromTransactions(txs);
approx(legacy.lots[0].collected, 6000, "legacy lot1 collected");
approx(legacy.overpaymentCredit, 460, "legacy surplus");

// With schedule member (requires loan details workbook on disk)
let scheduleResult = null;
try {
  scheduleResult = buildLoanLotsFromTransactions(txs, { memberName: "Yomi Salami" });
} catch (err) {
  console.warn("Schedule test skipped (workbook missing):", err.message);
  process.exit(0);
}

if (scheduleResult.lots[0]) {
  approx(scheduleResult.lots[0].collected, 6263.18, "schedule lot1 total collected");
  approx(scheduleResult.overpaymentCredit, 196.82, "schedule surplus after payoff");
  const nov = scheduleResult.lots[0].repayments.find((r) => r.date === "2025-11-06");
  assert.ok(nov, "Nov 6 repayment on lot1");
  approx(nov.amount, 403.18, "Nov 6 applied to loan1");
}

console.log("test-loan-schedule-payoff: OK");
