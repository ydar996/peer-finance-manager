#!/usr/bin/env node
/**
 * Assurance convenience wrapper for restore-ledger-production.js.
 * Uses cooperative-bank-ledger-reference.xlsx (master + July with correct types).
 * Rebuild that file first: node scripts/build-assurance-reference-with-july.js
 *
 * Do NOT pass stmt (8).csv here: it re-classifies Saheed $500 as Member Deposit.
 *
 * Usage:
 *   node scripts/build-assurance-reference-with-july.js
 *   node scripts/restore-assurance-ledger-production.js
 */
const { spawnSync } = require("child_process");
const path = require("path");

const coopRoot = path.join(__dirname, "..", "..");
const defaultLedger = path.join(coopRoot, "data", "cooperative-bank-ledger-reference.xlsx");

if (process.argv[2]) {
  console.error(
    "This wrapper no longer accepts a statement file. Build reference xlsx with July rows first:\n" +
      "  node scripts/build-assurance-reference-with-july.js\n" +
      "Edit Ledger Type there if needed, then run this script with no arguments."
  );
  process.exit(1);
}

const args = [
  path.join(__dirname, "restore-ledger-production.js"),
  "--org",
  "assurance",
  "--ledger",
  process.env.PFM_LEDGER_FILE || defaultLedger,
];

const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status ?? 1);

