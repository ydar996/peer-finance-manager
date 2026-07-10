/**
 * Audit Gbanju loan: disbursements vs repayments vs paid status.
 * Run: node peer-finance-manager/scripts/audit-gbanju-loans.js
 */
const path = require("path");
const fs = require("fs");

const coopRoot = path.resolve(__dirname, "../..");
process.chdir(coopRoot);

const { initPaths } = require("../lib/paths");
initPaths(coopRoot);

const { runWithOrg } = require("../lib/org-context");
const { getDb } = require("../db/database");
const { getMemberLoanLedgerSummary } = require("../lib/loan-ledger-service");
const { loadMergedBankTransactions } = require("../lib/parse-bank-sources");

runWithOrg("assurance", () => {
  const db = getDb();
  const members = db
    .prepare("SELECT id, name FROM members WHERE lower(name) LIKE '%gbanju%'")
    .all();
  console.log("=== Members matching Gbanju ===");
  console.log(members);

  const csvPath = path.join(coopRoot, "data/bank-statement-2026.csv");
  const xlsxPath = path.join(coopRoot, "All deposits.xlsx");
  const allMemberNames = db.prepare("SELECT name FROM members").all().map((m) => m.name);

  let bankLines = [];
  if (fs.existsSync(csvPath) && fs.existsSync(xlsxPath)) {
    const merged = loadMergedBankTransactions({ xlsxPath, csvPath, memberNames: allMemberNames });
    bankLines = merged.filter(
      (tx) =>
        /gbanju/i.test(tx.member || "") ||
        /gbanju/i.test(tx.description || "") ||
        /aruwayo/i.test(tx.description || "")
    );
    console.log("\n=== Bank source lines (Gbanju / ARUWAYO) ===");
    for (const tx of bankLines) {
      console.log(
        tx.date,
        tx.ledgerType,
        tx.amount,
        tx.member || "(no member)",
        (tx.description || "").slice(0, 80)
      );
    }
    const loanRep = bankLines.filter((t) => t.ledgerType === "loan_repayment");
    const loanDisb = bankLines.filter((t) => t.ledgerType === "loan_disbursement");
    const deposits = bankLines.filter((t) => t.ledgerType === "deposit");
    console.log("\nBank totals:");
    console.log("  loan_repayment:", loanRep.reduce((s, t) => s + t.amount, 0), `(${loanRep.length} rows)`);
    console.log("  loan_disbursement:", loanDisb.reduce((s, t) => s + Math.abs(t.amount), 0), `(${loanDisb.length} rows)`);
    console.log("  deposit (incl. possible mislabeled loan):", deposits.reduce((s, t) => s + t.amount, 0), `(${deposits.length} rows)`);
    deposits.forEach((d) => {
      if (/loan/i.test(d.description || "")) {
        console.log("  ** possible mislabeled loan as deposit:", d.date, d.amount, d.description?.slice(0, 60));
      }
    });
  } else {
    console.log("\nBank files missing:", { csv: fs.existsSync(csvPath), xlsx: fs.existsSync(xlsxPath) });
  }

  for (const m of members) {
    console.log(`\n${"=".repeat(60)}\n=== DB ledger: ${m.name} (id ${m.id}) ===`);
    const txs = db
      .prepare(
        `SELECT id, transaction_date, type, amount, description, source
         FROM transactions WHERE member_id = ?
         AND type IN ('loan_disbursement','loan_repayment')
         ORDER BY transaction_date, id`
      )
      .all(m.id);
    console.log("\nDB loan transactions:");
    let disb = 0;
    let rep = 0;
    for (const t of txs) {
      console.log(t.transaction_date, t.type, t.amount, t.source, (t.description || "").slice(0, 70));
      if (t.type === "loan_disbursement") disb += Math.abs(t.amount);
      if (t.type === "loan_repayment") rep += t.amount;
    }
    console.log("\nDB totals: disbursed", disb, "| repaid", rep, "| net principal", round2(rep - disb));

    const mislabeled = db
      .prepare(
        `SELECT transaction_date, amount, type, description FROM transactions
         WHERE member_id = ? AND source = 'bank_import'
         AND type = 'deposit'
         AND (lower(description) LIKE '%loan%' OR lower(description) LIKE '%repay%')
         ORDER BY transaction_date`
      )
      .all(m.id);
    if (mislabeled.length) {
      console.log("\n** DB rows: loan-related but typed as DEPOSIT:");
      mislabeled.forEach((t) => console.log(" ", t.transaction_date, t.amount, t.description?.slice(0, 70)));
    }

    const summary = getMemberLoanLedgerSummary(m.id);
    console.log("\n=== Loan lots summary ===");
    console.log(
      "Outstanding:",
      summary.outstanding,
      "| Active:",
      summary.activeLoanCount,
      "| Paid:",
      summary.paidLoanCount,
      "| Overpayment credit:",
      summary.overpaymentCredit
    );
    for (const lot of summary.lots) {
      console.log(`\n--- Loan ${lot.loanNumber} [${lot.status}] ---`);
      console.log("  Disbursed:", lot.disbursementDate, "| Principal:", lot.principal);
      console.log("  Collected (repayments):", lot.collected);
      console.log("  Principal repaid (model):", lot.principalRepaid);
      console.log("  Outstanding (model):", lot.outstanding);
      console.log("  Scheduled total payable:", lot.scheduledTotalPayable);
      console.log("  Scheduled total interest:", lot.scheduledTotalInterest);
      console.log("  Interest earned (model):", lot.interestIncome);
      console.log("  Repayments:", lot.repayments.length);
      const last = lot.repayments[lot.repayments.length - 1];
      if (last) {
        console.log("  Last repayment:", last.date, last.amount, "| balanceAfter:", last.balanceAfter);
      }
      const gap = lot.scheduledTotalPayable
        ? round2(lot.scheduledTotalPayable - lot.collected)
        : round2(lot.principal - lot.collected);
      console.log(
        "  Gap: collected vs scheduled payable:",
        gap,
        lot.status === "paid" && gap > 0.01 ? " ** PAID but collected < scheduled payable" : ""
      );
      console.log(
        "  Gap: collected vs principal:",
        round2(lot.principal - lot.collected),
        lot.collected >= lot.principal - 0.01 ? " (principal covered)" : " ** principal NOT fully covered"
      );
    }
  }
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
