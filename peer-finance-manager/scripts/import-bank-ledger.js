#!/usr/bin/env node
const path = require("path");
const { initPaths } = require("../lib/paths");
const { importBankLedger } = require("../lib/import-bank-ledger");
const { closeDb } = require("../db/database");

const coopRoot = path.join(__dirname, "..", "..");
initPaths(coopRoot);

const xlsxPath =
  process.argv[2] || path.join(coopRoot, "All deposits.xlsx");
const csvPath =
  process.argv[3] || path.join(coopRoot, "data", "bank-statement-2026.csv");
const cdBalance = process.argv[4] || "7193.74";

try {
  const result = importBankLedger({
    xlsxPath,
    csvPath,
    cdBalance,
    replaceSpreadsheetDeposits: true,
  });
  console.log("Bank ledger import complete:");
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
} finally {
  closeDb();
}
