#!/usr/bin/env node
/**
 * Regression: append preview must tie to statement ending when base ledger is correct.
 *
 * Usage:
 *   node scripts/test-bank-append-balance.js [--org assurance] [--stmt path.csv]
 *
 * Exits 0 when:
 *   - Opening aligns with statement beginning (or stmt has no beginning)
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
const { previewBankStatementAppend } = require("../lib/bank-import-append");
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

runWithOrg(parseArgs(process.argv).org, () => {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.stmt)) {
    console.error(`Statement file not found: ${args.stmt}`);
    process.exit(1);
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

  if (ready > 0 && bc.statementBeginning != null && bc.ledgerBefore != null) {
    assert.strictEqual(
      bc.openingAligned,
      true,
      `Opening mismatch: ledger ${bc.ledgerBefore} vs statement beginning ${bc.statementBeginning}`
    );
    console.log("  opening balance alignment: OK");
  } else if (skipped > 0 && ready === 0 && bc.statementEnding != null && bc.ledgerBefore != null) {
    assert.ok(
      Math.abs(bc.ledgerBefore - bc.statementEnding) <= 0.02,
      `Ledger ${bc.ledgerBefore} should match statement ending ${bc.statementEnding} when all rows skipped`
    );
    console.log("  ledger already at statement ending (idempotent re-upload): OK");
  }

  if (ready > 0 && bc.statementEnding != null && bc.projectedLedger != null) {
    assert.strictEqual(
      bc.periodCloseMismatch,
      false,
      `Ending mismatch: projected ${bc.projectedLedger} vs statement ${bc.statementEnding}`
    );
    console.log("  ending balance tie-out: OK");
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
