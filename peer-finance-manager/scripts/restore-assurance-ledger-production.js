#!/usr/bin/env node
/**
 * Assurance one-command ledger restore: build reference from master + July stmt, then
 * Full Ledger Refresh on production.
 *
 * Golden master: data/master-ledger/cooperative-bank-ledger-master.xlsx (through 6/29/2026)
 * July stmt: Downloads/stmt (8).csv by default (override with PFM_STMT_FILE)
 *
 * Do NOT append stmt via Import New Bank Activity: Saheed $500 auto-classifies wrong.
 *
 * Usage:
 *   node scripts/restore-assurance-ledger-production.js
 *   set PFM_STMT_FILE=C:\Users\yinka\Downloads\stmt (8).csv
 */
const { spawnSync } = require("child_process");
const path = require("path");

const scriptsDir = __dirname;
const coopRoot = path.join(scriptsDir, "..", "..");
const defaultStmt = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Downloads",
  "stmt (8).csv"
);
const stmtFile = process.env.PFM_STMT_FILE || defaultStmt;
const defaultLedger = path.join(coopRoot, "data", "cooperative-bank-ledger-reference.xlsx");

if (process.argv[2]) {
  console.error(
    "This wrapper does not accept CLI statement paths. Set PFM_STMT_FILE or use default Downloads/stmt (8).csv.\n" +
      "Workflow: build reference from master + stmt, then Full Ledger Refresh only."
  );
  process.exit(1);
}

console.log("Step 0: Build reference from golden master + July statement");
const build = spawnSync(
  process.execPath,
  [path.join(scriptsDir, "build-assurance-reference-with-july.js"), stmtFile],
  { stdio: "inherit" }
);
if (build.status !== 0) process.exit(build.status ?? 1);

console.log("\nStep 1: Full Ledger Refresh on production");
const restore = spawnSync(
  process.execPath,
  [
    path.join(scriptsDir, "restore-ledger-production.js"),
    "--org",
    "assurance",
    "--ledger",
    process.env.PFM_LEDGER_FILE || defaultLedger,
  ],
  {
    stdio: "inherit",
    env: { ...process.env, PFM_EXPECT_ENDING: "16241.55" },
  }
);
process.exit(restore.status ?? 1);
