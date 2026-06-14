#!/usr/bin/env node
const path = require("path");
const { getDb, closeDb } = require("../db/database");
const { provisionAllMemberAccounts } = require("../lib/auth-service");

getDb();
const result = provisionAllMemberAccounts();
console.log(`Created: ${result.created.length}`);
console.log(`Skipped: ${result.skipped.length}`);
console.log(`Export: ${result.exportPath}`);
if (result.created.length) {
  console.log("\nMember credentials:");
  for (const row of result.created) {
    console.log(`  ${row.memberName} | ${row.username} | ${row.tempPassword}`);
  }
}
if (result.skipped.length) {
  console.log("\nSkipped:");
  for (const row of result.skipped) {
    console.log(`  ${row.memberName} | ${row.reason}`);
  }
}
closeDb();
