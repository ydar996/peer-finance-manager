#!/usr/bin/env node
/**
 * Membership policy: per-Cooperative fee and initial contribution amounts.
 * Resolution: stored setting -> country profile default -> legacy constant.
 * Run: node peer-finance-manager/scripts/test-membership-policy.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-membership-policy-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb } = require("../db/database");
const {
  getMembershipPolicy,
  setMembershipPolicy,
} = require("../lib/membership-policy-service");
const { applyCountryProfileDefaults } = require("../lib/country-profile");

// No org context: legacy US constants.
assert.deepStrictEqual(getMembershipPolicy(), {
  feeModel: "one_time",
  membershipFee: 100,
  initialContribution: 100,
  annualDuesAmount: 100,
  annualDuesSchedule: [],
  annualDuesHistory: [],
  annualDuesReminderEnabled: false,
  annualDuesReminderFrequency: "monthly",
  shareCapitalEnabled: false,
});

const NG_ORG = "membership-policy-ng-coop";
openOrgDatabase(NG_ORG);
runWithOrg(NG_ORG, () => {
  applyCountryProfileDefaults("NG", { forceLocaleSettings: true });
  const policy = getMembershipPolicy();
  assert.strictEqual(policy.membershipFee, 50000);
  assert.strictEqual(policy.initialContribution, 50000);

  const updated = setMembershipPolicy({ membershipFee: 25000, initialContribution: 10000 });
  assert.strictEqual(updated.membershipFee, 25000);
  assert.strictEqual(updated.initialContribution, 10000);
  assert.deepStrictEqual(getMembershipPolicy(), {
    feeModel: "one_time",
    membershipFee: 25000,
    initialContribution: 10000,
    annualDuesAmount: 50000,
    annualDuesSchedule: [],
    annualDuesHistory: [],
    annualDuesReminderEnabled: false,
    annualDuesReminderFrequency: "monthly",
    shareCapitalEnabled: false,
  });

  const shareOn = setMembershipPolicy({ shareCapitalEnabled: true });
  assert.strictEqual(shareOn.shareCapitalEnabled, true);
  const shareOff = setMembershipPolicy({ shareCapitalEnabled: false });
  assert.strictEqual(shareOff.shareCapitalEnabled, false);

  assert.throws(() => setMembershipPolicy({ membershipFee: -5 }), /zero or greater/);
  assert.throws(() => setMembershipPolicy({ initialContribution: -5 }), /zero or greater/);
  // Zero initial contribution means no minimum first deposit (e.g. Twilight).
  assert.strictEqual(setMembershipPolicy({ initialContribution: 0 }).initialContribution, 0);
  // Zero membership fee means no one-time registration fee.
  assert.strictEqual(setMembershipPolicy({ membershipFee: 0 }).membershipFee, 0);
  setMembershipPolicy({ membershipFee: 25000 });
  setMembershipPolicy({ initialContribution: 10000 });
});
closeDb(NG_ORG);

const US_ORG = "membership-policy-us-coop";
openOrgDatabase(US_ORG);
runWithOrg(US_ORG, () => {
  applyCountryProfileDefaults("US", { forceLocaleSettings: true });
  assert.deepStrictEqual(getMembershipPolicy(), {
    feeModel: "one_time",
    membershipFee: 100,
    initialContribution: 100,
    annualDuesAmount: 100,
    annualDuesSchedule: [],
    annualDuesHistory: [],
    annualDuesReminderEnabled: false,
    annualDuesReminderFrequency: "monthly",
    shareCapitalEnabled: false,
  });
});
closeDb(US_ORG);

console.log("membership policy tests: ok");
process.exit(0);
