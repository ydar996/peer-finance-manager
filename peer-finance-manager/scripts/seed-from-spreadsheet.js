#!/usr/bin/env node
const path = require("path");
const { importFromSpreadsheet } = require("../lib/import-spreadsheet");
const { listMembersWithBalances } = require("../lib/balance-service");
const { closeDb } = require("../db/database");

const workbookPath =
  process.argv[2] ||
  path.join(__dirname, "..", "..", "Assurance Status 4 2026.xlsx");
const sheetName = process.argv[3] || "April 2026";

try {
  const result = importFromSpreadsheet(workbookPath, sheetName, {
    replaceExisting: true,
  });
  console.log(`Imported ${result.memberCount} members, ${result.transactionCount} transactions`);
  const members = listMembersWithBalances();
  console.log("\nMember balances:");
  members.forEach((m) => {
    console.log(`  ${m.name}: ${m.balance.toFixed(2)}`);
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
} finally {
  closeDb();
}
