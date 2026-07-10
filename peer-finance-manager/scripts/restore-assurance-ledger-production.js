#!/usr/bin/env node
/**
 * Assurance convenience wrapper for restore-ledger-production.js.
 *
 * Usage:
 *   node scripts/restore-assurance-ledger-production.js
 *   node scripts/restore-assurance-ledger-production.js "C:\\Users\\yinka\\Downloads\\stmt (8).csv"
 */
const { spawnSync } = require("child_process");
const path = require("path");

const coopRoot = path.join(__dirname, "..", "..");
const defaultLedger = path.join(
  coopRoot,
  "data",
  "master-ledger",
  "cooperative-bank-ledger-master.xlsx"
);

const args = [
  path.join(__dirname, "restore-ledger-production.js"),
  "--org",
  "assurance",
  "--ledger",
  process.env.PFM_LEDGER_FILE || defaultLedger,
];
if (process.argv[2]) {
  args.push("--stmt", process.argv[2]);
}

const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
