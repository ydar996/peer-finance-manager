#!/usr/bin/env node
const path = require("path");
const { initPaths } = require("../lib/paths");
initPaths(path.join(__dirname, "../.."));
const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, getDb } = require("../db/database");
const { parseReferenceLedgerXlsx } = require("../lib/parse-bank-sources");

const xlsxPath =
  process.argv[2] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.xlsx");
const org = process.argv[3] || "assurance";

function rowKey(parts) {
  return parts.join("|");
}

function xlsxKey(tx) {
  return rowKey([
    tx.date,
    Number(tx.amount).toFixed(2),
    tx.ledgerType || "",
    tx.member || "",
    String(tx.description || "").slice(0, 60),
  ]);
}

function dbKey(row) {
  return rowKey([
    row.transaction_date,
    Number(row.amount).toFixed(2),
    row.type || "",
    row.member || "",
    String(row.description || "").slice(0, 60),
  ]);
}

runWithOrg(org, () => {
  openOrgDatabase(org);
  const db = getDb();
  const xlsxTxs = parseReferenceLedgerXlsx(xlsxPath, []);
  const dbRows = db
    .prepare(
      `SELECT t.transaction_date, t.type, t.amount, t.description, m.name AS member
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
       WHERE t.source IN ('bank_import', 'manual')
       ORDER BY t.transaction_date, t.id`
    )
    .all();

  const dbKeySet = new Set(dbRows.map(dbKey));
  const xlsxKeySet = new Set(xlsxTxs.map(xlsxKey));

  const missing = xlsxTxs.filter((tx) => !dbKeySet.has(xlsxKey(tx)));
  const extra = dbRows.filter((row) => !xlsxKeySet.has(dbKey(row)));

  let xlsxSum = 0;
  for (const tx of xlsxTxs) xlsxSum = Math.round((xlsxSum + tx.amount) * 100) / 100;

  let dbSum = 0;
  for (const row of dbRows) dbSum = Math.round((dbSum + row.amount) * 100) / 100;

  console.log("XLSX:", xlsxTxs.length, "rows, sum", xlsxSum.toFixed(2));
  console.log("DB:", dbRows.length, "rows, sum", dbSum.toFixed(2));
  console.log("Gap (xlsx - db):", (xlsxSum - dbSum).toFixed(2));
  console.log("\nMissing from DB:", missing.length);
  for (const tx of missing) {
    console.log(
      `  ${tx.date}  ${Number(tx.amount).toFixed(2)}  ${tx.ledgerType}  ${tx.member || "(no member)"}  ${String(tx.description || "").slice(0, 55)}`
    );
  }
  console.log("\nExtra in DB:", extra.length);
  for (const row of extra.slice(0, 15)) {
    console.log(
      `  ${row.transaction_date}  ${Number(row.amount).toFixed(2)}  ${row.type}  ${row.member || "(no member)"}  ${String(row.description || "").slice(0, 55)}`
    );
  }
});
