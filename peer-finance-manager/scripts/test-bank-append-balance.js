#!/usr/bin/env node
/**
 * Regression: append preview must tie to statement ending when base ledger is correct.
 *
 * Usage:
 *   node scripts/test-bank-append-balance.js [--org assurance] [--stmt path.csv]
 *
 * Exits 0 when:
 *   - Ledger-short block only when ledger < statement beginning
 *   - Cumulative re-upload (ledger > statement beginning) is allowed; duplicates skipped
 *   - New rows project to statement ending (or all rows skipped / no ending on stmt)
 *   - Saheed-style alias rows classify as loan_repayment when configured
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { initPaths } = require("../lib/paths");
const { runWithOrg } = require("../lib/org-context");
const { ASSURANCE_SLUG } = require("../lib/organization-service");
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
    org: ASSURANCE_SLUG,
    stmt:
      process.env.PFM_STMT_FILE ||
      path.join(process.env.USERPROFILE || "", "Downloads", "stmt (8).csv"),
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--org" && argv[i + 1]) out.org = argv[++i];
    else if (argv[i] === "--stmt" && argv[i + 1]) out.stmt = path.resolve(argv[++i]);
  }
  return out;
}

function testSaheedAliasClassification(memberNames) {
  const rules = getImportRules();
  const result = classifyRow({
    description: "Zelle payment from SAHEED SALAMI Conf# abc123",
    amount: 500,
    member: null,
    memberNames,
    rules,
  });
  assert.strictEqual(result.member, "Yomi Salami", "SAHEED SALAMI alias should map to Yomi Salami");
  assert.strictEqual(
    result.ledgerType,
    "loan_repayment",
    "SAHEED SALAMI alias default type should be loan_repayment"
  );
  console.log("  alias classification (SAHEED → Yomi / Loan Repayment): OK");
}

function testComputeAppendBalanceCheck() {
  const cumulativeReplay = computeAppendBalanceCheck({
    ledgerBefore: 16241.55,
    statementBeginning: 15471.49,
    statementEnding: 16241.55,
    projectedLedger: 16241.55,
    readyCount: 0,
    skippedCount: 4,
  });
  assert.strictEqual(cumulativeReplay.openingBlock, false, "cumulative re-upload must not block on pre-period gap");
  assert.strictEqual(cumulativeReplay.ledgerShort, false);
  assert.strictEqual(cumulativeReplay.idempotentReplay, true);
  assert.strictEqual(cumulativeReplay.mismatch, false);
  console.log("  cumulative re-upload (all skipped, ledger above stmt beginning): OK");

  const partialNew = computeAppendBalanceCheck({
    ledgerBefore: 16241.55,
    statementBeginning: 15471.49,
    statementEnding: 16500,
    projectedLedger: 16500,
    readyCount: 2,
    skippedCount: 4,
  });
  assert.strictEqual(partialNew.openingBlock, false);
  assert.strictEqual(partialNew.mismatch, false);
  console.log("  cumulative re-upload with new rows tying to ending: OK");

  const partialMismatch = computeAppendBalanceCheck({
    ledgerBefore: 16241.55,
    statementBeginning: 15471.49,
    statementEnding: 16500,
    projectedLedger: 16400,
    readyCount: 1,
    skippedCount: 4,
  });
  assert.strictEqual(partialMismatch.mismatch, true);
  console.log("  new rows failing ending tie-out blocks apply: OK");

  const ledgerShort = computeAppendBalanceCheck({
    ledgerBefore: 15000,
    statementBeginning: 15471.49,
    statementEnding: 16241.55,
    projectedLedger: 16241.55,
    readyCount: 4,
    skippedCount: 0,
  });
  assert.strictEqual(ledgerShort.openingBlock, true);
  assert.strictEqual(ledgerShort.ledgerShort, true);
  console.log("  ledger below statement beginning blocks apply: OK");
}

runWithOrg(parseArgs(process.argv).org, () => {
  const args = parseArgs(process.argv);

  testComputeAppendBalanceCheck();

  if (!fs.existsSync(args.stmt)) {
    console.log(`Statement file not found (skipping live preview): ${args.stmt}`);
    console.log("test-bank-append-balance: OK (unit checks only)");
    closeDb();
    return;
  }

  const { getDb } = require("../db/database");
  const db = getDb();
  const memberNames = db.prepare(`SELECT name FROM members ORDER BY name`).all().map((r) => r.name);
  assert.ok(memberNames.length, "members required");

  testSaheedAliasClassification(memberNames);

  const preview = previewBankStatementAppend({
    filePath: args.stmt,
    originalName: path.basename(args.stmt),
  });

  const bc = preview.summary?.balanceCheck || {};
  const ready = preview.summary?.ready || 0;
  const skipped = preview.summary?.skipped || 0;

  console.log(`Org: ${args.org}`);
  console.log(`Statement: ${args.stmt}`);
  console.log(`Preview: ready=${ready} skipped=${skipped} needsReview=${preview.summary?.needsReview || 0}`);
  if (bc.ledgerBefore != null) console.log(`Ledger before: ${bc.ledgerBefore}`);
  if (bc.statementBeginning != null) console.log(`Statement beginning: ${bc.statementBeginning}`);
  if (bc.projectedLedger != null) console.log(`Projected after import: ${bc.projectedLedger}`);
  if (bc.statementEnding != null) console.log(`Statement ending: ${bc.statementEnding}`);

  assert.strictEqual(bc.openingBlock, false, "live preview must not block on pre-period gap when ledger is current");
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

  const saheedRow = preview.rows.find((r) => /SAHEED\s+SALAMI/i.test(r.description || ""));
  if (saheedRow && saheedRow.bucket !== "skipped") {
    assert.strictEqual(saheedRow.ledgerType, "loan_repayment");
    assert.strictEqual(saheedRow.member, "Yomi Salami");
    console.log("  Saheed row in preview: Loan Repayment / Yomi Salami");
  }

  console.log("test-bank-append-balance: OK");
  closeDb();
});
