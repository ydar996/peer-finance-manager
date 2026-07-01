#!/usr/bin/env node
/** Fix mis-attributed proxy deposits and Oluwabiyi March contribution classification. */
const path = require("path");
const coopRoot = path.join(__dirname, "..", "..");
const { initPaths } = require("../lib/paths");
initPaths(coopRoot);
const { runWithOrg } = require("../lib/org-context");
const { getDb, closeDb } = require("../db/database");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");

const REASSIGNMENTS = [
  {
    conf: "04TRT19IP",
    from: "Yinka Daramola",
    to: "Ejiro Awhotu",
    amount: 300.15,
    date: "2025-03-04",
    label: "Ejiro proxy payment",
  },
  {
    conf: "05CWRF9R9",
    from: "Yinka Daramola",
    to: "Titilope Saliu",
    amount: 100,
    date: "2025-03-17",
    label: "Titilope proxy payment",
  },
];

const OLUWABIYI_MARCH_DEPOSIT = {
  member: "Oluwabiyi Omotuyole",
  date: "2026-03-23",
  amount: 100.13,
  label: "March 2026 contribution (was loan_repayment)",
};

const EXPECTED = {
  "Yinka Daramola": 2430.98,
  "Ejiro Awhotu": 991.0,
  "Titilope Saliu": 668.23,
  "Oluwabiyi Omotuyole": 5363.6,
};

runWithOrg("assurance", () => {
  const db = getDb();
  const dryRun = process.argv.includes("--dry-run");

  const nameToId = Object.fromEntries(
    db.prepare("SELECT id, name FROM members").all().map((m) => [m.name, m.id])
  );

  const reassignMember = db.prepare("UPDATE transactions SET member_id = ? WHERE id = ?");
  const reclassifyType = db.prepare("UPDATE transactions SET type = ? WHERE id = ?");

  const run = db.transaction(() => {
    let moved = 0;
    for (const rule of REASSIGNMENTS) {
      const fromId = nameToId[rule.from];
      const toId = nameToId[rule.to];
      const row = db
        .prepare(
          `SELECT id, amount, transaction_date, description
           FROM transactions
           WHERE member_id = ? AND type = 'deposit'
             AND UPPER(description) LIKE '%' || UPPER(?) || '%'
             AND transaction_date = ?
             AND ABS(amount - ?) < 0.02`
        )
        .get(fromId, rule.conf, rule.date, rule.amount);

      if (!row) {
        const already = db
          .prepare(
            `SELECT id FROM transactions
             WHERE member_id = ? AND type = 'deposit'
               AND UPPER(description) LIKE '%' || UPPER(?) || '%'`
          )
          .get(toId, rule.conf);
        if (already) {
          console.log(`Already reassigned: ${rule.to} (${rule.label})`);
          continue;
        }
        throw new Error(
          `Missing deposit to reassign: ${rule.from} -> ${rule.to} (${rule.date} $${rule.amount})`
        );
      }

      console.log(
        `${dryRun ? "[dry-run] " : ""}Move tx ${row.id}: $${row.amount} ${rule.from} -> ${rule.to}`
      );
      if (!dryRun) {
        reassignMember.run(toId, row.id);
        moved += 1;
      }
    }

    const oluId = nameToId[OLUWABIYI_MARCH_DEPOSIT.member];
    const marchTx = db
      .prepare(
        `SELECT id, type FROM transactions
         WHERE member_id = ? AND transaction_date = ?
           AND ABS(amount - ?) < 0.02`
      )
      .get(oluId, OLUWABIYI_MARCH_DEPOSIT.date, OLUWABIYI_MARCH_DEPOSIT.amount);

    if (!marchTx) {
      throw new Error(`Oluwabiyi Mar 23 $100.13 transaction not found`);
    }
    if (marchTx.type === "deposit") {
      console.log(`Oluwabiyi Mar 23 $100.13 already classified as deposit`);
    } else if (marchTx.type === "loan_repayment") {
      console.log(
        `${dryRun ? "[dry-run] " : ""}Reclassify tx ${marchTx.id}: loan_repayment -> deposit (${OLUWABIYI_MARCH_DEPOSIT.label})`
      );
      if (!dryRun) {
        reclassifyType.run("deposit", marchTx.id);
      }
    } else {
      throw new Error(`Oluwabiyi Mar 23 $100.13 has unexpected type: ${marchTx.type}`);
    }

    return moved;
  });

  if (dryRun) {
    run();
  } else {
    const moved = run();
    if (moved) console.log(`\nReassigned ${moved} proxy deposit(s).`);
  }

  console.log("\n=== Balances after fix ===");
  for (const [name, target] of Object.entries(EXPECTED)) {
    const bal = getMemberDepositAccountBalance(nameToId[name]);
    const ok = Math.abs(bal - target) < 0.02;
    console.log(`${name}: $${bal.toFixed(2)} (expected $${target.toFixed(2)}) ${ok ? "OK" : "MISMATCH"}`);
    if (!ok) process.exitCode = 1;
  }

  closeDb();
});
