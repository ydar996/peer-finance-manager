/** Peer Finance Manager SaaS pricing (USD). */
const MONTHLY_PRICE_USD = 29.99;
const QUARTERLY_DISCOUNT_RATE = 0.01;
const ANNUAL_DISCOUNT_RATE = 0.04;
const QUARTERLY_PRICE_USD =
  Math.round(MONTHLY_PRICE_USD * 3 * (1 - QUARTERLY_DISCOUNT_RATE) * 100) / 100;
const ANNUAL_PRICE_USD =
  Math.round(MONTHLY_PRICE_USD * 12 * (1 - ANNUAL_DISCOUNT_RATE) * 100) / 100;

const MONTHLY_AMOUNT_CENTS = Math.round(MONTHLY_PRICE_USD * 100);
const QUARTERLY_AMOUNT_CENTS = Math.round(QUARTERLY_PRICE_USD * 100);
const ANNUAL_AMOUNT_CENTS = Math.round(ANNUAL_PRICE_USD * 100);

/** Nigeria SaaS pricing (NGN), matching the /productngn brochure. */
const MONTHLY_PRICE_NGN = 40343;
const QUARTERLY_PRICE_NGN = 119818;
const ANNUAL_PRICE_NGN = 464744;

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
  BANK_TRANSFER: "bank_transfer",
  LEGACY: "legacy",
};

/** Which payment rail a country uses: stripe | bank_transfer. */
function paymentRailForCountry(countryCode) {
  return String(countryCode || "US").toUpperCase() === "NG"
    ? "bank_transfer"
    : "stripe";
}

function isSubscriptionActive(status) {
  return status === SUBSCRIPTION_STATUS.ACTIVE;
}

function isValidSubscriptionPlan(plan) {
  return Object.values(SUBSCRIPTION_PLAN).includes(plan);
}

/**
 * Pricing for a country's Cooperative. Both branches expose the same generic
 * keys (currency, currencySymbol, monthlyPrice, quarterlyPrice, annualPrice,
 * savings, paymentRail); the USD branch also keeps the *Usd keys for existing
 * platform-admin consumers.
 */
function pricingSummary(countryCode) {
  if (paymentRailForCountry(countryCode) === "bank_transfer") {
    return {
      currency: "NGN",
      currencySymbol: "₦",
      monthlyPrice: MONTHLY_PRICE_NGN,
      quarterlyPrice: QUARTERLY_PRICE_NGN,
      annualPrice: ANNUAL_PRICE_NGN,
      quarterlyDiscountPercent: QUARTERLY_DISCOUNT_RATE * 100,
      annualDiscountPercent: ANNUAL_DISCOUNT_RATE * 100,
      quarterlySavings: MONTHLY_PRICE_NGN * 3 - QUARTERLY_PRICE_NGN,
      annualSavings: MONTHLY_PRICE_NGN * 12 - ANNUAL_PRICE_NGN,
      paymentRail: "bank_transfer",
    };
  }
  return {
    currency: "USD",
    currencySymbol: "$",
    monthlyPrice: MONTHLY_PRICE_USD,
    quarterlyPrice: QUARTERLY_PRICE_USD,
    annualPrice: ANNUAL_PRICE_USD,
    monthlyPriceUsd: MONTHLY_PRICE_USD,
    quarterlyPriceUsd: QUARTERLY_PRICE_USD,
    annualPriceUsd: ANNUAL_PRICE_USD,
    quarterlyDiscountPercent: QUARTERLY_DISCOUNT_RATE * 100,
    annualDiscountPercent: ANNUAL_DISCOUNT_RATE * 100,
    monthlyAmountCents: MONTHLY_AMOUNT_CENTS,
    quarterlyAmountCents: QUARTERLY_AMOUNT_CENTS,
    annualAmountCents: ANNUAL_AMOUNT_CENTS,
    quarterlySavings:
      Math.round((MONTHLY_PRICE_USD * 3 - QUARTERLY_PRICE_USD) * 100) / 100,
    annualSavings:
      Math.round((MONTHLY_PRICE_USD * 12 - ANNUAL_PRICE_USD) * 100) / 100,
    quarterlySavingsUsd:
      Math.round((MONTHLY_PRICE_USD * 3 - QUARTERLY_PRICE_USD) * 100) / 100,
    annualSavingsUsd:
      Math.round((MONTHLY_PRICE_USD * 12 - ANNUAL_PRICE_USD) * 100) / 100,
    paymentRail: "stripe",
  };
}

module.exports = {
  MONTHLY_PRICE_USD,
  QUARTERLY_PRICE_USD,
  ANNUAL_PRICE_USD,
  MONTHLY_PRICE_NGN,
  QUARTERLY_PRICE_NGN,
  ANNUAL_PRICE_NGN,
  QUARTERLY_DISCOUNT_RATE,
  ANNUAL_DISCOUNT_RATE,
  MONTHLY_AMOUNT_CENTS,
  QUARTERLY_AMOUNT_CENTS,
  ANNUAL_AMOUNT_CENTS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PLAN,
  PAYMENT_METHOD,
  paymentRailForCountry,
  isSubscriptionActive,
  isValidSubscriptionPlan,
  pricingSummary,
};
