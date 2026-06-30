#!/usr/bin/env node
/** Compare DB deposit balances vs cooperative-bank-ledger-reference.xlsx */
const path = require("path");
const fs = require("fs");
const coopRoot = path.join(__dirname, "..", "..");
const { initPaths } = require("../lib/paths");
const { parseReferenceLedgerXlsx } = require("../lib/parse-bank-sources");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const { getDb, closeDb } = require("../db/database");
const { runWithOrg } = require("../lib/org-context");

initPaths(coopRoot);

const xlsxPath =
  process.argv[2] ||
  path.join(coopRoot, "data", "cooperative-bank-ledger-reference.xlsx");

runWithOrg("assurance", () => {
  const db = getDb();
  const memberNames = db.prepare("SELECT id, name FROM members ORDER BY name").all();
  const nameToId = Object.fromEntries(memberNames.map((m) => [m.name, m.id]));

  const txs = parseReferenceLedgerXlsx(xlsxPath, memberNames.map((m) => m.name));
  const ledgerByMember = new Map();
  const unassigned = { deposit: 0, withdrawal: 0, count: 0 };

  for (const tx of txs) {
    if (tx.ledgerType === "deposit") {
      if (!tx.member) {
        unassigned.deposit += tx.amount;
        unassigned.count += 1;
        continue;
      }
      ledgerByMember.set(tx.member, (ledgerByMember.get(tx.member) || 0) + tx.amount);
    } else if (tx.ledgerType === "withdrawal") {
      if (!tx.member) continue;
      ledgerByMember.set(tx.member, (ledgerByMember.get(tx.member) || 0) + tx.amount);
    }
  }

  const rows = [];
  for (const m of memberNames) {
    const dbBalance = getMemberDepositAccountBalance(m.id);
    const ledgerBalance = ledgerByMember.get(m.name) ?? 0;
    const diff = dbBalance - ledgerBalance;
    if (Math.abs(diff) > 0.02 || Math.abs(ledgerBalance) > 0.02) {
      rows.push({
        name: m.name,
        dbBalance,
        ledgerBalance,
        diff,
      });
    }
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log("Member deposit balance: DB vs reference ledger (deposits + withdrawals only)\n");
  console.log(
    ["Member", "DB Balance", "Ledger Balance", "Difference"].map((h) => h.padEnd(18)).join("")
  );
  console.log("-".repeat(72));

  const mismatches = rows.filter((r) => Math.abs(r.diff) > 0.02);
  for (const r of rows) {
    const flag = Math.abs(r.diff) > 0.02 ? " ***" : "";
    console.log(
      [
        r.name.slice(0, 26).padEnd(18),
        r.dbBalance.toFixed(2).padStart(18),
        r.ledgerBalance.toFixed(2).padStart(18),
        r.diff.toFixed(2).padStart(18),
      ].join("") + flag
    );
  }

  if (unassigned.count) {
    console.log(`\nUnassigned deposits in ledger: ${unassigned.count} rows, $${unassigned.deposit.toFixed(2)}`);
  }

  console.log(`\nMismatches (|diff| > $0.02): ${mismatches.length}`);
  if (mismatches.length) {
    console.log("\nMembers with inaccurate balances:");
    mismatches.forEach((r) =>
      console.log(
        `  ${r.name}: DB $${r.dbBalance.toFixed(2)} vs ledger $${r.ledgerBalance.toFixed(2)} (off by $${r.diff.toFixed(2)})`
      )
    );
  }

  closeDb();
});
