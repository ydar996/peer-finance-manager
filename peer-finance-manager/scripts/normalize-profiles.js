#!/usr/bin/env node
/**
 * Backfill Title Case on member_profiles (and members.name when safe).
 *
 * Usage:
 *   node peer-finance-manager/scripts/normalize-profiles.js --dry-run
 *   node peer-finance-manager/scripts/normalize-profiles.js --apply
 */
const path = require("path");
const { initPaths } = require("../lib/paths");
const { runWithOrg } = require("../lib/org-context");
const { ASSURANCE_SLUG } = require("../lib/organization-service");
const { getDb, closeDb } = require("../db/database");
const { normalizeProfileFields, formatPersonName } = require("../lib/text-format");

initPaths(path.join(__dirname, "..", ".."));

const PROFILE_COLUMNS = [
  "first_name",
  "middle_name",
  "last_name",
  "display_name",
  "gender",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "country",
  "next_of_kin_first_name",
  "next_of_kin_last_name",
  "next_of_kin_relationship",
  "signature_name",
  "email",
  "next_of_kin_email",
];

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  if (apply && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --apply, not both");
  }
  return { dryRun, apply };
}

function profileChanges(before, after) {
  const changes = {};
  for (const col of PROFILE_COLUMNS) {
    const from = before[col] ?? null;
    const to = after[col] ?? null;
    if (from !== to) changes[col] = { from, to };
  }
  return changes;
}

runWithOrg(ASSURANCE_SLUG, () => {
  const { dryRun, apply } = parseArgs(process.argv.slice(2));
  const db = getDb();

  const profiles = db
    .prepare(
      `SELECT p.*, m.name AS ledger_name
       FROM member_profiles p
       JOIN members m ON m.id = p.member_id
       ORDER BY m.name`
    )
    .all();

  let profileUpdateCount = 0;
  let memberNameUpdateCount = 0;
  const skippedNames = [];

  for (const row of profiles) {
    const normalized = normalizeProfileFields(row);
    const changes = profileChanges(row, normalized);

    const formattedLedgerName = formatPersonName(row.ledger_name);
    const ledgerWouldChange =
      formattedLedgerName && formattedLedgerName !== row.ledger_name;

    if (!Object.keys(changes).length && !ledgerWouldChange) continue;

    console.log(`\n${row.ledger_name} (member ${row.member_id})`);
    for (const [col, { from, to }] of Object.entries(changes)) {
      console.log(`  ${col}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
    }
    if (ledgerWouldChange) {
      console.log(
        `  members.name: ${JSON.stringify(row.ledger_name)} → ${JSON.stringify(formattedLedgerName)}`
      );
    }

    if (apply) {
      if (Object.keys(changes).length) {
        const sets = Object.keys(changes)
          .map((col) => `${col} = @${col}`)
          .join(", ");
        const params = { member_id: row.member_id };
        for (const col of Object.keys(changes)) params[col] = normalized[col];
        db.prepare(
          `UPDATE member_profiles SET ${sets}, updated_at = datetime('now') WHERE member_id = @member_id`
        ).run(params);
        profileUpdateCount += 1;
      }

      if (ledgerWouldChange) {
        const clash = db
          .prepare(`SELECT id FROM members WHERE name = ? AND id != ?`)
          .get(formattedLedgerName, row.member_id);
        if (clash) {
          skippedNames.push({ memberId: row.member_id, name: row.ledger_name, target: formattedLedgerName });
          console.log("  (skipped members.name — target already in use)");
        } else {
          db.prepare(`UPDATE members SET name = ? WHERE id = ?`).run(
            formattedLedgerName,
            row.member_id
          );
          memberNameUpdateCount += 1;
        }
      }
    }
  }

  console.log(
    `\n${dryRun ? "Dry run" : "Applied"}: ${profiles.length} profiles scanned` +
      (apply
        ? `; ${profileUpdateCount} profiles updated; ${memberNameUpdateCount} ledger names updated`
        : "")
  );
  if (skippedNames.length) {
    console.log(`Skipped ${skippedNames.length} ledger name(s) due to uniqueness:`);
    skippedNames.forEach((s) =>
      console.log(`  member ${s.memberId}: ${s.name} → ${s.target}`)
    );
  }
  if (dryRun) {
    console.log("\nRe-run with --apply to write changes.");
  }

  closeDb();
});
