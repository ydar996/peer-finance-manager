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
const { listInbox, listMailbox } = require("../lib/messaging-service");
const { listEmailDeliveriesForBatch, listEmailSendBatches } = require("../lib/email-audit-service");

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
      { memberId: adaId, type: "share_capital", amount: 500, date: "2026-10-08", transactionId: 5 },
    ]);
    // Grouping is by member + type: Ben's deposit and repayment stay separate.
    const adaDeposit = grouped.get(`${adaId}:deposit`);
    const adaShare = grouped.get(`${adaId}:share_capital`);
    const benRepay = grouped.get(`${benId}:loan_repayment`);
    const benDeposit = grouped.get(`${benId}:deposit`);
    assert.equal(adaDeposit.items.length, 2);
    assert.equal(adaShare.items.length, 1);
    assert.equal(benRepay.items.length, 1);
    assert.equal(benDeposit.items.length, 1);
    assert.equal([...grouped.values()].some((g) => g.memberId === formerId), false);

    const branding = { name: "Test Cooperative", portalUrl: "https://example.test/member" };
    const one = buildDepositAlertEmail({
      memberName: "Ada Okeke",
      deposits: [{ date: "2026-10-07", amount: 100, type: "deposit" }],
      category: "deposit",
      branding,
    });
    assert.match(one.subject, /Deposit Received/);
    assert.match(one.text, /Member Deposit of/);
    assert.match(one.text, /on /);

    const repayment = buildDepositAlertEmail({
      memberName: "Ben Okeke",
      deposits: [{ date: "2026-10-07", amount: 200, type: "loan_repayment" }],
      category: "loan_repayment",
      branding,
    });
    assert.match(repayment.subject, /Loan Repayment Received/);
    assert.match(repayment.text, /Loan Repayment of/);
    assert.match(repayment.text, /applied to your loan account/);

    const share = buildDepositAlertEmail({
      memberName: "Ada Okeke",
      deposits: [{ date: "2026-10-08", amount: 500, type: "share_capital" }],
      category: "share_capital",
      branding,
    });
    assert.match(share.subject, /Share Capital Received/);
    assert.match(share.text, /Share Capital/);
    assert.match(share.text, /credited to your Share Capital account/);

    const many = buildDepositAlertEmail({
      memberName: "Ada Okeke",
      deposits: [
        { date: "2026-10-06", amount: 100, type: "deposit" },
        { date: "2026-10-07", amount: 50, type: "deposit" },
      ],
      category: "deposit",
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
      `INSERT INTO deposit_credit_alert_log (transaction_id, member_id, status)
       VALUES (?, ?, 'sent')
       ON CONFLICT(transaction_id) DO UPDATE SET status = 'sent'`
    ).run(txId, adaId);
    const again = await notifyLatestImportedDeposits({ maxAgeHours: 72 });
    assert.equal(again.alreadySent, true);

    const admin = db
      .prepare(
        `INSERT INTO users (email, username, password_hash, role, display_name, active)
         VALUES ('admin@example.com', 'admin', 'x', 'admin', 'Test Admin', 1)`
      )
      .run();
    const adaLogin = db
      .prepare(
        `INSERT INTO users (email, username, password_hash, role, member_id, display_name, active)
         VALUES (?, ?, 'x', 'member', ?, ?, 1)`
      )
      .run("ada@example.com", "ada", adaId, "Ada Okeke");
    const portalNotify = await notifyImportedMemberDeposits([
      { memberId: adaId, type: "deposit", amount: 120, date: "2026-10-08", transactionId: 21 },
    ]);
    assert.equal(portalNotify.depositCount, 1);
    const adaInbox = listInbox({
      id: Number(adaLogin.lastInsertRowid),
      role: "member",
      memberId: adaId,
    });
    assert.ok(
      adaInbox.some((thread) => /Deposit Received/i.test(thread.subject)),
      "Member portal inbox shows the deposit acknowledgement"
    );
    const adminSent = listMailbox(
      { id: Number(admin.lastInsertRowid), role: "admin" },
      "sent"
    );
    assert.ok(
      adminSent.some((thread) => /Deposit Received/i.test(thread.subject)),
      "Admin Sent shows the same deposit acknowledgement"
    );
    const batches = listEmailSendBatches(10);
    const latestBatch = batches.find((batch) => batch.triggerType === "deposit_credit_alert");
    assert.ok(latestBatch, "Email Notices logs the deposit acknowledgement");
    const copies = listEmailDeliveriesForBatch(latestBatch.id);
    assert.ok(
      copies.some((row) => /Member Deposit/i.test(row.bodyText || "")),
      "Email Notices stores the exact message copy"
    );

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
