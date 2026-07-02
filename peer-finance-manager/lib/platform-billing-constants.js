/** Peer Finance Manager SaaS pricing (USD). */
const MONTHLY_PRICE_USD = 24.99;
const QUARTERLY_DISCOUNT_RATE = 0.05;
const ANNUAL_DISCOUNT_RATE = 0.09;
const QUARTERLY_PRICE_USD =
  Math.round(MONTHLY_PRICE_USD * 3 * (1 - QUARTERLY_DISCOUNT_RATE) * 100) / 100;
const ANNUAL_PRICE_USD =
  Math.round(MONTHLY_PRICE_USD * 12 * (1 - ANNUAL_DISCOUNT_RATE) * 100) / 100;

const MONTHLY_AMOUNT_CENTS = Math.round(MONTHLY_PRICE_USD * 100);
const QUARTERLY_AMOUNT_CENTS = Math.round(QUARTERLY_PRICE_USD * 100);
const ANNUAL_AMOUNT_CENTS = Math.round(ANNUAL_PRICE_USD * 100);

const SUBSCRIPTION_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
  CHECK_PENDING: "check_pending",
};

const SUBSCRIPTION_PLAN = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUAL: "annual",
};

const PAYMENT_METHOD = {
  STRIPE: "stripe",
  CHECK: "check",
  LEGACY: "legacy",
};

function isSubscriptionActive(status) {
  return status === SUBSCRIPTION_STATUS.ACTIVE;
}

function isValidSubscriptionPlan(plan) {
  return Object.values(SUBSCRIPTION_PLAN).includes(plan);
}

function pricingSummary() {
  return {
    monthlyPriceUsd: MONTHLY_PRICE_USD,
    quarterlyPriceUsd: QUARTERLY_PRICE_USD,
    annualPriceUsd: ANNUAL_PRICE_USD,
    quarterlyDiscountPercent: QUARTERLY_DISCOUNT_RATE * 100,
    annualDiscountPercent: ANNUAL_DISCOUNT_RATE * 100,
    monthlyAmountCents: MONTHLY_AMOUNT_CENTS,
    quarterlyAmountCents: QUARTERLY_AMOUNT_CENTS,
    annualAmountCents: ANNUAL_AMOUNT_CENTS,
    quarterlySavingsUsd:
      Math.round((MONTHLY_PRICE_USD * 3 - QUARTERLY_PRICE_USD) * 100) / 100,
    annualSavingsUsd: Math.round((MONTHLY_PRICE_USD * 12 - ANNUAL_PRICE_USD) * 100) / 100,
  };
}

module.exports = {
  MONTHLY_PRICE_USD,
  QUARTERLY_PRICE_USD,
  ANNUAL_PRICE_USD,
  QUARTERLY_DISCOUNT_RATE,
  ANNUAL_DISCOUNT_RATE,
  MONTHLY_AMOUNT_CENTS,
  QUARTERLY_AMOUNT_CENTS,
  ANNUAL_AMOUNT_CENTS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PLAN,
  PAYMENT_METHOD,
  isSubscriptionActive,
  isValidSubscriptionPlan,
  pricingSummary,
};
