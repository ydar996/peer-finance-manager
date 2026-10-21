#!/usr/bin/env node
/**
 * FlexxForms loan applications: parse, offer terms, member accept, then approve.
 * Run: npm run test:loan-applications
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-loan-apps-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const { createMember } = require("../lib/member-service");
const { recordMemberDepositEntry } = require("../lib/manual-entry-service");
const { setLoanPaymentPolicy, getLoanPaymentPolicy } = require("../lib/loan-policy-service");
const {
  parseFlexxFormsLoanPayload,
  processLoanFormSubmission,
  listLoanApplications,
  offerLoanTerms,
  acceptLoanTerms,
  rejectLoanTerms,
  approveLoanApplication,
} = require("../lib/flexxforms-loan-service");
const { ensureMembershipApplicationSchema } = require("../lib/flexxforms-membership-service");
const { formatScheduleText } = require("../lib/loan-application-notify");
const {
  listPendingApprovedLoans,
  matchPendingApprovedLoan,
  applyApprovedLoanDisbursementMatches,
  markApprovedLoanDisbursed,
} = require("../lib/approved-loan-disbursement");

const ORG = "loan-apps-test-coop";

function setup() {
  openOrgDatabase(ORG);
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      username TEXT,
      password_hash TEXT,
      role TEXT,
      member_id INTEGER,
      display_name TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
}

function insertUser(db, { email, username, role, memberId, displayName }) {
  return db
    .prepare(
      `INSERT INTO users (email, username, password_hash, role, member_id, display_name, active)
       VALUES (?, ?, 'x', ?, ?, ?, 1)`
    )
    .run(email, username, role, memberId || null, displayName).lastInsertRowid;
}

async function run() {
  await runWithOrg(ORG, async () => {
    setup();
    const borrower = createMember({
      firstName: "Loan",
      lastName: "Borrower",
      email: "borrower@example.com",
      recordMembershipFee: false,
    });
    const g1 = createMember({
      firstName: "Guar",
      lastName: "One",
      email: "g1@example.com",
      recordMembershipFee: false,
    });
    const g2 = createMember({
      firstName: "Guar",
      lastName: "Two",
      email: "g2@example.com",
      recordMembershipFee: false,
    });

    const dbSetup = getDb();
    insertUser(dbSetup, {
      email: "admin@example.com",
      username: "admin",
      role: "admin",
      displayName: "Test Admin",
    });
    const borrowerUserId = insertUser(dbSetup, {
      email: "borrower@example.com",
      username: "loanborrower",
      role: "member",
      memberId: borrower.memberId,
      displayName: "Loan Borrower",
    });

    for (const memberId of [borrower.memberId, g1.memberId, g2.memberId]) {
      dbSetup
        .prepare(`UPDATE members SET joined_at = ? WHERE id = ?`)
        .run("2025-01-01", memberId);
      recordMemberDepositEntry({
        memberId,
        type: "deposit",
        amount: 5000,
        transactionDate: "2025-01-15",
      });
    }

    const parsed = parseFlexxFormsLoanPayload({
      answers: [
        { fieldIndex: 1, label: "Email", value: "borrower@example.com" },
        { fieldIndex: 2, label: "First Name", value: "Loan" },
        { fieldIndex: 3, label: "Last Name", value: "Borrower" },
        { fieldIndex: 4, label: "Loan Amount", value: "1000" },
        { fieldIndex: 5, label: "Purpose", value: "Home repair" },
      ],
    });
    assert.strictEqual(parsed.principal, 1000);
    assert.strictEqual(parsed.termMonths, null);
    assert.ok(parsed.applicantName.includes("Borrower"));

    const policy = getLoanPaymentPolicy();
    assert.strictEqual(policy.annualRate, 0.08);
    assert.strictEqual(policy.annualRatePercent, 8);

    const db = getDb();
    const insert = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status)
         VALUES ('loan', 'sub-1', 'form-1', ?, 'pending')`
      )
      .run(
        JSON.stringify({
          answers: [
            { fieldIndex: 1, label: "Email", value: "borrower@example.com" },
            { fieldIndex: 2, label: "First Name", value: "Loan" },
            { fieldIndex: 3, label: "Last Name", value: "Borrower" },
            { fieldIndex: 4, label: "Loan Amount", value: "1000" },
            { fieldIndex: 5, label: "Purpose", value: "Home repair" },
          ],
        })
      );
    const applicationId = insert.lastInsertRowid;
    const processed = processLoanFormSubmission(applicationId, {
      answers: [
        { fieldIndex: 1, label: "Email", value: "borrower@example.com" },
        { fieldIndex: 2, label: "First Name", value: "Loan" },
        { fieldIndex: 3, label: "Last Name", value: "Borrower" },
        { fieldIndex: 4, label: "Loan Amount", value: "1000" },
      ],
    });
    assert.strictEqual(processed.memberId, borrower.memberId);

    const listed = listLoanApplications();
    const row = listed.find((a) => a.id === applicationId);
    assert.ok(row);
    assert.strictEqual(row.status, "pending_review");
    assert.strictEqual(row.parsed.termMonths, 12);
    assert.equal(row.coverage?.covered, true);

    let approveBlocked = false;
    try {
      await approveLoanApplication(applicationId, 1, { borrowerId: borrower.memberId });
    } catch (err) {
      approveBlocked = /Accept Terms/.test(err.message);
    }
    assert.ok(approveBlocked, "approve must wait for Accept Terms");

    const offered = await offerLoanTerms(applicationId, 1, {
      borrowerId: borrower.memberId,
      principal: 1000,
      startDate: "2026-07-01",
    });
    assert.strictEqual(offered.status, "terms_offered");
    assert.strictEqual(offered.terms.termMonths, 12);
    assert.strictEqual(offered.terms.annualRate, 0.08);
    assert.strictEqual(offered.terms.schedule.length, 12);
    assert.ok(offered.terms.monthlyPayment > 0);
    assert.equal(offered.terms.coveredByDeposits, true);
    const scheduleCopy = formatScheduleText(offered.terms.schedule);
    assert.match(scheduleCopy, /Principal/);
    assert.match(scheduleCopy, /Interest/);
    assert.ok(offered.terms.schedule[0].principalDue > 0);
    assert.ok(offered.terms.schedule[0].interestDue > 0);

    let exceedBlocked = false;
    const exceedInsert = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status, member_id)
         VALUES ('loan', 'sub-over', 'form-1', ?, 'pending_review', ?)`
      )
      .run(
        JSON.stringify({
          answers: [{ fieldIndex: 1, label: "Loan Amount", value: "9000" }],
        }),
        borrower.memberId
      );
    try {
      await offerLoanTerms(exceedInsert.lastInsertRowid, 1, {
        borrowerId: borrower.memberId,
        principal: 9000,
        startDate: "2026-07-01",
      });
    } catch (err) {
      exceedBlocked = /Two guarantors are required/i.test(err.message);
    }
    assert.ok(exceedBlocked, "amounts above contributions cannot use this simple workflow");

    const accepted = acceptLoanTerms(
      { role: "member", memberId: borrower.memberId, id: borrowerUserId },
      applicationId
    );
    assert.strictEqual(accepted.status, "terms_accepted");
    assert.ok(accepted.terms?.acceptedAt);

    const approved = await approveLoanApplication(applicationId, 1, {
      borrowerId: borrower.memberId,
    });
    assert.ok(approved.loanId);
    const loan = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(approved.loanId);
    assert.ok(loan);
    assert.strictEqual(Number(loan.principal), 1000);
    assert.strictEqual(Number(loan.annual_rate), 0.08);
    assert.strictEqual(Number(loan.term_months), 12);
    assert.equal(loan.guarantor1_id, null);
    assert.equal(loan.guarantor2_id, null);
    const installments = db
      .prepare(`SELECT COUNT(*) AS n FROM loan_installments WHERE loan_id = ?`)
      .get(approved.loanId);
    assert.strictEqual(installments.n, 12);
    const listedApproved = listLoanApplications().find((a) => a.id === applicationId);
    assert.equal(listedApproved.awaitingBankDisbursement, true);
    const pending = listPendingApprovedLoans();
    assert.ok(pending.some((row) => row.applicationId === applicationId));
    const outflow = {
      amount: -1000,
      ledgerType: "expense",
      description: "Zelle to Loan Borrower",
      member: null,
      date: "2026-10-25",
      bucket: "needsReview",
    };
    const match = matchPendingApprovedLoan(outflow, pending, new Set());
    assert.ok(match);
    assert.strictEqual(match.applicationId, applicationId);
    applyApprovedLoanDisbursementMatches([outflow], ["Loan Borrower"]);
    assert.strictEqual(outflow.ledgerType, "loan_disbursement");
    assert.strictEqual(outflow.member, "Loan Borrower");
    const depositRow = {
      amount: 1000,
      ledgerType: "deposit",
      description: "Zelle from Loan Borrower",
      member: "Loan Borrower",
      date: "2026-10-25",
      bucket: "ready",
    };
    applyApprovedLoanDisbursementMatches([depositRow], ["Loan Borrower"]);
    assert.strictEqual(depositRow.ledgerType, "deposit", "inflows stay deposits");
    markApprovedLoanDisbursed({
      applicationId,
      transactionId: 99,
      disbursementDate: "2026-10-25",
      memberId: borrower.memberId,
    });
    assert.equal(
      listLoanApplications().find((a) => a.id === applicationId).awaitingBankDisbursement,
      false
    );
    assert.ok(!listPendingApprovedLoans().some((row) => row.applicationId === applicationId));
    const loanAfter = db.prepare(`SELECT start_date FROM loans WHERE id = ?`).get(approved.loanId);
    assert.strictEqual(String(loanAfter.start_date).slice(0, 10), "2026-10-25");

    const rejectInsert = db
      .prepare(
        `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status, member_id)
         VALUES ('loan', 'sub-reject', 'form-1', ?, 'pending_review', ?)`
      )
      .run(
        JSON.stringify({
          answers: [{ fieldIndex: 1, label: "Loan Amount", value: "800" }],
        }),
        borrower.memberId
      );
    const rejectAppId = rejectInsert.lastInsertRowid;
    await offerLoanTerms(rejectAppId, 1, {
      borrowerId: borrower.memberId,
      principal: 800,
      startDate: "2026-08-01",
    });
    const declined = rejectLoanTerms(
      { role: "member", memberId: borrower.memberId, id: borrowerUserId },
      rejectAppId
    );
    assert.strictEqual(declined.status, "terms_rejected");
    assert.ok(declined.terms?.rejectedAt);

    setLoanPaymentPolicy({ annualRatePercent: 10 });
    assert.strictEqual(getLoanPaymentPolicy().annualRatePercent, 10);
    setLoanPaymentPolicy({ annualRatePercent: 8 });

    console.log("  loan applications offer/accept/approve: OK");
    closeDb(ORG);
  });
  console.log("All loan application tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
