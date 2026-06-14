const path = require("path");
const fs = require("fs");
const { initPaths } = require("../lib/paths");
const { getDb } = require("../db/database");
const { loadMergedBankTransactions } = require("../lib/parse-bank-sources");

initPaths("c:/Users/yinka/Documents/AssurCoop");
const root = "c:/Users/yinka/Documents/AssurCoop";
const db = getDb();
const members = db.prepare("SELECT id, name FROM members").all();
const memberNames = members.map((m) => m.name);
const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));

const csvPath = path.join(root, "data/bank-statement-2026.csv");
const merged = loadMergedBankTransactions({
  xlsxPath: path.join(root, "All deposits.xlsx"),
  csvPath,
  memberNames,
});

const csvRaw = fs.readFileSync(csvPath, "utf8").split(/\r?\n/);
const mislabeled = [];
for (const line of csvRaw) {
  if (!/loan repayment|loan payment|loan payback/i.test(line)) continue;
  if (/Loan Repayment/i.test(line.split(",").pop() || "")) continue;
  mislabeled.push(line);
}
console.log("CSV rows: description says loan but Narrative is NOT Loan Repayment:");
mislabeled.forEach((l) => console.log(" ", l.slice(0, 120)));

const loanRepMerged = merged.filter((t) => t.ledgerType === "loan_repayment" && t.date >= "2026-02-02");
console.log("\nMerged loan repayments since 2026-02-02:", loanRepMerged.length);

const missing = [];
for (const tx of loanRepMerged) {
  const memberId = tx.member ? nameToId[tx.member] : null;
  if (!memberId) {
    missing.push({ reason: "no member", ...tx });
    continue;
  }
  const found = db
    .prepare(
      `SELECT id, type FROM transactions WHERE member_id = ? AND transaction_date = ?
       AND ABS(amount - ?) < 0.01 AND type = 'loan_repayment'`
    )
    .get(memberId, tx.date, tx.amount);
  if (!found) {
    missing.push({ reason: "not in db as loan_repayment", member: tx.member, ...tx });
  }
}

const dupDeposits = db
  .prepare(
    `SELECT t.id, t.transaction_date, t.amount, t.type, t.description, m.name
     FROM transactions t JOIN members m ON m.id = t.member_id
     WHERE t.source = 'bank_import' AND t.transaction_date >= '2026-02-02'
     AND t.type = 'deposit'
     AND (LOWER(t.description) LIKE '%loan repayment%' OR LOWER(t.description) LIKE '%loan payment%')
     ORDER BY t.transaction_date`
  )
  .all();

console.log("\nMissing from DB:", missing.length);
missing.forEach((m) => console.log(" ", m.date, m.amount, m.member, m.description?.slice(0, 60)));

console.log("\nMisclassified as deposit (should be loan_repayment):", dupDeposits.length);
dupDeposits.forEach((d) => console.log(" ", d.transaction_date, d.amount, d.name, d.description?.slice(0, 70)));
