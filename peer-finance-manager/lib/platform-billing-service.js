const { getOrganization, updateOrganizationBilling } = require("./organization-service");
const { getOrgSlug } = require("./org-context");
const { nowUtcIso } = require("./cooperative-time");
const {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PLAN,
  PAYMENT_METHOD,
  isSubscriptionActive,
  pricingSummary,
  MONTHLY_AMOUNT_CENTS,
  QUARTERLY_AMOUNT_CENTS,
  ANNUAL_AMOUNT_CENTS,
  isValidSubscriptionPlan,
} = require("./platform-billing-constants");

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    // eslint-disable-next-line global-require
    return require("stripe")(key);
  } catch {
    return null;
  }
}

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function appBaseUrl() {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.MEMBER_PORTAL_URL) {
    return process.env.MEMBER_PORTAL_URL.replace(/\/member\/?$/, "");
  }
  const origins = process.env.ALLOWED_ORIGINS;
  if (origins) {
    const first = origins.split(",")[0].trim();
    if (first) return first.replace(/\/$/, "");
  }
  return "https://peer-finance-manager.netlify.app";
}

function periodEndFromPlan(plan, fromDate = new Date()) {
  const end = new Date(fromDate);
  if (plan === SUBSCRIPTION_PLAN.ANNUAL) {
    end.setFullYear(end.getFullYear() + 1);
  } else if (plan === SUBSCRIPTION_PLAN.QUARTERLY) {
    end.setMonth(end.getMonth() + 3);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end.toISOString();
}

function planCheckoutDetails(plan) {
  switch (plan) {
    case SUBSCRIPTION_PLAN.MONTHLY:
      return {
        amount: MONTHLY_AMOUNT_CENTS,
        label: "Monthly",
        recurring: { interval: "month" },
      };
    case SUBSCRIPTION_PLAN.QUARTERLY:
      return {
        amount: QUARTERLY_AMOUNT_CENTS,
        label: "Quarterly (5% discount)",
        recurring: { interval: "month", interval_count: 3 },
      };
    case SUBSCRIPTION_PLAN.ANNUAL:
      return {
        amount: ANNUAL_AMOUNT_CENTS,
        label: "Annual (9% discount)",
        recurring: { interval: "year" },
      };
    default:
      return null;
  }
}

function getTenantSubscription(orgSlug) {
  const org = getOrganization(orgSlug || getOrgSlug());
  if (!org) throw new Error("Organization not found");
  return {
    organizationSlug: org.slug,
    organizationName: org.name,
    subscriptionStatus: org.subscriptionStatus,
    subscriptionPlan: org.subscriptionPlan,
    paymentMethod: org.paymentMethod,
    billingEmail: org.billingEmail,
    subscriptionCurrentPeriodEnd: org.subscriptionCurrentPeriodEnd,
    checkPaymentReference: org.checkPaymentReference,
    subscriptionNotes: org.subscriptionNotes,
    active: isSubscriptionActive(org.subscriptionStatus),
    pricing: pricingSummary(),
    stripeConfigured: isStripeConfigured(),
    checkPayableTo: process.env.PLATFORM_CHECK_PAYABLE_TO || "Peer Finance Manager",
    checkMailingAddress:
      process.env.PLATFORM_CHECK_MAILING_ADDRESS ||
      "Contact platform administrator for mailing instructions.",
  };
}

async function createStripeCheckoutSession(orgSlug, plan, billingEmail) {
  const stripe = stripeClient();
  if (!stripe) {
    throw new Error(
      "Stripe is not configured on the server. See STRIPE-SETUP.md and set STRIPE_SECRET_KEY."
    );
  }
  if (!isValidSubscriptionPlan(plan)) {
    throw new Error("Plan must be monthly, quarterly, or annual");
  }
  const org = getOrganization(orgSlug);
  if (!org) throw new Error("Organization not found");

  const checkout = planCheckoutDetails(plan);
  const { amount, label, recurring } = checkout;

  const sessionParams = {
    mode: "subscription",
    client_reference_id: org.slug,
    metadata: {
      organization_slug: org.slug,
      plan,
    },
    subscription_data: {
      metadata: {
        organization_slug: org.slug,
        plan,
      },
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: `Peer Finance Manager — ${label}`,
            description: `Cooperative tenant: ${org.name}`,
          },
          recurring,
        },
        quantity: 1,
      },
    ],
    success_url: `${appBaseUrl()}/admin?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBaseUrl()}/admin?billing=canceled`,
  };

  if (billingEmail) sessionParams.customer_email = billingEmail;
  if (org.stripeCustomerId) sessionParams.customer = org.stripeCustomerId;

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { url: session.url, sessionId: session.id };
}

async function createStripeBillingPortalSession(orgSlug) {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe is not configured");
  const org = getOrganization(orgSlug);
  if (!org?.stripeCustomerId) {
    throw new Error("No Stripe customer on file for this cooperative");
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appBaseUrl()}/admin`,
  });
  return { url: session.url };
}

function requestCheckPayment(orgSlug, { reference, notes, billingEmail } = {}) {
  return updateOrganizationBilling(orgSlug, {
    subscriptionStatus: SUBSCRIPTION_STATUS.CHECK_PENDING,
    checkPaymentReference: reference || `check-request:${nowUtcIso()}`,
    subscriptionNotes: notes || null,
    billingEmail: billingEmail || null,
  });
}

function recordCheckPayment(orgSlug, { plan, checkNumber, notes, billingEmail } = {}) {
  if (!isValidSubscriptionPlan(plan)) {
    throw new Error("Plan must be monthly, quarterly, or annual");
  }
  const ref = checkNumber ? `Check #${checkNumber}` : `Check ${nowUtcIso().slice(0, 10)}`;
  return updateOrganizationBilling(orgSlug, {
    subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
    subscriptionPlan: plan,
    paymentMethod: PAYMENT_METHOD.CHECK,
    checkPaymentReference: ref,
    subscriptionNotes: notes || null,
    billingEmail: billingEmail || null,
    subscriptionCurrentPeriodEnd: periodEndFromPlan(plan),
    stripeSubscriptionId: null,
  });
}

function activateStripeSubscription(orgSlug, {
  plan,
  stripeCustomerId,
  stripeSubscriptionId,
  currentPeriodEnd,
  billingEmail,
}) {
  return updateOrganizationBilling(orgSlug, {
    subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
    subscriptionPlan: plan,
    paymentMethod: PAYMENT_METHOD.STRIPE,
    stripeCustomerId: stripeCustomerId || null,
    stripeSubscriptionId: stripeSubscriptionId || null,
    subscriptionCurrentPeriodEnd: currentPeriodEnd || periodEndFromPlan(plan),
    billingEmail: billingEmail || null,
    checkPaymentReference: null,
  });
}

function markSubscriptionPastDue(orgSlug) {
  return updateOrganizationBilling(orgSlug, {
    subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE,
  });
}

function cancelSubscription(orgSlug, notes) {
  return updateOrganizationBilling(orgSlug, {
    subscriptionStatus: SUBSCRIPTION_STATUS.CANCELED,
    stripeSubscriptionId: null,
    subscriptionNotes: notes || null,
  });
}

function grantLegacySubscription(orgSlug, { plan, notes, billingEmail } = {}) {
  const selectedPlan = plan || SUBSCRIPTION_PLAN.MONTHLY;
  if (!isValidSubscriptionPlan(selectedPlan)) {
    throw new Error("Plan must be monthly, quarterly, or annual");
  }
  return updateOrganizationBilling(orgSlug, {
    subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
    subscriptionPlan: selectedPlan,
    paymentMethod: PAYMENT_METHOD.LEGACY,
    subscriptionCurrentPeriodEnd: periodEndFromPlan(selectedPlan),
    subscriptionNotes: notes || "Granted by platform administrator",
    billingEmail: billingEmail || null,
    checkPaymentReference: null,
    stripeSubscriptionId: null,
  });
}

async function handleStripeWebhook(rawBody, signatureHeader) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    throw new Error("Stripe webhook is not configured");
  }

  const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const slug = session.metadata?.organization_slug || session.client_reference_id;
      const plan = session.metadata?.plan || SUBSCRIPTION_PLAN.MONTHLY;
      if (slug) {
        activateStripeSubscription(slug, {
          plan,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          billingEmail: session.customer_details?.email || session.customer_email,
        });
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const slug = sub.metadata?.organization_slug;
      if (!slug) break;
      const plan = sub.metadata?.plan || SUBSCRIPTION_PLAN.MONTHLY;
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : periodEndFromPlan(plan);
      if (sub.status === "active" || sub.status === "trialing") {
        activateStripeSubscription(slug, {
          plan,
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          currentPeriodEnd: periodEnd,
        });
      } else if (sub.status === "past_due" || sub.status === "unpaid") {
        markSubscriptionPastDue(slug);
      } else if (sub.status === "canceled") {
        cancelSubscription(slug, "Stripe subscription canceled");
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const slug = sub.metadata?.organization_slug;
      if (slug) cancelSubscription(slug, "Stripe subscription ended");
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const slug = invoice.subscription_details?.metadata?.organization_slug;
      if (slug) markSubscriptionPastDue(slug);
      break;
    }
    default:
      break;
  }

  return { received: true, type: event.type };
}

module.exports = {
  pricingSummary,
  isStripeConfigured,
  getTenantSubscription,
  createStripeCheckoutSession,
  createStripeBillingPortalSession,
  requestCheckPayment,
  recordCheckPayment,
  activateStripeSubscription,
  markSubscriptionPastDue,
  cancelSubscription,
  grantLegacySubscription,
  handleStripeWebhook,
  isSubscriptionActive,
};
