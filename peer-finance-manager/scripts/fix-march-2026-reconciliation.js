#!/usr/bin/env node
/**
 * Align app ledger with March 2026 sent statements (4 known discrepancies).
 */
const path = require("path");
const { initPaths } = require("../lib/paths");
const { getDb, closeDb } = require("../db/database");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");

initPaths(path.join(__dirname, "..", ".."));
const db = getDb();

function memberId(name) {
  const row = db.prepare("SELECT id FROM members WHERE name = ?").get(name);
  if (!row) throw new Error(`Member not found: ${name}`);
  return row.id;
}

function dupDepositIds(memberName, date, amount) {
  const mid = memberId(memberName);
  const rows = db
    .prepare(
      `SELECT id, description, source
       FROM transactions
       WHERE member_id = ? AND type = 'deposit'
         AND transaction_date = ? AND ABS(amount - ?) < 0.01
       ORDER BY id`
    )
    .all(mid, date, amount);
  if (rows.length < 2) {
    throw new Error(
      `Expected duplicate deposits for ${memberName} ${date} $${amount}, found ${rows.length}`
    );
  }
  return rows.slice(1).map((r) => r.id);
}

function balanceAsOf(memberName) {
  const mid = memberId(memberName);
  return db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS deposits,
         COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END), 0) AS withdrawals,
         COALESCE(SUM(CASE WHEN type = 'distribution' THEN amount ELSE 0 END), 0) AS distributions,
         COALESCE(SUM(CASE WHEN type = 'membership_fee' THEN amount ELSE 0 END), 0) AS fees
       FROM transactions
       WHERE member_id = ? AND transaction_date <= '2026-03-31'`
    )
    .get(mid);
}

const EXPECTED = {
  "Clement Aribisala": { deposits: 2600.74, balance: 2588.25 },
  "Noghayin Idele": { deposits: 902.55, balance: 828.15 },
  "Oluwabiyi Omotuyole": { deposits: 3704.81, balance: 3732.56 },
  "Yomi Salami": { deposits: 4497.02, balance: 4557.3 },
};

const run = db.transaction(() => {
  const del = db.prepare("DELETE FROM transactions WHERE id = ?");

  // 1. Clement — remove duplicate Feb 17 and Mar 16 deposits ($100.02 each)
  for (const id of dupDepositIds("Clement Aribisala", "2026-02-17", 100.02)) {
    del.run(id);
    console.log("Deleted Clement duplicate deposit id", id);
  }
  for (const id of dupDepositIds("Clement Aribisala", "2026-03-16", 100.02)) {
    del.run(id);
    console.log("Deleted Clement duplicate deposit id", id);
  }

  // 2. Noghayin — remove duplicate Mar 17 and Mar 25 deposits ($50.17 each)
  for (const id of dupDepositIds("Noghayin Idele", "2026-03-17", 50.17)) {
    del.run(id);
    console.log("Deleted Noghayin duplicate deposit id", id);
  }
  for (const id of dupDepositIds("Noghayin Idele", "2026-03-25", 50.17)) {
    del.run(id);
    console.log("Deleted Noghayin duplicate deposit id", id);
  }

  // 3. Oluwabiyi — Mar 16 $443.55 is loan repayment; Mar 23 $100.13 is March contribution
  const oluId = memberId("Oluwabiyi Omotuyole");
  const misclassified = db
    .prepare(
      `SELECT id FROM transactions
       WHERE member_id = ? AND type = 'deposit'
         AND transaction_date = '2026-03-16' AND ABS(amount - 443.55) < 0.01`
    )
    .get(oluId);
  if (!misclassified) throw new Error("Oluwabiyi Mar 16 $443.55 deposit not found");
  db.prepare(
    `UPDATE transactions SET type = 'loan_repayment' WHERE id = ?`
  ).run(misclassified.id);
  console.log("Reclassified Oluwabiyi id", misclassified.id, "deposit -> loan_repayment");

  const marchContribution = db
    .prepare(
      `SELECT id FROM transactions
       WHERE member_id = ? AND type = 'loan_repayment'
         AND transaction_date = '2026-03-23' AND ABS(amount - 100.13) < 0.01`
    )
    .get(oluId);
  if (!marchContribution) {
    throw new Error("Oluwabiyi Mar 23 $100.13 loan_repayment not found");
  }
  db.prepare(`UPDATE transactions SET type = 'deposit' WHERE id = ?`).run(
    marchContribution.id
  );
  console.log(
    "Reclassified Oluwabiyi id",
    marchContribution.id,
    "loan_repayment -> deposit (March contribution)"
  );

  // 4. Yomi — add missing Nov 2025 $196.82 deposit; remove Feb 2026 duplicate $100
  const yomiId = memberId("Yomi Salami");
  const novExists = db
    .prepare(
      `SELECT id FROM transactions
       WHERE member_id = ? AND type = 'deposit'
         AND transaction_date BETWEEN '2025-11-01' AND '2025-11-30'
         AND ABS(amount - 196.82) < 0.01`
    )
    .get(yomiId);
  if (!novExists) {
    const ins = db
      .prepare(
        `INSERT INTO transactions
          (member_id, type, amount, transaction_date, period_year, period_month,
           description, reference, source)
         VALUES (?, 'deposit', ?, '2025-11-06', 2025, 11, ?, ?, 'manual')`
      )
      .run(
        yomiId,
        196.82,
        "November 2025 contribution (from Assurance Status workbook; missing in bank import)",
        "march-2026-recon:yomi:2025-11-06:196.82"
      );
    console.log("Added Yomi Nov 2025 deposit id", ins.lastInsertRowid);
  }

  const febDups = db
    .prepare(
      `SELECT id FROM transactions
       WHERE member_id = ? AND type = 'deposit'
         AND transaction_date = '2026-02-10' AND ABS(amount - 100) < 0.01
       ORDER BY id`
    )
    .all(yomiId);
  if (febDups.length < 2) {
    throw new Error(`Expected 2 Feb 2026 $100 deposits for Yomi, found ${febDups.length}`);
  }
  del.run(febDups[1].id);
  console.log("Deleted Yomi Feb 2026 duplicate deposit id", febDups[1].id);
});

run();

console.log("\nVerification (as of 2026-03-31):");
for (const [name, exp] of Object.entries(EXPECTED)) {
  const snap = balanceAsOf(name);
  const balance =
    snap.deposits + snap.withdrawals + snap.distributions + snap.fees;
  const depOk = Math.abs(snap.deposits - exp.deposits) < 0.02;
  const balOk = Math.abs(balance - exp.balance) < 0.02;
  console.log(
    `${name}: deposits ${snap.deposits.toFixed(2)} ${depOk ? "OK" : "DIFF"} | balance ${balance.toFixed(2)} ${balOk ? "OK" : "DIFF"}`
  );
}

console.log("\nCurrent full balances:");
for (const name of Object.keys(EXPECTED)) {
  const bal = getMemberDepositAccountBalance(memberId(name));
  console.log(`  ${name}: ${bal.toFixed(2)}`);
}

closeDb();
