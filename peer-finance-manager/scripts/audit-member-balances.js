#!/usr/bin/env node
const { initPaths } = require("../lib/paths");
initPaths(process.argv[2] || "c:/Users/yinka/Documents/AssurCoop");

const { getDb, closeDb } = require("../db/database");
const {
  getMemberDepositAccountBalance,
  memberHasWithdrawal,
  memberHasDistribution,
} = require("../lib/balance-service");
const { getMemberAccountSummary } = require("../lib/cooperative-books");
const { MEMBERSHIP_FEE } = require("../lib/constants");

const db = getDb();

function sumTypes(memberId, types) {
  const placeholders = types.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS t FROM transactions
       WHERE member_id = ? AND type IN (${placeholders})`
    )
    .get(memberId, ...types).t;
}

function expectedBalance(member) {
  const deposits = sumTypes(member.id, ["deposit"]);
  const withdrawals = sumTypes(member.id, ["withdrawal"]);
  const distributions = sumTypes(member.id, ["distribution"]);
  const fees = sumTypes(member.id, ["membership_fee"]);
  const expected = deposits + withdrawals + distributions + fees;

  return {
    deposits,
    withdrawals,
    distributions,
    fees,
    feeTx: db
      .prepare(
        `SELECT COUNT(*) AS c FROM transactions
         WHERE member_id = ? AND type = 'membership_fee'`
      )
      .get(member.id).c,
    hasWithdrawal: memberHasWithdrawal(member.id),
    hasDistribution: memberHasDistribution(member.id),
    expected,
    rule: "bank cashflows (dep + wd + dist + fee)",
  };
}

const members = db
  .prepare(
    `SELECT m.id, m.name, m.membership_fee_paid, mp.display_name
     FROM members m
     LEFT JOIN member_profiles mp ON mp.member_id = m.id
     ORDER BY m.name`
  )
  .all();

const issues = [];
const rows = [];

for (const m of members) {
  const txCount = db
    .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE member_id = ?`)
    .get(m.id).c;
  if (txCount === 0) continue;

  const calc = expectedBalance(m);
  const balance = getMemberDepositAccountBalance(m.id);
  const summary = getMemberAccountSummary(m.id).depositAccountBalance;
  const label = m.display_name || m.name;
  const memberIssues = [];

  if (Math.abs(balance - calc.expected) > 0.02) {
    memberIssues.push(
      `balance ${balance.toFixed(2)} != expected ${calc.expected.toFixed(2)} (${calc.rule})`
    );
  }
  if (Math.abs(summary - balance) > 0.02) {
    memberIssues.push(
      `profile summary ${summary.toFixed(2)} != balance ${balance.toFixed(2)}`
    );
  }
  if (m.membership_fee_paid && calc.feeTx === 0 && calc.deposits > 0) {
    memberIssues.push("membership_fee_paid but no -100 fee transaction");
  }
  if (calc.feeTx > 0 && Math.abs(calc.fees + MEMBERSHIP_FEE) > 0.02) {
    memberIssues.push(`fee total ${calc.fees.toFixed(2)} (expected -${MEMBERSHIP_FEE})`);
  }
  if (calc.feeTx === 0 && calc.deposits >= MEMBERSHIP_FEE && m.membership_fee_paid) {
    memberIssues.push("should have registration fee deducted");
  }

  rows.push({
    label,
    balance,
    expected: calc.expected,
    deposits: calc.deposits,
    withdrawals: calc.withdrawals,
    distributions: calc.distributions,
    fees: calc.fees,
    rule: calc.rule,
    issues: memberIssues,
  });

  if (memberIssues.length) {
    issues.push({ label, ...calc, balance, issues: memberIssues });
  }
}

console.log("Member Deposit Account Balances\n");
console.log(
  [
    "Member".padEnd(28),
    "Balance".padStart(10),
    "Deposits".padStart(10),
    "Withdraw".padStart(10),
    "Distrib".padStart(10),
    "Fee".padStart(8),
    "Rule",
  ].join(" ")
);
console.log("-".repeat(100));

for (const r of rows) {
  const flag = r.issues.length ? " !" : "";
  console.log(
    [
      r.label.slice(0, 28).padEnd(28),
      r.balance.toFixed(2).padStart(10),
      r.deposits.toFixed(2).padStart(10),
      r.withdrawals.toFixed(2).padStart(10),
      r.distributions.toFixed(2).padStart(10),
      r.fees.toFixed(2).padStart(8),
      r.rule + flag,
    ].join(" ")
  );
  for (const issue of r.issues) {
    console.log(`  -> ${issue}`);
  }
}

const inactive = members.filter((m) => {
  const txCount = db
    .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE member_id = ?`)
    .get(m.id).c;
  return txCount === 0;
});
if (inactive.length) {
  console.log(`\nMembers with no ledger activity (${inactive.length}):`);
  inactive.forEach((m) => console.log(`  ${m.display_name || m.name}`));
}

console.log(`\nReviewed ${rows.length} members with activity.`);
if (issues.length) {
  console.log(`Issues found: ${issues.length}`);
  process.exit(1);
}
console.log("All balances consistent with registration fee rules.");
closeDb();
