#!/usr/bin/env node
const path = require("path");
const { initPaths } = require("../lib/paths");
initPaths(path.join(__dirname, "../.."));
const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, getDb } = require("../db/database");
const { getLedgerEndingBalance } = require("../lib/cooperative-bank-ledger-csv");

runWithOrg("assurance", () => {
  openOrgDatabase("assurance");
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.id, t.transaction_date, t.type, t.amount, t.description, m.name AS member
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
       WHERE t.source IN ('bank_import', 'manual')
         AND t.transaction_date >= '2026-06-01'
       ORDER BY t.transaction_date, t.id`
    )
    .all();
  let run = 0;
  const prior = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS total FROM transactions t
       WHERE t.source IN ('bank_import','manual')
         AND t.transaction_date < '2026-06-01'`
    )
    .get();
  run = prior.total;
  console.log("Balance before June:", run.toFixed(2));
  for (const r of rows) {
    run = Math.round((run + r.amount) * 100) / 100;
    console.log(
      r.transaction_date,
      Number(r.amount).toFixed(2),
      r.type,
      r.member || "-",
      "=>",
      run.toFixed(2),
      String(r.description || "").slice(0, 45)
    );
  }
  console.log("\ngetLedgerEndingBalance:", getLedgerEndingBalance());
});
