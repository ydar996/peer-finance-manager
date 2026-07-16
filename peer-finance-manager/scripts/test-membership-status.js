#!/usr/bin/env node
/**
 * Membership status types: directory filter, email exclusion, portal login flag.
 * Run: npm run test:membership-status
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-membership-status-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const {
  ACCOUNT_STATUS,
  setMemberAccountStatus,
  saveMembershipStatusDocument,
  resolveMembershipStatusDocumentFile,
  isActiveDirectoryStatus,
  isEmailEligibleStatus,
  formatAccountStatusLabel,
} = require("../lib/membership-status-service");
const { listMembersWithProfiles } = require("../lib/member-profile-service");
const { listMemberNotificationRecipients } = require("../lib/report-notification-service");
const { createMember } = require("../lib/member-service");
const { getMemberProfile } = require("../lib/member-profile-service");

const ORG = "status-test-coop";

function setup() {
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
}

function testLabelsAndEligibility() {
  assert.strictEqual(formatAccountStatusLabel("resigned"), "Resigned");
  assert.strictEqual(formatAccountStatusLabel("deceased"), "Deceased");
  assert.strictEqual(isActiveDirectoryStatus("active"), true);
  assert.strictEqual(isActiveDirectoryStatus("resigned"), false);
  assert.strictEqual(isEmailEligibleStatus("expelled"), false);
  assert.strictEqual(isEmailEligibleStatus("active"), true);
  console.log("  labels/eligibility: OK");
}

function testDirectoryAndEmail() {
  runWithOrg(ORG, () => {
    setup();
    const active = createMember({
      firstName: "Active",
      lastName: "Member",
      email: "active@example.com",
      recordMembershipFee: false,
    });
    const leaving = createMember({
      firstName: "Sonia",
      lastName: "Udom",
      email: "sonia@example.com",
      recordMembershipFee: false,
    });

    const db = getDb();
    db.prepare(
      `INSERT INTO users (email, username, password_hash, role, member_id, display_name, active)
       VALUES (?, ?, 'x', 'member', ?, ?, 1)`
    ).run("sonia@example.com", "sonia", leaving.memberId, "Sonia Udom");

    let listed = listMembersWithProfiles();
    assert.ok(listed.some((m) => m.id === leaving.memberId));
    assert.ok(listed.some((m) => m.id === active.memberId));

    let recipients = listMemberNotificationRecipients();
    assert.ok(recipients.some((r) => r.memberId === leaving.memberId));

    const result = setMemberAccountStatus(leaving.memberId, {
      status: ACCOUNT_STATUS.RESIGNED,
      effectiveDate: "2026-07-15",
      note: "Written resignation to Secretary",
    });
    assert.strictEqual(result.status, "resigned");
    assert.strictEqual(result.directoryListed, false);
    assert.strictEqual(result.emailEligible, false);

    listed = listMembersWithProfiles();
    assert.ok(!listed.some((m) => m.id === leaving.memberId));
    assert.ok(listed.some((m) => m.id === active.memberId));

    const withFormer = listMembersWithProfiles({ includeFormer: true });
    const formerRow = withFormer.find((m) => m.id === leaving.memberId);
    assert.ok(formerRow);
    assert.strictEqual(formerRow.is_former_member, true);
    assert.strictEqual(formerRow.account_status_label, "Resigned");

    recipients = listMemberNotificationRecipients();
    assert.ok(!recipients.some((r) => r.memberId === leaving.memberId));
    assert.ok(recipients.some((r) => r.memberId === active.memberId));

    const user = db
      .prepare(`SELECT active FROM users WHERE member_id = ?`)
      .get(leaving.memberId);
    assert.strictEqual(user.active, 0);

    setMemberAccountStatus(leaving.memberId, { status: ACCOUNT_STATUS.ACTIVE });
    listed = listMembersWithProfiles();
    assert.ok(listed.some((m) => m.id === leaving.memberId));
    const restored = db
      .prepare(`SELECT active FROM users WHERE member_id = ?`)
      .get(leaving.memberId);
    assert.strictEqual(restored.active, 1);

    const tmpPdf = path.join(tmpRoot, "resignation.pdf");
    fs.writeFileSync(tmpPdf, "%PDF-1.4 resignation test");
    const doc = saveMembershipStatusDocument(leaving.memberId, {
      path: tmpPdf,
      mimetype: "application/pdf",
      originalname: "sonia-resignation.pdf",
    });
    assert.ok(doc.documentPath);
    assert.strictEqual(doc.documentName, "sonia-resignation.pdf");
    const stored = resolveMembershipStatusDocumentFile(leaving.memberId);
    assert.ok(stored && fs.existsSync(stored));
    const profile = getMemberProfile(leaving.memberId);
    assert.strictEqual(profile.membership_status_document_name, "sonia-resignation.pdf");

    setMemberAccountStatus(leaving.memberId, { status: ACCOUNT_STATUS.RESIGNED });
    const { assertActiveDirectoryMember } = require("../lib/membership-status-service");
    assert.throws(
      () => assertActiveDirectoryMember(leaving.memberId, { action: "Distributions" }),
      /only available to active members/i
    );
    const { recordMemberDepositEntry } = require("../lib/manual-entry-service");
    assert.throws(
      () =>
        recordMemberDepositEntry({
          memberId: leaving.memberId,
          type: "deposit",
          amount: 10,
          transactionDate: "2026-07-16",
        }),
      /only available to active members/i
    );
    // Withdrawals remain allowed for settlement.
    recordMemberDepositEntry({
      memberId: leaving.memberId,
      type: "withdrawal",
      amount: 1,
      transactionDate: "2026-07-16",
    });

    closeDb();
    console.log("  directory/email/portal/document/benefits: OK");
  });
}

function main() {
  console.log("test-membership-status");
  testLabelsAndEligibility();
  testDirectoryAndEmail();
  console.log("All membership status tests passed.");
}

main();
