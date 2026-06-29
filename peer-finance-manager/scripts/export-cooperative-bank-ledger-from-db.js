#!/usr/bin/env node
/**
 * Export cooperative bank ledger CSV + workbook from the database.
 */
const path = require("path");
const { initPaths } = require("../lib/paths");
const { closeDb } = require("../db/database");
const { runWithOrg } = require("../lib/org-context");
const { syncCooperativeBankLedgerCsvFiles } = require("../lib/cooperative-bank-ledger-csv");

const ASSURANCE_SLUG = "assurance";
const coopRoot = path.join(__dirname, "..", "..");

function main() {
  initPaths(coopRoot);

  runWithOrg(ASSURANCE_SLUG, () => {
    try {
      const result = syncCooperativeBankLedgerCsvFiles();
      console.log("Cooperative bank ledger export complete:");
      console.log("  Transactions:", result.transactionCount);
      console.log("  CSV:", result.csvPath);
      console.log("  Workbook:", result.xlsxPath);
    } finally {
      closeDb();
    }
  });
}

main();
