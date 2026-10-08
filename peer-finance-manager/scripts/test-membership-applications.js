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
  rejectMembershipApplication,
  getApplicantPaymentReadiness,
} = require("../lib/flexxforms-membership-service");
const { listActiveDirectoryMembers } = require("../lib/membership-status-service");
const { recordMemberDepositEntry } = require("../lib/manual-entry-service");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const { MEMBERSHIP_FEE, TRANSACTION_TYPES } = require("../lib/constants");

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

    recordMemberDepositEntry({
      memberId: processed.memberId,
      type: TRANSACTION_TYPES.DEPOSIT,
      amount: 250,
      transactionDate: "2026-10-07",
      description: "First membership deposit",
    });
    const feeTx = db
      .prepare(`SELECT amount FROM transactions WHERE member_id = ? AND type = ?`)
      .get(processed.memberId, TRANSACTION_TYPES.MEMBERSHIP_FEE);
    assert.ok(feeTx, "First deposit deducts the agreed membership fee");
    assert.equal(Number(feeTx.amount), -MEMBERSHIP_FEE);
    assert.equal(getMemberDepositAccountBalance(processed.memberId), 150);
    const depositRows = db
      .prepare(`SELECT COUNT(*) AS n FROM transactions WHERE member_id = ? AND type = ?`)
      .get(processed.memberId, TRANSACTION_TYPES.DEPOSIT);
    assert.equal(Number(depositRows.n), 1, "Fee split does not rewrite or add a second deposit");
    assert.equal(
      db.prepare(`SELECT status FROM flexxforms_applications WHERE id = ?`).get(applicationId)
        .status,
      "deposits_verified",
      "First deposit plus fee split verifies the application automatically"
    );

    const verified = await verifyMembershipDeposits(applicationId, { recordPayments: true });
    assert.equal(verified.status, "deposits_verified");
    assert.equal(verified.alreadyVerified, true);

    const afterVerify = getApplicantPaymentReadiness(processed.memberId);
    assert.equal(afterVerify.membershipFeePaid, true);
    assert.equal(afterVerify.initialContributionMet, true);
    assert.equal(afterVerify.extraAfterFee, 150);
    assert.equal(getMemberDepositAccountBalance(processed.memberId), 150);
    assert.equal(
      Number(
        db
          .prepare(`SELECT COUNT(*) AS n FROM transactions WHERE member_id = ? AND type = ?`)
          .get(processed.memberId, TRANSACTION_TYPES.DEPOSIT).n
      ),
      1,
      "Verify Deposits does not add a second contribution on top of the bank deposit"
    );

    const notice = db
      .prepare(`SELECT subject FROM coop_message_threads WHERE subject LIKE '%Deposits Have Been Verified%'`)
      .get();
    assert.ok(notice, "Portal notice is posted after deposit verification");

    assert.throws(
      () => rejectMembershipApplication(applicationId),
      /cannot be disregarded/,
      "Accepted applications cannot be disregarded"
    );

    const wrongInserted = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status)
         VALUES ('membership', 'sub-wrong', 'form-1', ?, 'pending')`
      )
      .run(JSON.stringify(payloadFor("Wrong", "Dob", "wrong-dob@example.com")));
    const wrongId = wrongInserted.lastInsertRowid;
    const wrong = processMembershipFormSubmission(
      wrongId,
      payloadFor("Wrong", "Dob", "wrong-dob@example.com")
    );
    assert.equal(summarizeMembershipApplications().pendingCount, 1);
    const disregarded = rejectMembershipApplication(wrongId);
    assert.equal(disregarded.status, "rejected");
    assert.equal(disregarded.memberRemoved, true);
    assert.equal(summarizeMembershipApplications().pendingCount, 0);
    assert.equal(
      db.prepare(`SELECT id FROM members WHERE id = ?`).get(wrong.memberId),
      undefined,
      "Unused pending profile is removed when the only application is disregarded"
    );

    const adaPayload = payloadFor("Ada", "Okeke", "ada@example.com");
    const adaFirst = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status)
         VALUES ('membership', 'sub-ada-1', 'form-1', ?, 'pending')`
      )
      .run(JSON.stringify(adaPayload));
    const adaSecond = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status)
         VALUES ('membership', 'sub-ada-2', 'form-1', ?, 'pending')`
      )
      .run(JSON.stringify(adaPayload));
    const ada1 = processMembershipFormSubmission(adaFirst.lastInsertRowid, adaPayload);
    const ada2 = processMembershipFormSubmission(adaSecond.lastInsertRowid, adaPayload);
    assert.equal(ada1.memberId, ada2.memberId);
    assert.equal(summarizeMembershipApplications().pendingCount, 2);
    const adaDisregarded = rejectMembershipApplication(adaFirst.lastInsertRowid);
    assert.equal(adaDisregarded.memberRemoved, false);
    assert.equal(summarizeMembershipApplications().pendingCount, 1);
    assert.ok(db.prepare(`SELECT id FROM members WHERE id = ?`).get(ada1.memberId));
    await approveMembershipApplication(adaSecond.lastInsertRowid, 1);
    assert.equal(summarizeMembershipApplications().pendingCount, 0);

    const benPayload = payloadFor("Ben", "Okeke", "ben@example.com");
    const benFirst = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status)
         VALUES ('membership', 'sub-ben-1', 'form-1', ?, 'pending')`
      )
      .run(JSON.stringify(benPayload));
    const benSecond = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status)
         VALUES ('membership', 'sub-ben-2', 'form-1', ?, 'pending')`
      )
      .run(JSON.stringify(benPayload));
    processMembershipFormSubmission(benFirst.lastInsertRowid, benPayload);
    processMembershipFormSubmission(benSecond.lastInsertRowid, benPayload);
    assert.equal(summarizeMembershipApplications().pendingCount, 2);
    await approveMembershipApplication(benSecond.lastInsertRowid, 1);
    const benClosed = db
      .prepare(`SELECT status FROM flexxforms_applications WHERE id = ?`)
      .get(benFirst.lastInsertRowid);
    assert.equal(benClosed.status, "rejected");
    assert.equal(summarizeMembershipApplications().pendingCount, 0);

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
