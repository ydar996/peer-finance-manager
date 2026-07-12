#!/usr/bin/env node
/**
 * Backfill Title Case on member_profiles (and members.name when safe).
 *
 * Usage:
 *   node peer-finance-manager/scripts/normalize-profiles.js --dry-run
 *   node peer-finance-manager/scripts/normalize-profiles.js --apply
 *   node peer-finance-manager/scripts/normalize-profiles.js --org <slug> --apply
 *
 * Prefer Admin → Maintenance → Normalize Profiles on production (no WinSCP).
 */
const path = require("path");
const { initPaths } = require("../lib/paths");
const { runWithOrg } = require("../lib/org-context");
const { ASSURANCE_SLUG } = require("../lib/organization-service");
const { getDb, closeDb } = require("../db/database");
const { normalizeAllProfiles } = require("../lib/profile-normalize-service");

initPaths(path.join(__dirname, "..", ".."));

function parseArgs(argv) {
  const out = { org: ASSURANCE_SLUG, apply: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--org" && argv[i + 1]) out.org = argv[++i];
    else if (argv[i] === "--apply") out.apply = true;
    else if (argv[i] === "--dry-run") out.apply = false;
  }
  return out;
}

const { org, apply } = parseArgs(process.argv);

runWithOrg(org, () => {
  const db = getDb();
  const result = normalizeAllProfiles(db, { apply });
  console.log(
    `${result.dryRun ? "Dry run" : "Applied"}: ${result.scanned} profiles scanned; ${result.wouldChange} would change`
  );
  if (apply) {
    console.log(
      `Profiles updated: ${result.profileUpdates}; ledger names updated: ${result.memberNameUpdates}`
    );
  }
  if (result.skippedNames?.length) {
    console.log(`Skipped ${result.skippedNames.length} ledger name(s) due to uniqueness.`);
  }
  if (result.dryRun && result.wouldChange) {
    console.log("Re-run with --apply to write changes, or use Admin → Maintenance on production.");
  }
  closeDb();
});
