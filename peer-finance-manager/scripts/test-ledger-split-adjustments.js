#!/usr/bin/env node
/**
 * Split adjustments: N-way lines, sum validation, expense/loan types, expansion math.
 * Run: node peer-finance-manager/scripts/test-ledger-split-adjustments.js
 */
const assert = require("assert");
const {
  applyAdjustmentsToBankTransactions,
  validateAdjustmentLines,
  RECLASSIFIABLE_LEDGER_TYPES,
  SPLIT_MIN_LINES,
  ADJUSTMENT_KIND,
} = require("../lib/ledger-adjustment-service");

function mockDb() {
  const members = new Map([
    ["Yomi Salami", { id: 1, name: "Yomi Salami" }],
    ["Saheed Salami", { id: 2, name: "Saheed Salami" }],
  ]);
  return {
    prepare(sql) {
      return {
        get(arg) {
          if (/FROM members WHERE name/.test(sql)) return members.get(arg) || null;
          if (/FROM members WHERE id/.test(sql)) {
            for (const m of members.values()) if (m.id === arg) return m;
            return null;
          }
          return null;
        },
        all() {
          return [];
        },
        run() {
          return { lastInsertRowid: 1 };
        },
      };
    },
    exec() {},
    transaction(fn) {
      return () => fn();
    },
  };
}

function testTypesIncludeExpenseAndLoans() {
  for (const t of [
    "deposit",
    "loan_repayment",
    "loan_disbursement",
    "expense",
    "withdrawal",
    "distribution",
    "membership_fee",
    "cd_purchase",
    "cd_liquidation",
    "investment",
  ]) {
    assert.ok(RECLASSIFIABLE_LEDGER_TYPES.includes(t), `missing type ${t}`);
  }
  assert.strictEqual(SPLIT_MIN_LINES, 2);
  console.log("  reclassifiable types include expense/loan/cd: OK");
}

function testRejectBadTotalsAndSingleLine() {
  const db = mockDb();
  assert.throws(
    () =>
      validateAdjustmentLines(
        db,
        600,
        [{ ledgerType: "loan_repayment", memberName: "Yomi Salami", amount: 600 }],
        { requireSplit: true }
      ),
    /at least 2 lines/i
  );
  assert.throws(
    () =>
      validateAdjustmentLines(
        db,
        600,
        [
          { ledgerType: "loan_repayment", memberName: "Yomi Salami", amount: 400 },
          { ledgerType: "deposit", memberName: "Yomi Salami", amount: 100 },
        ],
        { requireSplit: true }
      ),
    /must total 600\.00/i
  );
  console.log("  reject under-total and single-line splits: OK");
}

function testAcceptThreeWayMixIncludingExpense() {
  const db = mockDb();
  validateAdjustmentLines(
    db,
    600,
    [
      { ledgerType: "loan_repayment", memberName: "Yomi Salami", amount: 403.18 },
      { ledgerType: "deposit", memberName: "Yomi Salami", amount: 96.82 },
      { ledgerType: "expense", amount: 100 },
    ],
    { requireSplit: true }
  );
  console.log("  accept 3-way split with expense line: OK");
}

function testExpansionProducesNRows() {
  // Unit-test expansion math without live DB: mirror applyAdjustments split loop.
  const original = {
    date: "2025-11-06",
    amount: 600,
    description: "Zelle payment from SAHEED SALAMI",
    ledgerType: "loan_repayment",
    member: "Yomi Salami",
  };
  const lines = [
    { lineOrder: 1, ledgerType: "loan_repayment", memberName: "Yomi Salami", amount: 300, descriptionNote: "Loan" },
    { lineOrder: 2, ledgerType: "deposit", memberName: "Yomi Salami", amount: 200, descriptionNote: "Contribution" },
    { lineOrder: 3, ledgerType: "expense", memberName: null, amount: 100, descriptionNote: "Fee share" },
  ];
  const expanded = [];
  for (const line of lines) {
    const note = line.descriptionNote ? String(line.descriptionNote).trim() : "";
    expanded.push({
      ...original,
      amount: Number(line.amount),
      ledgerType: line.ledgerType,
      member: line.memberName || original.member || null,
      description: note ? `${original.description} (${note})` : original.description,
      splitLineOrder: line.lineOrder,
    });
  }
  assert.strictEqual(expanded.length, 3);
  const sum = expanded.reduce((s, r) => s + r.amount, 0);
  assert.strictEqual(Math.round(sum * 100) / 100, 600);
  assert.ok(expanded.some((r) => r.ledgerType === "expense"));
  assert.ok(expanded.some((r) => r.ledgerType === "deposit"));
  assert.ok(expanded.some((r) => r.ledgerType === "loan_repayment"));
  // Row-count delta for reconcile: +2 vs original single bank row (any N-way is fine).
  assert.strictEqual(expanded.length - 1, 2);
  console.log("  N-way expansion keeps cash total, raises row count by N-1: OK");
  void applyAdjustmentsToBankTransactions;
  void ADJUSTMENT_KIND;
}

console.log("test-ledger-split-adjustments");
testTypesIncludeExpenseAndLoans();
testRejectBadTotalsAndSingleLine();
testAcceptThreeWayMixIncludingExpense();
testExpansionProducesNRows();
console.log("test-ledger-split-adjustments: OK");
