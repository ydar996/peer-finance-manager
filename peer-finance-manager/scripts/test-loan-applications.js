#!/usr/bin/env node
/**
 * FlexxForms loan applications: parse, store, approve into PFM loan.
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
const {
  parseFlexxFormsLoanPayload,
  processLoanFormSubmission,
  listLoanApplications,
  approveLoanApplication,
} = require("../lib/flexxforms-loan-service");
const { ensureMembershipApplicationSchema } = require("../lib/flexxforms-membership-service");

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

function run() {
  runWithOrg(ORG, () => {
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
        { fieldIndex: 5, label: "Term (Months)", value: "12" },
        { fieldIndex: 6, label: "Purpose", value: "Home repair" },
        { fieldIndex: 7, label: "Guarantor 1 Name", value: "Guar One" },
        { fieldIndex: 8, label: "Guarantor 2 Name", value: "Guar Two" },
      ],
    });
    assert.strictEqual(parsed.principal, 1000);
    assert.strictEqual(parsed.termMonths, 12);
    assert.ok(parsed.applicantName.includes("Borrower"));

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
            { fieldIndex: 5, label: "Term (Months)", value: "12" },
            { fieldIndex: 6, label: "Purpose", value: "Home repair" },
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
        { fieldIndex: 5, label: "Term (Months)", value: "12" },
      ],
    });
    assert.strictEqual(processed.memberId, borrower.memberId);

    const listed = listLoanApplications();
    assert.ok(listed.some((a) => a.id === applicationId && a.status === "pending_review"));

    const approved = approveLoanApplication(applicationId, 1, {
      borrowerId: borrower.memberId,
      principal: 1000,
      termMonths: 12,
      startDate: "2026-07-01",
      guarantor1Id: g1.memberId,
      guarantor2Id: g2.memberId,
    });
    assert.ok(approved.loanId);
    const loan = db.prepare(`SELECT * FROM loans WHERE id = ?`).get(approved.loanId);
    assert.ok(loan);
    assert.strictEqual(Number(loan.principal), 1000);

    console.log("  loan applications parse/approve: OK");
    closeDb(ORG);
  });
  console.log("All loan application tests passed.");
}

run();
