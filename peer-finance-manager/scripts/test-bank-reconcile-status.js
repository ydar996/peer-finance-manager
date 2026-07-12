#!/usr/bin/env node
/**
 * Regression: bank reconcile anchor + out-of-sync detection (all tenants).
 *
 * Usage:
 *   node scripts/test-bank-reconcile-status.js
 */
const assert = require("assert");
const {
  compareBankReconcileStatus,
  BALANCE_TOLERANCE,
} = require("../lib/bank-reconcile-service");

function testReconciledWhenAnchorMatchesLive() {
  const result = compareBankReconcileStatus({
    anchor: {
      balance: 16241.55,
      asOf: "2026-07-08",
      bankImportRows: 457,
      verifiedAt: "2026-07-10T12:00:00.000Z",
      source: "append",
      label: "stmt.csv",
    },
    liveBalanceAtAnchor: { balance: 16241.55, asOf: "2026-07-08" },
    liveBankImportRows: 457,
    liveLedger: { balance: 16241.55, asOf: "2026-07-08" },
  });
  assert.strictEqual(result.status, "reconciled");
  assert.strictEqual(result.divergences.length, 0);
  console.log("  reconciled when anchor matches live: OK");
}

function testOutOfSyncOnRowCountDrift() {
  const result = compareBankReconcileStatus({
    anchor: {
      balance: 16241.55,
      asOf: "2026-07-08",
      bankImportRows: 457,
      verifiedAt: "2026-07-10T12:00:00.000Z",
      source: "append",
      label: null,
    },
    liveBalanceAtAnchor: { balance: 16241.55, asOf: "2026-07-08" },
    liveBankImportRows: 459,
    liveLedger: { balance: 16241.55, asOf: "2026-07-08" },
  });
  assert.strictEqual(result.status, "out_of_sync");
  assert.strictEqual(result.divergences.length, 1);
  assert.strictEqual(result.divergences[0].field, "bankImportRows");
  assert.strictEqual(result.divergences[0].delta, 2);
  console.log("  out of sync on row count drift (compare raw): OK");
  console.log(
    "  note: getBankReconcileStatus auto-aligns when only row count drifted and balance still matches (split/reclassify)"
  );
}

function testOutOfSyncOnBalanceDrift() {
  const result = compareBankReconcileStatus({
    anchor: {
      balance: 16241.55,
      asOf: "2026-07-08",
      bankImportRows: 457,
      verifiedAt: "2026-07-10T12:00:00.000Z",
      source: "full_refresh",
      label: null,
    },
    liveBalanceAtAnchor: { balance: 16113.55, asOf: "2026-07-08" },
    liveBankImportRows: 457,
    liveLedger: { balance: 16113.55, asOf: "2026-07-08" },
  });
  assert.strictEqual(result.status, "out_of_sync");
  assert.strictEqual(result.divergences[0].field, "balanceAtAnchor");
  console.log("  out of sync on balance drift: OK");
}

function testNotSetWithoutAnchor() {
  const result = compareBankReconcileStatus({
    anchor: null,
    liveBalanceAtAnchor: null,
    liveBankImportRows: 100,
    liveLedger: { balance: 5000, asOf: "2026-06-01" },
  });
  assert.strictEqual(result.status, "not_set");
  assert.strictEqual(result.divergences.length, 0);
  console.log("  not set without anchor: OK");
}

function testBalanceTolerance() {
  const result = compareBankReconcileStatus({
    anchor: {
      balance: 100,
      asOf: "2026-01-01",
      bankImportRows: 10,
      verifiedAt: "2026-01-02T00:00:00.000Z",
      source: "append",
      label: null,
    },
    liveBalanceAtAnchor: { balance: 100 + BALANCE_TOLERANCE, asOf: "2026-01-01" },
    liveBankImportRows: 10,
    liveLedger: { balance: 100 + BALANCE_TOLERANCE, asOf: "2026-01-01" },
  });
  assert.strictEqual(result.status, "reconciled");
  console.log(`  balance tolerance (${BALANCE_TOLERANCE}): OK`);
}

function main() {
  console.log("test-bank-reconcile-status.js");
  testReconciledWhenAnchorMatchesLive();
  testOutOfSyncOnRowCountDrift();
  testOutOfSyncOnBalanceDrift();
  testNotSetWithoutAnchor();
  testBalanceTolerance();
  console.log("All bank reconcile status tests passed.");
}

main();
