#!/usr/bin/env node
/**
 * Annual membership fee model: dues schedule resolution, instalment payments,
 * outstanding/paid status, reminder targeting, historical immutability, and
 * coexistence with the one-time fee model.
 * Run: node peer-finance-manager/scripts/test-annual-dues.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-annual-dues-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const {
  getMembershipPolicy,
  setMembershipPolicy,
  duesRequirementForYear,
} = require("../lib/membership-policy-service");
const {
  getAnnualDuesStatus,
  memberDuesPaid,
  isAnnualFeeModel,
} = require("../lib/annual-dues-service");
const { reminderDueNow, buildDuesReminderEmail } = require("../lib/annual-dues-reminder-service");
const { recordMembershipFee, createMember } = require("../lib/member-service");
const { applyCountryProfileDefaults } = require("../lib/country-profile");
const { setCooperativeSetting } = require("../lib/cooperative-settings");

const ORG = "annual-dues-test-coop";
openOrgDatabase(ORG);
runWithOrg(ORG, () => {
  applyCountryProfileDefaults("NG", { forceLocaleSettings: true });

  // Default model is one_time for backward compatibility.
  assert.strictEqual(getMembershipPolicy().feeModel, "one_time");
  assert.strictEqual(isAnnualFeeModel(), false);

  // Switch to annual model with NGN 150,000 dues (Twilight's current fee).
  const policy = setMembershipPolicy({ feeModel: "annual", annualDuesAmount: 150000 });
  assert.strictEqual(policy.feeModel, "annual");
  assert.strictEqual(policy.annualDuesAmount, 150000);
  assert.strictEqual(isAnnualFeeModel(), true);
  assert.strictEqual(duesRequirementForYear(2026), 150000);

  // Per-year schedule: explicit year amount wins; prior years inherit.
  setMembershipPolicy({
    annualDuesSchedule: [
      { year: 2026, amount: 150000 },
      { year: 2028, amount: 200000 },
    ],
  });
  assert.strictEqual(duesRequirementForYear(2026), 150000);
  assert.strictEqual(duesRequirementForYear(2027), 150000); // inherits 2026
  assert.strictEqual(duesRequirementForYear(2028), 200000);
  assert.strictEqual(duesRequirementForYear(2029), 200000); // inherits 2028
  assert.strictEqual(duesRequirementForYear(2025), 150000); // before all schedule entries: current amount

  // Audit: every change is stamped (setAt/setBy) and appended to the history.
  let schedule = getMembershipPolicy().annualDuesSchedule;
  assert.strictEqual(schedule.length, 2);
  assert.ok(schedule.every((e) => e.setAt && e.setBy));

  const { getDuesHistory } = require("../lib/membership-policy-service");
  let history = getDuesHistory();
  assert.ok(history.some((h) => h.scope === 2026 && h.to === 150000));
  assert.ok(history.some((h) => h.scope === 2028 && h.to === 200000));

  // Mid-year vote: 2026 amount changes; historical payments untouched, and
  // the change is logged with the actor.
  setMembershipPolicy({
    annualDuesSchedule: [
      { year: 2026, amount: 175000 },
      { year: 2028, amount: 200000 },
    ],
    changedBy: "Test Admin",
  });
  assert.strictEqual(duesRequirementForYear(2026), 175000);
  history = getDuesHistory();
  const change = history.find((h) => h.scope === 2026 && h.from === 150000 && h.to === 175000);
  assert.ok(change, "mid-year amount change logged");
  assert.strictEqual(change.by, "Test Admin");
  // Unchanged 2028 entry keeps its original stamp, not a new one.
  const s2028 = getMembershipPolicy().annualDuesSchedule.find((e) => e.year === 2028);
  const firstStamp = schedule.find((e) => e.year === 2028).setAt;
  assert.strictEqual(s2028.setAt, firstStamp);
  // Restore the 2026 amount for the payment assertions below.
  setMembershipPolicy({
    annualDuesSchedule: [
      { year: 2026, amount: 150000 },
      { year: 2028, amount: 200000 },
    ],
  });

  // Members.
  const m1Id = createMember({ name: "Ada Member", memberNo: "T-001", recordMembershipFee: false }).memberId;
  const m2Id = createMember({ name: "Bola Member", memberNo: "T-002", recordMembershipFee: false }).memberId;

  // Instalment payments accumulate toward the year requirement.
  recordMembershipFee(m1Id, { feeDate: "2026-03-01", amount: 75000 });
  let status = getAnnualDuesStatus(2026);
  let row1 = status.rows.find((r) => r.memberId === m1Id);
  assert.strictEqual(row1.paid, 75000);
  assert.strictEqual(row1.outstanding, 75000);
  assert.strictEqual(row1.status, "partial");

  recordMembershipFee(m1Id, { feeDate: "2026-06-01", amount: 75000 });
  row1 = getAnnualDuesStatus(2026).rows.find((r) => r.memberId === m1Id);
  assert.strictEqual(row1.paid, 150000);
  assert.strictEqual(row1.outstanding, 0);
  assert.strictEqual(row1.status, "paid");
  assert.strictEqual(
    getDb().prepare(`SELECT membership_fee_paid FROM members WHERE id = ?`).get(m1Id)
      .membership_fee_paid,
    1
  );

  // m2 has paid nothing: unpaid with full amount outstanding.
  const row2 = getAnnualDuesStatus(2026).rows.find((r) => r.memberId === m2Id);
  assert.strictEqual(row2.status, "unpaid");
  assert.strictEqual(row2.outstanding, 150000);
  assert.strictEqual(memberDuesPaid(m2Id, 2026), 0);

  // Changing the current fee does not rewrite recorded instalments.
  const before = memberDuesPaid(m1Id, 2026);
  setMembershipPolicy({ annualDuesAmount: 175000 });
  assert.strictEqual(memberDuesPaid(m1Id, 2026), before);
  // m1 still counts as paid in 2026 because that year's requirement is scheduled.
  assert.strictEqual(
    getAnnualDuesStatus(2026).rows.find((r) => r.memberId === m1Id).status,
    "paid"
  );
  // 2029 requirement now follows the schedule (200000), not the new current amount.
  assert.strictEqual(duesRequirementForYear(2029), 200000);

  // Totals.
  const totals = getAnnualDuesStatus(2026).totals;
  assert.strictEqual(totals.members, 2);
  assert.strictEqual(totals.paid, 1);
  assert.strictEqual(totals.unpaid, 1);
  assert.strictEqual(totals.outstandingTotal, 150000);

  // Reminder frequency gating.
  setMembershipPolicy({ annualDuesReminderEnabled: true, annualDuesReminderFrequency: "monthly" });
  assert.strictEqual(reminderDueNow(), true); // never sent
  setCooperativeSetting(getDb(), "annual_dues_reminder_last_sent", new Date().toISOString());
  assert.strictEqual(reminderDueNow(), false); // monthly: just sent
  setCooperativeSetting(
    getDb(),
    "annual_dues_reminder_last_sent",
    new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  );
  assert.strictEqual(reminderDueNow(), true);

  // Disabled reminders block scheduled sends.
  setMembershipPolicy({ annualDuesReminderEnabled: false });
  assert.strictEqual(reminderDueNow(), false);

  // Invalid frequency rejected.
  assert.throws(
    () => setMembershipPolicy({ annualDuesReminderFrequency: "hourly" }),
    /daily, weekly, or monthly/
  );

  // Reminder email content.
  const email = buildDuesReminderEmail({
    memberName: "Bola Member",
    orgName: "Test Cooperative",
    year: 2026,
    paid: 0,
    required: 150000,
    outstanding: 150000,
    portalUrl: "http://example.test",
  });
  assert.ok(email.subject.includes("2026"));
  assert.ok(email.text.includes("instalments"));
  assert.ok(email.text.includes("Bola Member"));

  // One-time model keeps its legacy single-fee rule.
  const OTHER = "annual-dues-onetime-coop";
  openOrgDatabase(OTHER);
  runWithOrg(OTHER, () => {
    applyCountryProfileDefaults("US", { forceLocaleSettings: true });
    assert.strictEqual(getMembershipPolicy().feeModel, "one_time");
    const mid = createMember({ name: "Us Member", memberNo: "U-001", recordMembershipFee: false }).memberId;
    recordMembershipFee(mid, { feeDate: "2026-01-01", amount: 100 });
    assert.throws(
      () => recordMembershipFee(mid, { feeDate: "2026-02-01", amount: 100 }),
      /already recorded/
    );
    // Annual-model-only paths stay inert in the one_time model.
    assert.strictEqual(isAnnualFeeModel(), false);
  });
  closeDb(OTHER);
});
closeDb(ORG);

console.log("annual dues tests: ok");
process.exit(0);
