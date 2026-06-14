#!/usr/bin/env node
const path = require("path");
const { importWpformsProfiles } = require("../lib/import-wpforms-profiles");
const { closeDb, DATA_DIR } = require("../db/database");

const csvPath =
  process.argv[2] ||
  path.join(
    __dirname,
    "..",
    "..",
    "wpforms-5-Assurance-Investment-and-Cooperative-Inc.-New-Membership-Application-2025-09-17-17-31-51.csv"
  );

try {
  const result = importWpformsProfiles(csvPath, {
    exportDir: path.join(DATA_DIR, "exports"),
  });

  console.log(`Applications in CSV: ${result.applicationCount}`);
  console.log(`Profiles linked to accounts: ${result.matchedCount}\n`);

  if (result.matched.length) {
    console.log("Matched:");
    result.matched.forEach((m) => {
      console.log(`  ${m.applicationName} → ${m.ledgerName} (account #${m.memberId})`);
    });
  }

  if (result.unmatchedApplications.length) {
    console.log("\nApplications NOT matched to any ledger account:");
    result.unmatchedApplications.forEach((n) => console.log(`  - ${n}`));
  }

  if (result.membersWithoutApplication.length) {
    console.log("\nLedger accounts with NO application on file:");
    result.membersWithoutApplication.forEach((n) => console.log(`  - ${n}`));
  }

  console.log(`\nExported: ${path.join(DATA_DIR, "exports", "member-profiles.json")}`);
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
} finally {
  closeDb();
}
