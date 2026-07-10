const path = require("path");
const coopRoot = path.resolve(__dirname, "../..");
process.chdir(coopRoot);

const { initPaths } = require("../lib/paths");
initPaths(coopRoot);

const { runWithOrg } = require("../lib/org-context");
const { getDb } = require("../db/database");
const { getMemberLoanLedgerSummary } = require("../lib/loan-ledger-service");

runWithOrg("assurance", () => {
  const db = getDb();
  const members = db
    .prepare("SELECT id, name FROM members WHERE lower(name) LIKE '%gbanju%'")
    .all();

  for (const m of members) {
    console.log(`\n${"=".repeat(60)}\n${m.name} (id ${m.id})`);
    const txs = db
      .prepare(
        `SELECT id, transaction_date, type, amount, description, source
         FROM transactions WHERE member_id = ?
         ORDER BY transaction_date, id`
      )
      .all(m.id);

    const loanTxs = txs.filter((t) =>
      ["loan_disbursement", "loan_repayment"].includes(t.type)
    );
    console.log("\nLoan transactions in DB:");
    let disb = 0;
    let rep = 0;
    for (const t of loanTxs) {
      console.log(
        t.transaction_date,
        t.type.padEnd(18),
        String(t.amount).padStart(10),
        t.source,
        (t.description || "").slice(0, 65)
      );
      if (t.type === "loan_disbursement") disb += Math.abs(t.amount);
      if (t.type === "loan_repayment") rep += t.amount;
    }
    console.log("\nTotals: disbursed", disb, "| repaid", rep, "| surplus", round2(rep - disb));

    const suspect = txs.filter(
      (t) =>
        t.type === "deposit" &&
        /loan|repay/i.test(t.description || "")
    );
    if (suspect.length) {
      console.log("\nDeposits with loan wording (may be misclassified):");
      suspect.forEach((t) =>
        console.log(" ", t.transaction_date, t.amount, t.description?.slice(0, 70))
      );
    }

    const summary = getMemberLoanLedgerSummary(m.id);
    console.log("\nLoan lots:");
    for (const lot of summary.lots) {
      console.log(
        `\nLoan ${lot.loanNumber} [${lot.status}] principal=${lot.principal} collected=${lot.collected} outstanding=${lot.outstanding}`
      );
      console.log(
        `  scheduled payable=${lot.scheduledTotalPayable} interest=${lot.scheduledTotalInterest}`
      );
      console.log(`  principalRepaid=${lot.principalRepaid} interestEarned=${lot.interestIncome}`);
      for (const r of lot.repayments) {
        console.log(
          `  ${r.date}  ${r.amount}  bal=${r.balanceAfter ?? "?"}  ${(r.description || "").slice(0, 55)}`
        );
      }
    }
  }
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
