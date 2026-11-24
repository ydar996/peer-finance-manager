#!/usr/bin/env node
/**
 * Other Cooperative Income + workbook split corrections:
 *  - other_income imports as a non-member income type and lands in income
 *    totals, the bank ledger projection, and the other-income detail view.
 *  - membership_fee reclassify/split legs expand to the deposit+fee pair so
 *    member balances net to zero while dues income is recorded.
 *  - Fee legs survive an adjustment rebuild (member-books contra rows must
 *    ride the rebuild stream).
 * Run: node peer-finance-manager/scripts/test-other-income-splits.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-other-income-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const { ensureBankAccountSchema } = require("../lib/bank-account-service");
const { importBankLedgerFromTransactions } = require("../lib/import-bank-ledger");
const {
  saveReclassifyAdjustment,
  saveSplitAdjustment,
} = require("../lib/ledger-adjustment-service");
const { getCooperativeBooks, getBookDetail } = require("../lib/cooperative-books");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const { getLedgerEndingBalance } = require("../lib/cooperative-bank-ledger-csv");

const ORG = "other-income-test-coop";

openOrgDatabase(ORG);
runWithOrg(ORG, () => {
  const db = getDb();
  ensureBankAccountSchema(db);
  db.prepare(
    `INSERT INTO bank_accounts (account_label, institution_name, currency, is_primary)
     VALUES ('Providus Operations', 'Providus Bank', 'NGN', 1)`
  ).run();
  for (const name of [
    "Balikis Bakare",
    "Jeffrey Oluwafemi",
    "Diran Oni",
    "Adebowale Eyinade",
  ]) {
    db.prepare(`INSERT INTO members (name) VALUES (?)`).run(name);
  }
  const memberId = (name) =>
    db.prepare(`SELECT id FROM members WHERE name = ?`).get(name).id;

  // Import the rows the way the original (uncorrected) CSV typed them.
  const bankTxs = [
    {
      date: "2026-02-12",
      amount: 151320,
      description: "TRANSFER BETWEEN CUSTOMERS 919854/vmB9NaGSSldq7Hmc",
      ledgerType: "deposit",
      member: "Balikis Bakare",
      source: "bank_import",
    },
    {
      date: "2026-04-05",
      amount: 75009.72,
      description: "INWARD TRANSFER(H) /100038260406005256186376591054",
      ledgerType: "deposit",
      member: "Jeffrey Oluwafemi",
      source: "bank_import",
    },
    {
      date: "2026-05-23",
      amount: 5000,
      description: "INWARD TRANSFER (N) 1269995 FROM STANBIC/ SIAML-RETAIL",
      ledgerType: "deposit",
      member: "Diran Oni",
      source: "bank_import",
    },
    {
      date: "2026-07-14",
      amount: 19726.17,
      description: "INWARD TRANSFER (N) 276213 FROM STERLING/ CAPITAL & INVESTMENT",
      ledgerType: "investment",
      member: null,
      source: "bank_import",
    },
    {
      date: "2026-07-14",
      amount: 19726.49,
      description: "INWARD TRANSFER (N) 275382 FROM STERLING/ DDIT COOPERATIVE",
      ledgerType: "investment",
      member: null,
      source: "bank_import",
    },
    {
      date: "2026-10-02",
      amount: 37500,
      description: "ACCOUNT TRANSFERS EYINADE Annual due_Oct - Dec 26",
      ledgerType: "deposit",
      member: "Adebowale Eyinade",
      source: "bank_import",
    },
  ];
  importBankLedgerFromTransactions({ bankTxs, sourceLabel: "seed" });

  // Pre-adjustment sanity: contributions are inflated by the mistyped rows.
  assert.strictEqual(
    Math.round(getMemberDepositAccountBalance(memberId("Balikis Bakare")) * 100) / 100,
    151320
  );

  // Workbook 09A splits.
  saveSplitAdjustment({
    transactionDate: "2026-02-12",
    amount: 151320,
    description: "TRANSFER BETWEEN CUSTOMERS 919854/vmB9NaGSSldq7Hmc",
    lines: [
      { ledgerType: "membership_fee", memberName: "Balikis Bakare", amount: 150000, descriptionNote: "Entrance Fee" },
      { ledgerType: "other_income", amount: 1320, descriptionNote: "payment surplus" },
    ],
  });
  saveSplitAdjustment({
    transactionDate: "2026-04-05",
    amount: 75009.72,
    description: "INWARD TRANSFER(H) /100038260406005256186376591054",
    lines: [
      { ledgerType: "membership_fee", memberName: "Jeffrey Oluwafemi", amount: 75000, descriptionNote: "Annual Dues" },
      { ledgerType: "other_income", amount: 9.72, descriptionNote: "payment surplus" },
    ],
  });

  // Reclassifies per the workbook journal.
  saveReclassifyAdjustment({
    transactionDate: "2026-05-23",
    amount: 5000,
    description: "INWARD TRANSFER (N) 1269995 FROM STANBIC/ SIAML-RETAIL",
    ledgerType: "share_capital",
    memberName: "Diran Oni",
  });
  saveReclassifyAdjustment({
    transactionDate: "2026-10-02",
    amount: 37500,
    description: "ACCOUNT TRANSFERS EYINADE Annual due_Oct - Dec 26",
    ledgerType: "membership_fee",
    memberName: "Adebowale Eyinade",
  });
  saveReclassifyAdjustment({
    transactionDate: "2026-07-14",
    amount: 19726.17,
    description: "INWARD TRANSFER (N) 276213 FROM STERLING/ CAPITAL & INVESTMENT",
    ledgerType: "other_income",
  });
  saveReclassifyAdjustment({
    transactionDate: "2026-07-14",
    amount: 19726.49,
    description: "INWARD TRANSFER (N) 275382 FROM STERLING/ DDIT COOPERATIVE",
    ledgerType: "other_income",
  });

  // Member books: every member nets to zero for these receipts.
  for (const name of ["Balikis Bakare", "Jeffrey Oluwafemi", "Adebowale Eyinade"]) {
    const bal = getMemberDepositAccountBalance(memberId(name));
    assert.ok(Math.abs(bal) < 0.005, `${name} deposit balance should be 0, got ${bal}`);
  }

  const books = getCooperativeBooks();
  const round2 = (n) => Math.round(n * 100) / 100;

  // Other Cooperative Income = 1320 + 9.72 + 19726.17 + 19726.49 (workbook GL 4200).
  assert.strictEqual(round2(books.otherIncome), 40782.38, "otherIncome total");

  // Registration income = 150000 + 75000 + 37500 entrance/dues fee legs.
  assert.strictEqual(round2(books.registrationIncome), 262500, "registrationIncome");

  // Oni SIAML refund booked to his share capital.
  const oniSc = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS t FROM transactions
       WHERE member_id = ? AND type = 'share_capital'`
    )
    .get(memberId("Diran Oni")).t;
  assert.strictEqual(round2(oniSc), 5000, "Oni share capital");

  // Investments no longer count the two Sterling credits.
  const inv = db
    .prepare(`SELECT COALESCE(SUM(ABS(amount)),0) AS t FROM transactions WHERE type='investment'`)
    .get().t;
  assert.strictEqual(round2(inv), 0, "investment rows reclassified away");

  // Bank ledger projection still sums the full statement receipts.
  const ledger = getLedgerEndingBalance();
  const expectedLedger = 150000 + 1320 + 75000 + 9.72 + 5000 + 37500 + 19726.17 + 19726.49;
  assert.strictEqual(
    round2(ledger.balance),
    round2(expectedLedger),
    `ledger balance ${ledger.balance} != ${expectedLedger}`
  );

  // Income detail rows + the new other-income drill-down.
  const totalIncome = getBookDetail("total-income");
  const otherRow = totalIncome.rows.find((r) => r.source === "Other Cooperative Income");
  assert.ok(otherRow, "total-income lists Other Cooperative Income");
  assert.strictEqual(round2(otherRow.amount), 40782.38);
  assert.strictEqual(otherRow.detailSlug, "other-income");

  const detail = getBookDetail("other-income");
  assert.strictEqual(round2(detail.summary), 40782.38);
  assert.strictEqual(detail.rows.length, 4);
  assert.ok(
    detail.rows.every((r) => r.member === "Non-Member"),
    "other income rows are non-member"
  );

  const netIncome = getBookDetail("net-income");
  assert.ok(
    netIncome.rows.some((r) => r.line === "Other Cooperative Income"),
    "net-income lists Other Cooperative Income"
  );

  console.log("ALL TESTS PASSED");
});

closeDb();
