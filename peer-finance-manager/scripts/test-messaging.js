#!/usr/bin/env node
/**
 * Cooperative inbox messaging (all tenants).
 * Run: npm run test:messaging
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-messaging-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const { createMember } = require("../lib/member-service");
const {
  createAdminThread,
  createMemberThread,
  createSystemAdminNotice,
  listInbox,
  getUnreadSummary,
  getThreadDetail,
  replyToThread,
  listRecipientOptions,
} = require("../lib/messaging-service");
const { renderMarkdownToSafeHtml } = require("../lib/markdown-lite");
const { sanitizeRichHtml } = require("../lib/html-sanitize-lite");

const ORG = "messaging-test-coop";

function setupUsers() {
  openOrgDatabase(ORG);
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      username TEXT,
      password_hash TEXT,
      role TEXT,
      member_id INTEGER,
      display_name TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0
    );
  `);

  const admin = db
    .prepare(
      `INSERT INTO users (email, username, password_hash, role, display_name, active)
       VALUES ('admin@example.com', 'admin', 'x', 'admin', 'Test Admin', 1)`
    )
    .run();

  const m1 = createMember({
    firstName: "Ada",
    lastName: "Member",
    email: "ada@example.com",
    recordMembershipFee: false,
  });
  const m2 = createMember({
    firstName: "Ben",
    lastName: "Member",
    email: "ben@example.com",
    recordMembershipFee: false,
  });

  const u1 = db
    .prepare(
      `INSERT INTO users (email, username, password_hash, role, member_id, display_name, active)
       VALUES (?, ?, 'x', 'member', ?, ?, 1)`
    )
    .run("ada@example.com", "ada", m1.memberId, "Ada Member");
  const u2 = db
    .prepare(
      `INSERT INTO users (email, username, password_hash, role, member_id, display_name, active)
       VALUES (?, ?, 'x', 'member', ?, ?, 1)`
    )
    .run("ben@example.com", "ben", m2.memberId, "Ben Member");

  return {
    adminUser: { id: admin.lastInsertRowid, role: "admin", displayName: "Test Admin" },
    ada: {
      memberId: m1.memberId,
      user: {
        id: u1.lastInsertRowid,
        role: "member",
        memberId: m1.memberId,
        displayName: "Ada Member",
      },
    },
    ben: {
      memberId: m2.memberId,
      user: {
        id: u2.lastInsertRowid,
        role: "member",
        memberId: m2.memberId,
        displayName: "Ben Member",
      },
    },
  };
}

function run() {
  runWithOrg(ORG, () => {
    const ctx = setupUsers();
    const recipients = listRecipientOptions();
    assert.strictEqual(recipients.members.length, 2);

    const mdHtml = renderMarkdownToSafeHtml("# Minutes\n\n**Action:** Review budget.");
    assert.ok(mdHtml.includes("<h1>"));
    assert.ok(mdHtml.includes("<strong>Action:</strong>"));
    assert.ok(!mdHtml.includes("<script"));

    const wordish = sanitizeRichHtml(
      `<!--StartFragment--><p class="MsoNormal"><b>Budget</b> review</p><script>alert(1)</script><ul><li>Item</li></ul><!--EndFragment-->`
    );
    assert.ok(wordish.includes("<b>Budget</b>") || wordish.includes("<strong>"));
    assert.ok(wordish.includes("<ul>"));
    assert.ok(!wordish.includes("<script"));

    const broadcast = createAdminThread(ctx.adminUser, {
      subject: "Meeting Minutes",
      body: "<h2>Meeting Minutes</h2><p><b>Budget</b> review</p><ul><li>Call to order</li></ul>",
      bodyFormat: "html",
      audience: "all",
    });
    assert.ok(broadcast.id);
    assert.strictEqual(broadcast.messages.length, 1);
    assert.strictEqual(broadcast.messages[0].bodyFormat, "html");
    assert.ok(broadcast.messages[0].bodyHtml.includes("<h2>"));
    assert.ok(broadcast.messages[0].bodyHtml.includes("<ul>"));

    // HTML body mislabeled as markdown (production default) must still render.
    const { formatMessageBody } = require("../lib/messaging-service");
    const recovered = formatMessageBody(
      "<p><b>MEETING MINUTES</b></p><p>Date: July 16, 2026</p>",
      "markdown"
    );
    assert.strictEqual(recovered.bodyFormat, "html");
    assert.ok(recovered.bodyHtml.includes("<b>MEETING MINUTES</b>") || recovered.bodyHtml.includes("<strong>"));
    assert.ok(!recovered.bodyHtml.includes("&lt;p&gt;"));

    let adaUnread = getUnreadSummary(ctx.ada.user);
    assert.ok(adaUnread.hasUnread);
    assert.strictEqual(adaUnread.unreadThreads, 1);

    const adaInbox = listInbox(ctx.ada.user);
    assert.strictEqual(adaInbox.length, 1);
    assert.strictEqual(adaInbox[0].subject, "Meeting Minutes");

    const adaThread = getThreadDetail(ctx.ada.user, broadcast.id);
    assert.strictEqual(adaThread.messages.length, 1);
    adaUnread = getUnreadSummary(ctx.ada.user);
    assert.strictEqual(adaUnread.unreadMessages, 0);

    const targeted = createAdminThread(ctx.adminUser, {
      subject: "Action Item",
      body: "Please complete the bylaws draft before next meeting.",
      audience: "selected",
      memberIds: [ctx.ada.memberId],
    });
    assert.ok(listInbox(ctx.ada.user).some((t) => t.id === targeted.id));
    assert.ok(!listInbox(ctx.ben.user).some((t) => t.id === targeted.id));

    const fromMember = createMemberThread(ctx.ben.user, {
      subject: "Question",
      body: "Can I get a statement copy?",
    });
    const adminInbox = listInbox(ctx.adminUser);
    assert.ok(adminInbox.some((t) => t.id === fromMember.id && t.hasUnread));

    const notice = createSystemAdminNotice({
      subject: "New Membership Application #99: Test Applicant",
      body: "<p><strong>A prospective member applied for membership.</strong></p>",
      sourceKey: "membership-application:99",
      emailAdmins: false,
    });
    assert.ok(notice?.created);
    const adminUnread = getUnreadSummary(ctx.adminUser);
    assert.ok(adminUnread.unreadMessages >= 2);
    assert.ok(
      listInbox(ctx.adminUser).some(
        (t) => t.id === notice.id && t.hasUnread && /Membership Application/.test(t.subject)
      )
    );
    const dup = createSystemAdminNotice({
      subject: "New Membership Application #99: Test Applicant",
      body: "<p>Duplicate should not create another thread.</p>",
      sourceKey: "membership-application:99",
      emailAdmins: false,
    });
    assert.strictEqual(dup.created, false);

    const replied = replyToThread(ctx.adminUser, fromMember.id, {
      body: "Yes. Use Download Monthly Statement on My Account.",
    });
    assert.strictEqual(replied.messages.length, 2);

    const benAfter = getThreadDetail(ctx.ben.user, fromMember.id);
    assert.strictEqual(benAfter.messages.length, 2);
    assert.ok(benAfter.messages.some((m) => m.senderRole === "admin"));

    closeDb(ORG);
    console.log("  messaging broadcast/subset/reply: OK");
  });

  console.log("All messaging tests passed.");
}

run();
