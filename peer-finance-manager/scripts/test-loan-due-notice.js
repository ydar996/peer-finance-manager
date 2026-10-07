#!/usr/bin/env node
/**
 * Loan installment due-date notices.
 * Run: npm run test:loan-due-notice
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-loan-due-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { isInstallmentDueDay, duePaymentForLot, buildLoanDueNoticeEmail } = require(
  "../lib/loan-due-notice"
);

function testDueDays() {
  assert.equal(isInstallmentDueDay("2026-05-22", "2026-05-22"), false, "not due on disbursement day");
  assert.equal(isInstallmentDueDay("2026-05-22", "2026-06-22"), true);
  assert.equal(isInstallmentDueDay("2026-05-22", "2026-06-21"), false);
  assert.equal(isInstallmentDueDay("2026-01-31", "2026-02-28"), true, "end-of-month rollover");
  assert.equal(isInstallmentDueDay("2026-01-31", "2026-03-31"), true);
  assert.equal(isInstallmentDueDay("2026-01-31", "2026-04-30"), true);
  assert.equal(isInstallmentDueDay("2026-01-31", "2028-02-29"), true, "leap-year February");
  assert.equal(isInstallmentDueDay("2026-05-31", "2026-06-30"), true);
  console.log("  installment due day: OK");
}

function testDuePaymentFromSchedule() {
  const lot = {
    outstanding: 900,
    disbursementDate: "2026-05-22",
    scheduledMonthlyPayment: 100,
    schedule: [{ dueDate: "2026-06-22", totalDue: 100 }],
  };
  assert.equal(duePaymentForLot(lot, "2026-06-22"), 100);
  assert.equal(duePaymentForLot(lot, "2026-06-21"), null);
  assert.equal(duePaymentForLot({ ...lot, outstanding: 0 }, "2026-06-22"), null);
  console.log("  due payment from schedule: OK");
}

function testEmailCopy() {
  const message = buildLoanDueNoticeEmail({
    memberName: "Ada Okeke",
    dueDate: "2026-06-22",
    loans: [{ loanLabel: "Loan 1", paymentAmount: 125.5, outstanding: 1875 }],
    branding: { name: "Test Cooperative", portalUrl: "https://example.test/member" },
  });
  assert.match(message.subject, /Loan Payment Due/);
  assert.match(message.text, /125/);
  assert.match(message.text, /1,875|1875/);
  assert.match(message.text, /already sent this payment/);
  assert.match(message.text, /bank reconciliation/);
  assert.match(message.text, /recognizing the date of the transaction/);
  console.log("  email copy: OK");
}

testDueDays();
testDuePaymentFromSchedule();
testEmailCopy();
console.log("loan due notice tests: ok");
