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

const {
  isInstallmentDueDay,
  previousInstallmentDueDate,
  installmentAlreadyRecorded,
  duePaymentForLot,
  buildLoanDueNoticeEmail,
} = require("../lib/loan-due-notice");

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
    collected: 0,
    repayments: [],
    schedule: [{ dueDate: "2026-06-22", totalDue: 100 }],
  };
  assert.equal(duePaymentForLot(lot, "2026-06-22"), 100);
  assert.equal(duePaymentForLot(lot, "2026-06-21"), null);
  assert.equal(duePaymentForLot({ ...lot, outstanding: 0 }, "2026-06-22"), null);
  const thirtyDayPlan = {
    outstanding: 900,
    disbursementDate: "2026-10-25",
    scheduledMonthlyPayment: 86.99,
    collected: 0,
    repayments: [],
    schedule: [{ dueDate: "2026-11-24", totalDue: 86.99 }],
  };
  assert.equal(duePaymentForLot(thirtyDayPlan, "2026-10-25"), null, "not due on disbursement day");
  assert.equal(duePaymentForLot(thirtyDayPlan, "2026-11-24"), 86.99);
  console.log("  due payment from schedule: OK");
}

function testSkipWhenRepaymentAlreadyRecorded() {
  assert.equal(previousInstallmentDueDate("2026-05-22", "2026-10-22"), "2026-09-22");
  assert.equal(previousInstallmentDueDate("2026-01-31", "2026-03-31"), "2026-02-28");

  const unpaid = {
    outstanding: 900,
    disbursementDate: "2026-05-22",
    scheduledMonthlyPayment: 100,
    collected: 100,
    repayments: [{ date: "2026-06-22", amount: 100 }],
    schedule: [
      { dueDate: "2026-06-22", totalDue: 100 },
      { dueDate: "2026-07-22", totalDue: 100 },
      { dueDate: "2026-10-22", totalDue: 100 },
    ],
  };
  assert.equal(duePaymentForLot(unpaid, "2026-10-22"), 100, "still due when earlier months only are paid");
  assert.equal(installmentAlreadyRecorded(unpaid, "2026-10-22"), false);

  const paidThisMonth = {
    ...unpaid,
    collected: 300,
    repayments: [
      { date: "2026-06-22", amount: 100 },
      { date: "2026-07-22", amount: 100 },
      { date: "2026-10-05", amount: 100 },
    ],
  };
  assert.equal(installmentAlreadyRecorded(paidThisMonth, "2026-10-22"), true);
  assert.equal(
    duePaymentForLot(paidThisMonth, "2026-10-22"),
    null,
    "do not nag when October repayment is already on the books"
  );

  const prepaid = {
    ...unpaid,
    collected: 300,
    repayments: [{ date: "2026-06-01", amount: 300 }],
    schedule: [
      { dueDate: "2026-06-22", totalDue: 100 },
      { dueDate: "2026-07-22", totalDue: 100 },
      { dueDate: "2026-10-22", totalDue: 100 },
    ],
  };
  assert.equal(duePaymentForLot(prepaid, "2026-10-22"), null, "prepaid later installments skip the due notice");

  const noSchedulePaid = {
    outstanding: 900,
    disbursementDate: "2026-05-22",
    scheduledMonthlyPayment: 100,
    collected: 400,
    repayments: [{ date: "2026-10-05", amount: 100 }],
    schedule: [],
  };
  assert.equal(duePaymentForLot(noSchedulePaid, "2026-10-22"), null, "calendar-window repayment skips notice");

  const noScheduleUnpaid = {
    ...noSchedulePaid,
    repayments: [{ date: "2026-09-22", amount: 100 }],
  };
  assert.equal(
    duePaymentForLot(noScheduleUnpaid, "2026-10-22"),
    100,
    "payment on the previous due date is last month, not this installment"
  );
  console.log("  skip when repayment already recorded: OK");
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
testSkipWhenRepaymentAlreadyRecorded();
testEmailCopy();
console.log("loan due notice tests: ok");
