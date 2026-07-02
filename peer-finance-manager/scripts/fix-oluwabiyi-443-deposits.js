#!/usr/bin/env node
/**
 * Reclassify Oluwabiyi Omotuyole $443.55 bank deposits as loan repayments.
 * Those amounts are loan installments, not member contributions.
 */
const path = require("path");
const { initPaths } = require("../lib/paths");
const { getDb, closeDb } = require("../db/database");
const { runWithOrg } = require("../lib/org-context");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const { getMemberLoanLedgerSummary } = require("../lib/loan-ledger-service");

initPaths(path.join(__dirname, "..", ".."));

const MEMBER_NAME = "Oluwabiyi Omotuyole";
const LOAN_PAYMENT_AMOUNT = 443.55;

runWithOrg("assurance", () => {
  const db = getDb();
  const member = db.prepare("SELECT id, name FROM members WHERE name = ?").get(MEMBER_NAME);
  if (!member) throw new Error(`Member not found: ${MEMBER_NAME}`);

  const beforeDeposit = getMemberDepositAccountBalance(member.id);
  const beforeLoan = getMemberLoanLedgerSummary(member.id);

  const misclassified = db
    .prepare(
      `SELECT id, transaction_date, amount, description
       FROM transactions
       WHERE member_id = ?
         AND type = 'deposit'
         AND ABS(amount - ?) < 0.01
       ORDER BY transaction_date, id`
    )
    .all(member.id, LOAN_PAYMENT_AMOUNT);

  if (!misclassified.length) {
    console.log("No misclassified $443.55 deposits found.");
    closeDb();
    return;
  }

  const update = db.prepare(`UPDATE transactions SET type = 'loan_repayment' WHERE id = ?`);
  const run = db.transaction(() => {
    for (const row of misclassified) {
      update.run(row.id);
      console.log(
        `Reclassified tx ${row.id} (${row.transaction_date} $${row.amount}): deposit -> loan_repayment`
      );
    }
  });
  run();

  const afterDeposit = getMemberDepositAccountBalance(member.id);
  const afterLoan = getMemberLoanLedgerSummary(member.id);

  console.log(`Contributions balance: ${beforeDeposit.toFixed(2)} -> ${afterDeposit.toFixed(2)}`);
  console.log(
    `Loan outstanding: ${beforeLoan.outstanding.toFixed(2)} -> ${afterLoan.outstanding.toFixed(2)}`
  );
  closeDb();
});
