#!/usr/bin/env node
/**
 * Deposit credit alerts after Import New Bank Activity.
 * Run: npm run test:deposit-credit-alerts
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-deposit-alerts-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const {
  groupMemberDepositAlerts,
  buildDepositAlertEmail,
  notifyImportedMemberDeposits,
  notifyLatestImportedDeposits,
} = require("../lib/deposit-credit-alert");

const ORG = "deposit-alert-test-coop";

function seedMember(db, { name, email, status = "active" }) {
  const memberId = db.prepare(`INSERT INTO members (name, joined_at) VALUES (?, ?)`).run(
    name,
    "2024-01-01"
  ).lastInsertRowid;
  db.prepare(
    `INSERT INTO member_profiles (member_id, display_name, email, cooperative_account_status)
     VALUES (?, ?, ?, ?)`
  ).run(memberId, name, email, status);
  return Number(memberId);
}

async function run() {
  await runWithOrg(ORG, async () => {
    openOrgDatabase(ORG);
    const db = getDb();

    const adaId = seedMember(db, { name: "Ada Okeke", email: "ada@example.com" });
    const benId = seedMember(db, { name: "Ben Okeke", email: "ben@example.com" });
    const formerId = seedMember(db, {
      name: "Former Member",
      email: "former@example.com",
      status: "resigned",
    });

    const grouped = groupMemberDepositAlerts([
      { memberId: adaId, type: "deposit", amount: 100, date: "2026-10-06", transactionId: 1 },
      { memberId: adaId, type: "deposit", amount: 50, date: "2026-10-07", transactionId: 2 },
      { memberId: benId, type: "loan_repayment", amount: 200, date: "2026-10-07", transactionId: 3 },
      { memberId: benId, type: "deposit", amount: 75, date: "2026-10-07", transactionId: 4 },
    ]);
    assert.equal(grouped.get(adaId).length, 2);
    assert.equal(grouped.get(benId).length, 2);
    assert.equal(grouped.has(formerId), false);

    const branding = { name: "Test Cooperative", portalUrl: "https://example.test/member" };
    const one = buildDepositAlertEmail({
      memberName: "Ada Okeke",
      deposits: [{ date: "2026-10-07", amount: 100, type: "deposit" }],
      branding,
    });
    assert.match(one.subject, /Deposit Received/);
    assert.match(one.text, /Member Deposit of/);
    assert.match(one.text, /on /);

    const repayment = buildDepositAlertEmail({
      memberName: "Ben Okeke",
      deposits: [{ date: "2026-10-07", amount: 200, type: "loan_repayment" }],
      branding,
    });
    assert.match(repayment.subject, /Loan Repayment Received/);
    assert.match(repayment.text, /Loan Repayment of/);

    const mixed = buildDepositAlertEmail({
      memberName: "Ben Okeke",
      deposits: [
        { date: "2026-10-07", amount: 75, type: "deposit" },
        { date: "2026-10-07", amount: 200, type: "loan_repayment" },
      ],
      branding,
    });
    assert.match(mixed.subject, /Deposits\/Loan Repayments Received/);
    assert.match(mixed.text, /Member Deposit/);
    assert.match(mixed.text, /Loan Repayment/);

    const many = buildDepositAlertEmail({
      memberName: "Ada Okeke",
      deposits: [
        { date: "2026-10-06", amount: 100, type: "deposit" },
        { date: "2026-10-07", amount: 50, type: "deposit" },
      ],
      branding,
    });
    assert.match(many.subject, /Deposits Received/);
    assert.match(many.text, /Your Cooperative has recorded the following/);

    const notified = await notifyImportedMemberDeposits([
      { memberId: adaId, type: "deposit", amount: 100, date: "2026-10-07", transactionId: 11 },
      { memberId: formerId, type: "deposit", amount: 40, date: "2026-10-07", transactionId: 12 },
    ]);
    assert.equal(notified.depositCount, 1);
    assert.equal(notified.reason, "not_configured");
    assert.ok(notified.wouldEmail >= 1);

    const importId = db
      .prepare(`INSERT INTO bank_imports (filename, status) VALUES (?, 'applied')`)
      .run("append:stmt-latest.csv").lastInsertRowid;
    const txId = db
      .prepare(
        `INSERT INTO transactions (member_id, type, amount, transaction_date, description, bank_import_id, source)
         VALUES (?, 'deposit', 80, '2026-10-07', 'Member Deposit', ?, 'bank_import')`
      )
      .run(adaId, importId).lastInsertRowid;

    const latest = await notifyLatestImportedDeposits({ maxAgeHours: 72 });
    assert.equal(latest.importId, Number(importId));
    assert.equal(latest.depositCount, 1);
    assert.equal(latest.reason, "not_configured");

    db.prepare(
      `INSERT INTO deposit_credit_alert_log (transaction_id, member_id, status) VALUES (?, ?, 'sent')`
    ).run(txId, adaId);
    const again = await notifyLatestImportedDeposits({ maxAgeHours: 72 });
    assert.equal(again.alreadySent, true);

    console.log("deposit credit alerts tests: ok");
  });
}

run()
  .then(() => {
    closeDb();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    closeDb();
    process.exit(1);
  });
