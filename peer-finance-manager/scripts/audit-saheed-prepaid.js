const path = require("path");
const coopRoot = path.resolve(__dirname, "../..");
process.chdir(coopRoot);
require("../lib/paths").initPaths(coopRoot);
const { runWithOrg } = require("../lib/org-context");
const { getDb } = require("../db/database");
const { getMemberLoanLedgerSummary } = require("../lib/loan-ledger-service");

runWithOrg("assurance", () => {
  const db = getDb();
  const members = db
    .prepare(
      `SELECT id, name FROM members WHERE lower(name) LIKE '%saheed%' OR lower(name) LIKE '%salami%' OR lower(name) LIKE '%yomi%'`
    )
    .all();
  console.log("Members:", members);

  for (const m of members) {
    if (!/saheed|yomi/i.test(m.name)) continue;
    console.log(`\n${"=".repeat(60)}\n${m.name} (id ${m.id})`);
    const txs = db
      .prepare(
        `SELECT transaction_date, type, amount, description FROM transactions
         WHERE member_id = ? AND type IN ('loan_disbursement','loan_repayment')
         ORDER BY transaction_date, id`
      )
      .all(m.id);
    let disb = 0;
    let rep = 0;
    for (const t of txs) {
      console.log(t.transaction_date, t.type, t.amount, (t.description || "").slice(0, 65));
      if (t.type === "loan_disbursement") disb += Math.abs(t.amount);
      if (t.type === "loan_repayment") rep += t.amount;
    }
    console.log("Totals disbursed:", disb, "repaid:", rep, "surplus:", Math.round((rep - disb) * 100) / 100);

    const s = getMemberLoanLedgerSummary(m.id);
    console.log(
      "\nSummary: outstanding",
      s.outstanding,
      "| overpaymentCredit",
      s.overpaymentCredit,
      "| active",
      s.activeLoanCount,
      "| paid",
      s.paidLoanCount
    );
    for (const lot of s.lots) {
      console.log(
        `\nLoan ${lot.loanNumber} [${lot.status}] principal=${lot.principal} collected=${lot.collected} outstanding=${lot.outstanding}`
      );
    }
  }
});
