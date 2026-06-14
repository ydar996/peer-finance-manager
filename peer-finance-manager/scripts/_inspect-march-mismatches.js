const path = require("path");
const { initPaths } = require("../lib/paths");
initPaths(path.join(__dirname, "..", ".."));
const { getDb, closeDb } = require("../db/database");

const db = getDb();
const names = [
  "Clement Aribisala",
  "Noghayin Idele",
  "Oluwabiyi Omotuyole",
  "Yomi Salami",
];

for (const name of names) {
  const m = db.prepare("SELECT id FROM members WHERE name = ?").get(name);
  console.log(`\n=== ${name} (id ${m.id}) — transactions through 2026-03-31 ===`);
  const rows = db
    .prepare(
      `SELECT transaction_date, type, amount, description, source
       FROM transactions
       WHERE member_id = ? AND transaction_date <= '2026-03-31'
         AND type IN ('deposit', 'withdrawal', 'distribution', 'membership_fee', 'loan_repayment')
       ORDER BY transaction_date, id`
    )
    .all(m.id);
  rows.forEach((r) =>
    console.log(
      `  ${r.transaction_date}  ${r.type.padEnd(16)}  ${String(r.amount).padStart(10)}  ${r.source}  ${(r.description || "").slice(0, 60)}`
    )
  );
  const sum = db
    .prepare(
      `SELECT type, SUM(amount) t, COUNT(*) c
       FROM transactions
       WHERE member_id = ? AND transaction_date <= '2026-03-31'
         AND type IN ('deposit', 'withdrawal', 'distribution', 'membership_fee')
       GROUP BY type`
    )
    .all(m.id);
  console.log("  Summary:", sum);
}

closeDb();
