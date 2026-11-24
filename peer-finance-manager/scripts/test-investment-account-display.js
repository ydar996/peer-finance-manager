#!/usr/bin/env node
/**
 * Cooperative Investments detail: the Account column must show a real
 * account (curated investment account or the ledger bank account),
 * never a copy of the narration. Auto-created narration accounts from
 * bank imports are pruned; curated accounts are kept.
 * Run: node peer-finance-manager/scripts/test-investment-account-display.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-inv-acct-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const { ensureBankAccountSchema } = require("../lib/bank-account-service");
const {
  ensureInvestmentAccountSchema,
  listInvestmentAccounts,
} = require("../lib/investment-account-service");
const { getBookDetail } = require("../lib/cooperative-books");

const ORG = "investment-display-test-coop";

openOrgDatabase(ORG);
runWithOrg(ORG, () => {
  const db = getDb();
  ensureBankAccountSchema(db);
  ensureInvestmentAccountSchema(db);

  const primaryId = db
    .prepare(
      `INSERT INTO bank_accounts (account_label, institution_name, currency, is_primary)
       VALUES ('Providus Operations', 'Providus Bank', 'NGN', 1)`
    )
    .run().lastInsertRowid;
  const fdId = db
    .prepare(
      `INSERT INTO bank_accounts (account_label, institution_name, currency, is_primary)
       VALUES ('Providus Fixed Deposit', 'Providus Bank', 'NGN', 0)`
    )
    .run().lastInsertRowid;

  const insertTx = db.prepare(
    `INSERT INTO transactions (member_id, type, amount, transaction_date, description, source, bank_account_id)
     VALUES (NULL, 'investment', ?, ?, ?, 'bank_import', ?)`
  );
  insertTx.run(-2500000, "2026-02-02", "ADD A TIME DEPOSIT BY PRODUCT FROM HEAD OFFICE BRANCH", fdId);
  insertTx.run(2500000, "2026-03-13", "ADD A TIME DEPOSIT BY PRODUCT FROM CENTER BRANCH", fdId);
  insertTx.run(5000, "2026-05-23", "SIAML/STERLING INVESTMENT REFUND", primaryId);
  insertTx.run(19726.17, "2026-07-14", "STERLING BANK INVESTMENT RETURNS", null);

  // Simulate the old behavior: auto-created accounts named after narrations.
  const junkName = "ADD A TIME DEPOSIT BY PRODUCT FROM HEAD OFFICE BRANCH";
  const junkId = db
    .prepare(`INSERT INTO investment_accounts (name) VALUES (?)`)
    .run(junkName).lastInsertRowid;
  db.prepare(
    `UPDATE transactions SET investment_account_id = ?
     WHERE TRIM(COALESCE(description,'')) = ?`
  ).run(junkId, junkName);

  // A curated account with institution details must survive pruning.
  const curatedId = db
    .prepare(
      `INSERT INTO investment_accounts (name, institution_name) VALUES ('Stanbic SIMM', 'Stanbic IBTC')`
    )
    .run().lastInsertRowid;
  db.prepare(
    `UPDATE transactions SET investment_account_id = ?
     WHERE description = 'STERLING BANK INVESTMENT RETURNS'`
  ).run(curatedId);

  const detail = getBookDetail("investments");
  const rows = detail.rows;
  assert.strictEqual(rows.length, 4);

  // Junk narration account pruned: imported rows show their bank account.
  const placement = rows.find((r) => r.description.includes("HEAD OFFICE"));
  assert.strictEqual(placement.account, "Providus Fixed Deposit");
  const refund = rows.find((r) => r.description.includes("SIAML"));
  assert.strictEqual(refund.account, "Providus Operations");
  console.log("  imported rows show their bank account label: OK");

  // Curated assignment wins over the bank-account fallback.
  const curated = rows.find((r) => r.description.includes("INVESTMENT RETURNS"));
  assert.strictEqual(curated.account, "Stanbic SIMM");
  console.log("  curated investment account takes precedence: OK");

  // No row shows the narration as its account.
  assert.ok(rows.every((r) => r.account !== r.description));
  console.log("  no row duplicates narration into the Account column: OK");

  // The junk account is gone from the accounts panel; curated remains.
  const accounts = listInvestmentAccounts();
  assert.ok(!accounts.some((a) => a.name === junkName));
  assert.ok(accounts.some((a) => a.name === "Stanbic SIMM"));
  // And imports did not spawn new per-narration accounts.
  assert.strictEqual(accounts.length, 1);
  console.log("  narration-spawned accounts pruned; sync ignores bank imports: OK");

  // Card total is net placements minus returns, not absolute turnover.
  const { getCooperativeBooks } = require("../lib/cooperative-books");
  let books = getCooperativeBooks();
  // Rows so far: -2.5M +2.5M +5,000 +19,726.17 -> net +24,726.17 -> clamped to 0.
  assert.strictEqual(books.investments, 0);
  console.log("  card clamps net-negative flows to zero: OK");

  insertTx.run(-10000000, "2026-08-28", "OUTWARD TRANSFER TO FSDH CAPITAL", null);
  books = getCooperativeBooks();
  // -10M placement less +24,726.17 returns.
  assert.ok(Math.abs(books.investments - 9975273.83) < 0.01);
  console.log("  card nets placements against returns: OK");

  // Manual placement/return pairs keep flow semantics; legacy positive
  // markers keep absolute value.
  const { recordInvestment } = require("../lib/investment-account-service");
  recordInvestment({
    accountId: accounts[0].id,
    direction: "placement",
    amount: 6530000,
    transactionDate: "2026-05-19",
  });
  recordInvestment({
    accountId: accounts[0].id,
    direction: "return",
    amount: 530000,
    transactionDate: "2026-05-20",
  });
  db.prepare(
    `INSERT INTO transactions (member_id, type, amount, transaction_date, description, source)
     VALUES (NULL, 'investment', 50000, '2026-01-01', 'Caribe Restaurant', 'spreadsheet')`
  ).run();
  books = getCooperativeBooks();
  const expected = 9975273.83 + (6530000 - 530000) + 50000;
  assert.ok(Math.abs(books.investments - expected) < 0.01);
  console.log("  manual flows and legacy markers combine correctly: OK");
});

setTimeout(() => {
  closeDb();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_) {}
  console.log("All investment account display tests passed.");
}, 200);
