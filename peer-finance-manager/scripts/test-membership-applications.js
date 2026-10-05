#!/usr/bin/env node
/**
 * Membership applications: accept without deposits, then verify.
 * Run: npm run test:membership-applications
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-membership-apps-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const {
  ensureMembershipApplicationSchema,
  processMembershipFormSubmission,
  approveMembershipApplication,
  verifyMembershipDeposits,
  summarizeMembershipApplications,
  getApplicantPaymentReadiness,
} = require("../lib/flexxforms-membership-service");
const { listActiveDirectoryMembers } = require("../lib/membership-status-service");

const ORG = "membership-apps-test-coop";

function payloadFor(first, last, email) {
  return {
    answers: [
      { fieldIndex: 1, label: "First Name", partKey: "first", value: first },
      { fieldIndex: 1, label: "Last Name", partKey: "last", value: last },
      { fieldIndex: 2, label: "Email", value: email },
    ],
  };
}

function setup() {
  openOrgDatabase(ORG);
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  db.prepare(
    `INSERT INTO users (email, username, password_hash, role, display_name, active)
     VALUES ('admin@example.com', 'admin', 'x', 'admin', 'Test Admin', 1)`
  ).run();
}

async function run() {
  await runWithOrg(ORG, async () => {
    setup();
    const db = getDb();
    const inserted = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status)
         VALUES ('membership', 'sub-1', 'form-1', ?, 'pending')`
      )
      .run(JSON.stringify(payloadFor("Olayemi", "Daramola", "olayemi@example.com")));
    const applicationId = inserted.lastInsertRowid;

    const processed = processMembershipFormSubmission(
      applicationId,
      payloadFor("Olayemi", "Daramola", "olayemi@example.com")
    );
    assert.equal(processed.status, "awaiting_payment");
    assert.ok(processed.memberId);

    const pendingProfile = db
      .prepare(`SELECT cooperative_account_status AS status FROM member_profiles WHERE member_id = ?`)
      .get(processed.memberId);
    assert.equal(pendingProfile.status, "pending_approval");
    assert.equal(
      listActiveDirectoryMembers().some((m) => m.id === processed.memberId),
      false,
      "Saving/creating the profile does not add them to the active member list"
    );

    const before = summarizeMembershipApplications();
    assert.equal(before.pendingCount, 1);

    const accepted = await approveMembershipApplication(applicationId, 1);
    assert.equal(accepted.status, "accepted");
    assert.ok(accepted.login?.username);

    const activeProfile = db
      .prepare(`SELECT cooperative_account_status AS status FROM member_profiles WHERE member_id = ?`)
      .get(processed.memberId);
    assert.equal(activeProfile.status, "active");
    assert.equal(
      listActiveDirectoryMembers().some((m) => m.id === processed.memberId),
      true
    );

    const afterAccept = summarizeMembershipApplications();
    assert.equal(afterAccept.pendingCount, 0, "Accept Member clears the Forms badge");

    const beforeVerify = getApplicantPaymentReadiness(processed.memberId);
    assert.equal(beforeVerify.canApprove, false);

    const verified = await verifyMembershipDeposits(applicationId, { recordPayments: true });
    assert.equal(verified.status, "deposits_verified");
    assert.equal(verified.alreadyVerified, false);

    const afterVerify = getApplicantPaymentReadiness(processed.memberId);
    assert.equal(afterVerify.membershipFeePaid, true);
    assert.equal(afterVerify.initialContributionMet, true);

    const notice = db
      .prepare(`SELECT subject FROM coop_message_threads WHERE subject LIKE '%Deposits Have Been Verified%'`)
      .get();
    assert.ok(notice, "Portal notice is posted after deposit verification");

    console.log("membership applications tests: ok");
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
