const { initPaths } = require("../lib/paths");
initPaths();
const { getDb, closeDb } = require("../db/database");
const { getCooperativeBooks } = require("../lib/cooperative-books");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const { loadMergedBankTransactions } = require("../lib/parse-bank-sources");
const path = require("path");
const fs = require("fs");

const db = getDb();
const books = getCooperativeBooks();

const members = db
  .prepare(
    `SELECT m.id, m.name, mp.display_name
     FROM members m
     LEFT JOIN member_profiles mp ON mp.member_id = m.id
     ORDER BY m.name`
  )
  .all();

let sumBalances = 0;
for (const m of members) {
  sumBalances += getMemberDepositAccountBalance(m.id);
}

const dbDepositsOnly = db
  .prepare(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE type = 'deposit'`
  )
  .get().t;
const dbWithdrawals = db
  .prepare(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE type = 'withdrawal'`
  )
  .get().t;
const dbDistributions = db
  .prepare(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE type = 'distribution'`
  )
  .get().t;
const dbFees = db
  .prepare(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE type = 'membership_fee'`
  )
  .get().t;

console.log("=== DASHBOARD TOTALS ===");
console.log("Member Deposits & Withdrawals card:", books.memberDeposits.toFixed(2));
console.log("  (deposits + withdrawals only, not distributions/fees)");
console.log("Member Deposit Accounts (Total) card:", books.totalMemberDepositAccounts.toFixed(2));
console.log("Sum of individual member balances:", sumBalances.toFixed(2));
console.log("");
console.log("=== DB BREAKDOWN (all members) ===");
console.log("Deposits:", dbDepositsOnly.toFixed(2));
console.log("Withdrawals:", dbWithdrawals.toFixed(2));
console.log("Distributions:", dbDistributions.toFixed(2));
console.log("Membership fees:", dbFees.toFixed(2));
console.log(
  "Reconstructed total balances:",
  (dbDepositsOnly + dbWithdrawals + dbDistributions + dbFees).toFixed(2)
);

console.log("\n=== DUPLICATE CHECK (bank_import) ===");
const dupes = db
  .prepare(
    `SELECT transaction_date, member_id, type, amount, description, COUNT(*) AS c,
            GROUP_CONCAT(id) AS ids
     FROM transactions
     WHERE source = 'bank_import'
     GROUP BY transaction_date, member_id, type, amount, description
     HAVING c > 1
     ORDER BY c DESC`
  )
  .all();
console.log("Exact duplicate rows:", dupes.length);
dupes.slice(0, 15).forEach((d) => {
  const m = db.prepare("SELECT name FROM members WHERE id = ?").get(d.member_id);
  console.log(
    `  ${d.c}x ${d.transaction_date} ${m?.name} ${d.type} $${d.amount} ids=${d.ids}`
  );
});

const dupesByConf = db
  .prepare(
    `SELECT description, COUNT(*) AS c, GROUP_CONCAT(id) AS ids,
            GROUP_CONCAT(type) AS types, SUM(amount) AS total
     FROM transactions
     WHERE source = 'bank_import' AND description LIKE '%Conf#%'
     GROUP BY UPPER(description)
     HAVING c > 1`
  )
  .all();
console.log("\nSame Conf# appearing multiple times:", dupesByConf.length);
dupesByConf.forEach((d) => {
  console.log(`  ${d.c}x ${d.description?.slice(0, 70)} types=${d.types} ids=${d.ids}`);
});

console.log("\n=== DEPOSIT VS LOAN CONFLICTS STILL IN DB ===");
const conflicts = db
  .prepare(
    `SELECT a.id AS deposit_id, b.id AS loan_id, a.transaction_date, a.amount,
            m.name, a.description
     FROM transactions a
     JOIN transactions b
       ON a.member_id = b.member_id
      AND a.transaction_date = b.transaction_date
      AND ABS(a.amount - b.amount) < 0.01
     JOIN members m ON m.id = a.member_id
     WHERE a.type = 'deposit' AND b.type = 'loan_repayment' AND a.source = 'bank_import'`
  )
  .all();
console.log("Deposit+loan_repayment same date/amount:", conflicts.length);
conflicts.forEach((c) =>
  console.log(
    `  ${c.transaction_date} ${c.name} $${c.amount} deposit#${c.deposit_id} loan#${c.loan_id}`
  )
);

console.log("\n=== BANK SOURCES VS DB (deposits+withdrawals) ===");
const coopRoot = path.join(__dirname, "..", "..");
const csvPath = path.join(coopRoot, "data", "bank-statement-2026.csv");
const xlsxPath = path.join(coopRoot, "All deposits.xlsx");
const memberNames = members.map((m) => m.name);
const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));

if (fs.existsSync(csvPath)) {
  const merged = loadMergedBankTransactions({ xlsxPath, csvPath, memberNames });
  const bankDepWd = merged.filter(
    (t) => t.ledgerType === "deposit" || t.ledgerType === "withdrawal"
  );
  const bankDep = merged.filter((t) => t.ledgerType === "deposit");
  const bankWd = merged.filter((t) => t.ledgerType === "withdrawal");
  const bankNet = bankDepWd.reduce((s, t) => s + t.amount, 0);
  const bankDepSum = bankDep.reduce((s, t) => s + t.amount, 0);
  const bankWdSum = bankWd.reduce((s, t) => s + t.amount, 0);

  const dbNet = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS t
       FROM transactions
       WHERE source = 'bank_import' AND type IN ('deposit', 'withdrawal')`
    )
    .get().t;

  console.log("Bank merged deposit rows:", bankDep.length, "sum:", bankDepSum.toFixed(2));
  console.log("Bank merged withdrawal rows:", bankWd.length, "sum:", bankWdSum.toFixed(2));
  console.log("Bank merged net (dep+wd):", bankNet.toFixed(2));
  console.log("DB bank_import net (dep+wd):", dbNet.toFixed(2));
  console.log("Difference (bank - db):", (bankNet - dbNet).toFixed(2));

  const bySource = db
    .prepare(
      `SELECT source, type, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS t
       FROM transactions
       WHERE type IN ('deposit', 'withdrawal')
       GROUP BY source, type`
    )
    .all();
  console.log("\nDB deposit/withdrawal by source:");
  bySource.forEach((r) =>
    console.log(`  ${r.source} ${r.type}: ${r.c} rows, $${r.t.toFixed(2)}`)
  );

  const findStmt = db.prepare(
    `SELECT id FROM transactions
     WHERE member_id = ? AND transaction_date = ?
       AND ABS(amount - ?) < 0.01 AND type = ? AND source = 'bank_import'`
  );
  const missing = [];
  for (const tx of bankDepWd) {
    if (!tx.member) continue;
    const mid = nameToId[tx.member];
    if (!mid) continue;
    const type = tx.ledgerType === "deposit" ? "deposit" : "withdrawal";
    if (!findStmt.get(mid, tx.date, tx.amount, type)) {
      missing.push({ member: tx.member, date: tx.date, amount: tx.amount, type });
    }
  }

  const dbRows = db
    .prepare(
      `SELECT t.id, t.member_id, t.transaction_date, t.amount, t.type, m.name
       FROM transactions t
       JOIN members m ON m.id = t.member_id
       WHERE t.source = 'bank_import' AND t.type IN ('deposit', 'withdrawal')`
    )
    .all();
  const extra = [];
  for (const row of dbRows) {
    const inBank = bankDepWd.some(
      (t) =>
        t.member === row.name &&
        t.date === row.transaction_date &&
        Math.abs(t.amount - row.amount) < 0.01 &&
        ((t.ledgerType === "deposit" && row.type === "deposit") ||
          (t.ledgerType === "withdrawal" && row.type === "withdrawal"))
    );
    if (!inBank) extra.push(row);
  }

  console.log("\nBank rows missing from DB:", missing.length);
  missing.slice(0, 10).forEach((m) =>
    console.log(`  ${m.date} ${m.member} ${m.type} $${m.amount}`)
  );
  console.log("DB bank_import rows not in bank sources:", extra.length);
  extra.slice(0, 10).forEach((e) =>
    console.log(`  ${e.transaction_date} ${e.name} ${e.type} $${e.amount}`)
  );
} else {
  console.log("Bank CSV not found:", csvPath);
}

closeDb();
