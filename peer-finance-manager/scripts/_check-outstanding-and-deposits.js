const { initPaths } = require("../lib/paths");
initPaths();
const { getCooperativeBooks } = require("../lib/cooperative-books");
const { getAllBankLoanLots } = require("../lib/loan-ledger-service");
const { getDb, closeDb } = require("../db/database");

const db = getDb();
const books = getCooperativeBooks();
const lots = getAllBankLoanLots().filter((l) => l.status === "active");

console.log("=== OUTSTANDING LOANS ===");
console.log("Dashboard total:", books.loansOutstanding.toFixed(2));
console.log("Total disbursed (all loans):", books.loansPrincipal.toFixed(2));
console.log("Total repaid (all loans):", books.loansCollected.toFixed(2));
console.log("Active loan count:", lots.length);
console.log("");

let sum = 0;
for (const l of lots) {
  console.log(
    [
      l.borrower,
      `Loan ${l.loanNumber}`,
      `disbursed ${l.principal}`,
      `repaid ${l.collected.toFixed(2)}`,
      `outstanding ${l.outstanding.toFixed(2)}`,
      l.disbursementDescription || "",
    ].join(" | ")
  );
  sum += l.outstanding;
}
console.log("");
console.log("Sum of active outstanding:", sum.toFixed(2));
console.log(
  "Simple principal - repaid (active only):",
  lots
    .reduce((s, l) => s + l.principal - l.collected, 0)
    .toFixed(2)
);

console.log("\n=== LATEST DEPOSITS ===");
const deps = db
  .prepare(
    `SELECT t.transaction_date, t.amount, t.description, t.source, m.name
     FROM transactions t
     JOIN members m ON m.id = t.member_id
     WHERE t.type = 'deposit'
     ORDER BY t.transaction_date DESC, t.id DESC
     LIMIT 10`
  )
  .all();
deps.forEach((d, i) => {
  console.log(
    `${i + 1}. ${d.transaction_date} | ${d.name} | $${d.amount} | ${d.source} | ${(d.description || "").slice(0, 70)}`
  );
});

closeDb();
