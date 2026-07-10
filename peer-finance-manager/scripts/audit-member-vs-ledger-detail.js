#!/usr/bin/env node
const path = require("path");
const coopRoot = path.join(__dirname, "..", "..");
const { initPaths } = require("../lib/paths");
const { parseReferenceLedgerXlsx } = require("../lib/parse-bank-sources");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const { getDb, closeDb } = require("../db/database");
const { runWithOrg } = require("../lib/org-context");
const { resolveDepositMemberFromDescription } = require("../lib/member-name-match");

initPaths(coopRoot);

const xlsxPath =
  process.argv[2] ||
  path.join(coopRoot, "data", "cooperative-bank-ledger-reference.xlsx");
const focusMember = process.argv[3] || null;

runWithOrg("assurance", () => {
  const db = getDb();
  const members = db.prepare("SELECT id, name FROM members ORDER BY name").all();
  const memberNames = members.map((m) => m.name);

  const txs = parseReferenceLedgerXlsx(xlsxPath, memberNames);
  const ledgerByMember = new Map();
  const unassigned = [];

  for (const tx of txs) {
    if (tx.ledgerType === "deposit" || tx.ledgerType === "withdrawal") {
      if (!tx.member && tx.ledgerType === "deposit") {
        unassigned.push(tx);
        continue;
      }
      if (!tx.member) continue;
      ledgerByMember.set(tx.member, (ledgerByMember.get(tx.member) || 0) + tx.amount);
    }
  }

  const mismatches = [];
  for (const m of members) {
    const dbBalance = getMemberDepositAccountBalance(m.id);
    const ledgerBalance = ledgerByMember.get(m.name) ?? 0;
    const diff = Math.round((dbBalance - ledgerBalance) * 100) / 100;
    if (Math.abs(diff) > 0.02) {
      mismatches.push({ name: m.name, id: m.id, dbBalance, ledgerBalance, diff });
    }
  }
  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log("=== Member balances: app vs ledger (deposits + withdrawals) ===\n");
  for (const r of mismatches) {
    console.log(
      `${r.name}: app $${r.dbBalance.toFixed(2)} | ledger $${r.ledgerBalance.toFixed(2)} | off $${r.diff.toFixed(2)}`
    );
  }
  console.log(`\nTotal mismatches: ${mismatches.length}`);

  if (unassigned.length) {
    console.log(`\n=== Unassigned deposits in ledger (${unassigned.length}) ===`);
    let total = 0;
    for (const tx of unassigned) {
      total += tx.amount;
      const guess = resolveDepositMemberFromDescription(tx.description, memberNames);
      console.log(
        `${tx.date}  $${tx.amount.toFixed(2)}  guess:${guess || "—"}  ${tx.description.slice(0, 65)}`
      );
    }
    console.log(`Total unassigned: $${total.toFixed(2)}`);
  }

  if (focusMember) {
    const m = members.find((row) => row.name === focusMember);
    if (!m) {
      console.error("Member not found:", focusMember);
      process.exit(1);
    }
    const types = ["deposit", "withdrawal", "distribution", "membership_fee"];
    const ph = types.map(() => "?").join(", ");
    const dbRows = db
      .prepare(
        `SELECT type, amount, transaction_date, description
         FROM transactions WHERE member_id = ? AND type IN (${ph})
         ORDER BY transaction_date, id`
      )
      .all(m.id, ...types);
    const ledgerRows = txs.filter(
      (t) =>
        t.member === focusMember &&
        (t.ledgerType === "deposit" || t.ledgerType === "withdrawal")
    );

    console.log(`\n=== Detail: ${focusMember} ===`);
    console.log(`DB sum: $${dbRows.reduce((s, r) => s + r.amount, 0).toFixed(2)} (${dbRows.length} rows)`);
    console.log(
      `Ledger sum: $${ledgerRows.reduce((s, r) => s + r.amount, 0).toFixed(2)} (${ledgerRows.length} rows)`
    );

    const dbKeys = new Set(dbRows.map((r) => `${r.transaction_date}|${r.amount.toFixed(2)}`));
    const ledgerKeys = new Set(
      ledgerRows.map((r) => `${r.date}|${r.amount.toFixed(2)}`)
    );
    const missingInDb = ledgerRows.filter(
      (r) => !dbKeys.has(`${r.date}|${r.amount.toFixed(2)}`)
    );
    const missingInLedger = dbRows.filter(
      (r) => !ledgerKeys.has(`${r.transaction_date}|${r.amount.toFixed(2)}`)
    );
    if (missingInDb.length) {
      console.log("\nIn ledger, not in DB:");
      missingInDb.forEach((r) =>
        console.log(`  ${r.date}  $${r.amount}  ${r.description.slice(0, 60)}`)
      );
    }
    if (missingInLedger.length) {
      console.log("\nIn DB, not in ledger:");
      missingInLedger.forEach((r) =>
        console.log(
          `  ${r.transaction_date}  $${r.amount}  ${r.type}  ${(r.description || "").slice(0, 55)}`
        )
      );
    }
  }

  closeDb();
});
