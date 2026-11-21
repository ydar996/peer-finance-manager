#!/usr/bin/env node
/**
 * Country-aware billing: US Cooperatives keep USD/Stripe + check flow;
 * Nigerian Cooperatives get naira pricing and the bank-transfer rail with no
 * Stripe checkout. Run: node scripts/test-billing-country.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-billing-country-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { registerOrganization } = require("../lib/organization-service");
const {
  pricingSummary,
  paymentRailForCountry,
  PAYMENT_METHOD,
} = require("../lib/platform-billing-constants");
const {
  getTenantSubscription,
  createStripeCheckoutSession,
  requestCheckPayment,
  recordCheckPayment,
  getNgBankTransferDetails,
  setNgBankTransferDetails,
} = require("../lib/platform-billing-service");

// --- pricingSummary shape -------------------------------------------------
const us = pricingSummary("US");
assert.strictEqual(us.currency, "USD");
assert.strictEqual(us.currencySymbol, "$");
assert.strictEqual(us.paymentRail, "stripe");
assert.strictEqual(us.monthlyPrice, 29.99);
assert.strictEqual(us.monthlyPriceUsd, 29.99);
assert.strictEqual(us.monthlyAmountCents, 2999);

const ng = pricingSummary("NG");
assert.strictEqual(ng.currency, "NGN");
assert.strictEqual(ng.currencySymbol, "₦");
assert.strictEqual(ng.paymentRail, "bank_transfer");
assert.strictEqual(ng.monthlyPrice, 40343);
assert.strictEqual(ng.quarterlyPrice, 119818);
assert.strictEqual(ng.annualPrice, 464744);
assert.strictEqual(ng.quarterlySavings, 40343 * 3 - 119818);
assert.strictEqual(ng.annualSavings, 40343 * 12 - 464744);

assert.strictEqual(paymentRailForCountry("NG"), "bank_transfer");
assert.strictEqual(paymentRailForCountry("ng"), "bank_transfer");
assert.strictEqual(paymentRailForCountry("US"), "stripe");
assert.strictEqual(paymentRailForCountry(null), "stripe");

// --- org-level subscription response --------------------------------------
registerOrganization({ name: "US Test Coop", slug: "us-test-coop-abc1", countryCode: "US" });
registerOrganization({ name: "NG Test Coop", slug: "ng-test-coop-xyz9", countryCode: "NG" });

const usSub = getTenantSubscription("us-test-coop-abc1");
assert.strictEqual(usSub.countryCode, "US");
assert.strictEqual(usSub.pricing.currency, "USD");
assert.strictEqual(usSub.pricing.currencySymbol, "$");
assert.strictEqual(usSub.paymentRail, "stripe");
assert.ok(usSub.checkPayableTo);
assert.ok(usSub.checkMailingAddress);

const ngSub = getTenantSubscription("ng-test-coop-xyz9");
assert.strictEqual(ngSub.countryCode, "NG");
assert.strictEqual(ngSub.pricing.currency, "NGN");
assert.strictEqual(ngSub.pricing.currencySymbol, "₦");
assert.strictEqual(ngSub.pricing.monthlyPrice, 40343);
assert.strictEqual(ngSub.paymentRail, "bank_transfer");
assert.ok(ngSub.bankTransferDetails.includes("0001713399"));

// --- bank transfer details: default, override, tenant view -----------------
assert.ok(getNgBankTransferDetails().includes("Awoyinka Daramola"));
setNgBankTransferDetails("Bank: Test Bank\nAccount Name: Test\nAccount Number: 1");
assert.ok(getNgBankTransferDetails().includes("Test Bank"));
assert.ok(
  getTenantSubscription("ng-test-coop-xyz9").bankTransferDetails.includes("Test Bank")
);
let emptyErr;
try {
  setNgBankTransferDetails("   ");
} catch (caught) {
  emptyErr = caught;
}
assert.ok(emptyErr, "expected empty details to be rejected");

// --- Stripe checkout blocked for NG ----------------------------------------
async function expectNgCheckoutBlocked() {
  let err;
  try {
    await createStripeCheckoutSession("ng-test-coop-xyz9", "monthly", "admin@ng.test");
  } catch (caught) {
    err = caught;
  }
  assert.ok(err, "expected NG checkout to be blocked");
  assert.match(err.message, /bank transfer/i);
}

// --- offline payment flow -------------------------------------------------
const requested = requestCheckPayment("ng-test-coop-xyz9", { plan: "annual" });
assert.strictEqual(requested.subscriptionStatus, "check_pending");
assert.match(requested.checkPaymentReference, /^bank-transfer:annual:/);

const usRequested = requestCheckPayment("us-test-coop-abc1");
assert.match(usRequested.checkPaymentReference, /^check-request:/);

const usRecorded = recordCheckPayment("us-test-coop-abc1", { plan: "monthly", checkNumber: "1042" });
assert.strictEqual(usRecorded.subscriptionStatus, "active");
assert.strictEqual(usRecorded.paymentMethod, PAYMENT_METHOD.CHECK);
assert.match(usRecorded.checkPaymentReference, /^Check #1042/);

const ngRecorded = recordCheckPayment("ng-test-coop-xyz9", { plan: "annual", checkNumber: "TRF-7788" });
assert.strictEqual(ngRecorded.subscriptionStatus, "active");
assert.strictEqual(ngRecorded.paymentMethod, PAYMENT_METHOD.BANK_TRANSFER);
assert.match(ngRecorded.checkPaymentReference, /^Bank transfer #TRF-7788/);

expectNgCheckoutBlocked().then(() => {
  console.log("test-billing-country: all assertions passed");
});
