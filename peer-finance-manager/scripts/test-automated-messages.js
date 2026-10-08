#!/usr/bin/env node
/**
 * Automated message catalog and wording overrides.
 * Run: npm run test:automated-messages
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-auto-msg-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase } = require("../db/database");
const {
  listAutomatedMessages,
  saveAutomatedMessage,
  resetAutomatedMessage,
  renderAutomatedEmail,
  fillTemplate,
  sanitizeCopy,
} = require("../lib/automated-message-service");
const { buildLoanDueNoticeEmail } = require("../lib/loan-due-notice");

const ORG = "auto-msg-test-coop";

function testDefaults() {
  const listed = listAutomatedMessages();
  const ids = listed.map((row) => row.id);
  assert.ok(ids.includes("loan_due_notice"));
  assert.ok(ids.includes("deposit_credit_alert"));
  assert.equal(
    listed.every((row) => row.subject && row.body),
    true
  );

  const due = renderAutomatedEmail("loan_due_notice", {
    memberName: "Ada Okeke",
    orgName: "Test Cooperative",
    portalUrl: "https://example.test/member",
    dueDate: "06/22/2026",
    paymentAmount: "$125.50",
    loanLabel: "Loan 1",
    outstandingBalance: "$1,875.00",
    details:
      "Your installment of $125.50 for Loan 1 is due today, 06/22/2026. Your outstanding loan balance as of 06/22/2026 is $1,875.00.",
  });
  assert.match(due.subject, /Loan Payment Due/);
  assert.match(due.text, /already sent this payment/);
  assert.match(due.text, /as soon as it is confirmed/);
  assert.doesNotMatch(due.text, /imported/i);

  const verified = renderAutomatedEmail("deposits_verified", {
    memberName: "Olayemi Daramola",
    orgName: "Test Cooperative",
    feeAmount: "$100.00",
    depositAmount: "$150.00",
    contributionAmount: "$50.00",
  });
  assert.match(verified.text, /\$150\.00/);
  assert.match(verified.text, /\$50\.00/);
  assert.match(verified.text, /\$100\.00/);
  assert.doesNotMatch(verified.text, /initial contribution/i);

  const built = buildLoanDueNoticeEmail({
    memberName: "Ada Okeke",
    dueDate: "2026-06-22",
    loans: [{ loanLabel: "Loan 1", paymentAmount: 125.5, outstanding: 1875 }],
    branding: { name: "Test Cooperative", portalUrl: "https://example.test/member" },
  });
  assert.match(built.text, /confirmed/);
  assert.doesNotMatch(built.text, /imported/i);

  assert.equal(fillTemplate("Hello {{memberName}}", { memberName: "Ada" }), "Hello Ada");
  assert.equal(sanitizeCopy("Notice — Payment"), "Notice: Payment");
  assert.equal(sanitizeCopy("paid – thank you"), "paid: thank you");
  assert.throws(() => saveAutomatedMessage("not_a_real_message", { subject: "x", body: "y" }));
  console.log("  catalog and default copy: OK");
}

async function testSaveOverride() {
  await runWithOrg(ORG, async () => {
    openOrgDatabase(ORG);
    saveAutomatedMessage("loan_due_notice", {
      subject: "{{orgName}}: Payment Reminder",
      body: "Hello {{memberName}}.\nPlease send {{paymentAmount}} today.",
    });
    const customized = renderAutomatedEmail("loan_due_notice", {
      memberName: "Ada Okeke",
      orgName: "Test Cooperative",
      paymentAmount: "$125.50",
    });
    assert.equal(customized.subject, "Test Cooperative: Payment Reminder");
    assert.match(customized.text, /Please send \$125\.50 today/);
    const saved = listAutomatedMessages().find((row) => row.id === "loan_due_notice");
    assert.equal(saved.customized, true);
    resetAutomatedMessage("loan_due_notice");
    const restored = renderAutomatedEmail("loan_due_notice", {
      memberName: "Ada Okeke",
      orgName: "Test Cooperative",
      details: "Your installment of $10.00 is due today.",
    });
    assert.match(restored.subject, /Loan Payment Due/);
    assert.match(restored.text, /as soon as it is confirmed/);
    console.log("  save and restore: OK");
  });
}

async function run() {
  testDefaults();
  try {
    await testSaveOverride();
  } catch (err) {
    if (String(err.message || "").includes("Application Control policy")) {
      console.log("  save and restore: skipped (SQLite native module blocked on this machine)");
    } else {
      throw err;
    }
  }
  console.log("automated messages: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
