#!/usr/bin/env node
/**
 * Regression: append preview contract for every tenant (org-isolated DB).
 *
 * Usage:
 *   node scripts/test-bank-append-balance.js
 *   node scripts/test-bank-append-balance.js --org <slug> --stmt <path.csv>
 *
 * Unit checks always run (no DB). Live preview runs only when --org and --stmt are set
 * (or PFM_STMT_FILE + PFM_TEST_ORG env vars).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { initPaths } = require("../lib/paths");
const { runWithOrg } = require("../lib/org-context");
const { closeDb } = require("../db/database");
const {
  previewBankStatementAppend,
  computeAppendBalanceCheck,
} = require("../lib/bank-import-append");
const { classifyRow } = require("../lib/import-format-service");
const { getImportRules } = require("../lib/import-rules-service");

const coopRoot = path.join(__dirname, "..", "..");
initPaths(coopRoot);

function parseArgs(argv) {
  const out = {
    org: process.env.PFM_TEST_ORG || null,
    stmt: process.env.PFM_STMT_FILE || null,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--org" && argv[i + 1]) out.org = argv[++i];
    else if (argv[i] === "--stmt" && argv[i + 1]) out.stmt = path.resolve(argv[++i]);
  }
  return out;
}

function testGenericKeywordClassification(memberNames) {
  const rules = getImportRules();
  const deposit = classifyRow({
    description: "Zelle payment for monthly member contribution",
    amount: 50,
    member: null,
    memberNames,
    rules,
  });
  assert.strictEqual(deposit.ledgerType, "deposit", "contribution keyword should classify as deposit");
  const repayment = classifyRow({
    description: "Zelle payment loan repayment from member",
    amount: 100,
    member: null,
    memberNames,
    rules,
  });
  assert.strictEqual(
    repayment.ledgerType,
    "loan_repayment",
    "loan repayment keyword should classify as loan_repayment"
  );
  console.log("  keyword classification (deposit / loan repayment): OK");
}

function testPaymentAliasIfConfigured(memberNames) {
  const rules = getImportRules();
  const result = classifyRow({
    description: "Zelle payment from SAHEED SALAMI Conf# abc123",
    amount: 500,
    member: null,
    memberNames,
    rules,
  });
  if (result.member !== "Yomi Salami") {
    console.log("  payment alias sample: skipped (no SAHEED SALAMI mapping in this org)");
    return;
  }
  assert.strictEqual(result.ledgerType, "loan_repayment");
  console.log("  payment alias default type (org-specific sample): OK");
}

function testComputeAppendBalanceCheck() {
  const cumulativeReplay = computeAppendBalanceCheck({
    ledgerBefore: 10200,
    statementBeginning: 10000,
    statementEnding: 10200,
    projectedLedger: 10200,
    readyCount: 0,
    skippedCount: 3,
  });
  assert.strictEqual(
    cumulativeReplay.openingBlock,
    false,
    "cumulative re-upload must not block on pre-period gap"
  );
  assert.strictEqual(cumulativeReplay.ledgerShort, false);
  assert.strictEqual(cumulativeReplay.idempotentReplay, true);
  assert.strictEqual(cumulativeReplay.mismatch, false);
  console.log("  cumulative re-upload (all skipped, ledger above stmt beginning): OK");

  const partialNew = computeAppendBalanceCheck({
    ledgerBefore: 10200,
    statementBeginning: 10000,
    statementEnding: 10500,
    projectedLedger: 10500,
    readyCount: 2,
    skippedCount: 3,
  });
  assert.strictEqual(partialNew.openingBlock, false);
  assert.strictEqual(partialNew.mismatch, false);
  console.log("  cumulative re-upload with new rows tying to ending: OK");

  const partialMismatch = computeAppendBalanceCheck({
    ledgerBefore: 10200,
    statementBeginning: 10000,
    statementEnding: 10500,
    projectedLedger: 10400,
    readyCount: 1,
    skippedCount: 3,
  });
  assert.strictEqual(partialMismatch.mismatch, true);
  console.log("  new rows failing ending tie-out blocks apply: OK");

  const ledgerShort = computeAppendBalanceCheck({
    ledgerBefore: 9500,
    statementBeginning: 10000,
    statementEnding: 10200,
    projectedLedger: 10200,
    readyCount: 4,
    skippedCount: 0,
  });
  assert.strictEqual(ledgerShort.openingBlock, true);
  assert.strictEqual(ledgerShort.ledgerShort, true);
  console.log("  ledger below statement beginning blocks apply: OK");
}

const args = parseArgs(process.argv);

testComputeAppendBalanceCheck();

if (!args.org || !args.stmt) {
  console.log(
    "Live org preview skipped (pass --org <slug> --stmt <file.csv> or set PFM_TEST_ORG + PFM_STMT_FILE)."
  );
  console.log("test-bank-append-balance: OK (unit checks only)");
  process.exit(0);
}

if (!fs.existsSync(args.stmt)) {
  console.error(`Statement file not found: ${args.stmt}`);
  process.exit(1);
}

runWithOrg(args.org, () => {
  const { getDb } = require("../db/database");
  const db = getDb();
  const memberNames = db.prepare(`SELECT name FROM members ORDER BY name`).all().map((r) => r.name);
  assert.ok(memberNames.length, "members required");

  testGenericKeywordClassification(memberNames);
  testPaymentAliasIfConfigured(memberNames);

  const preview = previewBankStatementAppend({
    filePath: args.stmt,
    originalName: path.basename(args.stmt),
  });

  const bc = preview.summary?.balanceCheck || {};
  const ready = preview.summary?.ready || 0;
  const skipped = preview.summary?.skipped || 0;

  console.log(`Org: ${args.org}`);
  console.log(`Statement: ${args.stmt}`);
  console.log(
    `Preview: ready=${ready} skipped=${skipped} needsReview=${preview.summary?.needsReview || 0}`
  );
  if (bc.ledgerBefore != null) console.log(`Ledger before: ${bc.ledgerBefore}`);
  if (bc.statementBeginning != null) console.log(`Statement beginning: ${bc.statementBeginning}`);
  if (bc.projectedLedger != null) console.log(`Projected after import: ${bc.projectedLedger}`);
  if (bc.statementEnding != null) console.log(`Statement ending: ${bc.statementEnding}`);

  assert.strictEqual(
    bc.openingBlock,
    false,
    "live preview must not block on pre-period gap when ledger is current"
  );
  assert.strictEqual(bc.ledgerShort, false);

  if (ready > 0 && bc.statementEnding != null && bc.projectedLedger != null) {
    assert.strictEqual(
      bc.periodCloseMismatch,
      false,
      `Ending mismatch: projected ${bc.projectedLedger} vs statement ${bc.statementEnding}`
    );
    console.log("  ending balance tie-out: OK");
  } else if (skipped > 0 && ready === 0 && bc.statementEnding != null && bc.ledgerBefore != null) {
    assert.ok(
      Math.abs(bc.ledgerBefore - bc.statementEnding) <= 0.02,
      `Ledger ${bc.ledgerBefore} should match statement ending ${bc.statementEnding} when all rows skipped`
    );
    assert.strictEqual(bc.idempotentReplay, true);
    console.log("  ledger already at statement ending (idempotent re-upload): OK");
  } else if (skipped > 0 && ready === 0) {
    console.log("  all stmt rows already in ledger (skipped): OK for idempotent re-upload");
  }

  console.log("test-bank-append-balance: OK");
  closeDb();
});
