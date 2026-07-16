const { getToken } = require("./auth-middleware");
const {
  platformLogin,
  platformLogout,
  getPlatformSession,
} = require("./platform-auth-service");
const { listOrganizations } = require("./organization-service");
const { runWithOrg } = require("./org-context");
const { getDb } = require("../db/database");
const {
  getTenantSubscription,
  recordCheckPayment,
  cancelSubscription,
  grantLegacySubscription,
  isStripeConfigured,
  pricingSummary,
} = require("./platform-billing-service");
const {
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
  PAYMENT_METHOD,
} = require("./platform-billing-constants");

function getPlatformToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers["x-platform-token"] || null;
}

function attachPlatformUser(req, res, next) {
  const token = getPlatformToken(req);
  const session = getPlatformSession(token);
  req.platformToken = token;
  req.platformUser = session?.user || null;
  next();
}

function requirePlatformAuth(req, res, next) {
  if (req.platformUser) return next();
  res.status(401).json({ error: "Platform login required" });
}

function registerPlatformRoutes(app) {
  app.post("/api/platform/auth/login", (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = platformLogin(email, password);
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  });

  app.post("/api/platform/auth/logout", attachPlatformUser, (req, res) => {
    platformLogout(req.platformToken);
    res.json({ success: true });
  });

  app.get("/api/platform/auth/me", attachPlatformUser, requirePlatformAuth, (req, res) => {
    res.json({ user: req.platformUser, pricing: pricingSummary(), stripeConfigured: isStripeConfigured() });
  });

  app.get("/api/platform/organizations", attachPlatformUser, requirePlatformAuth, (req, res) => {
    try {
      const orgs = listOrganizations().map((org) => {
        let memberCount = 0;
        let adminEmail = null;
        try {
          runWithOrg(org.slug, () => {
            const db = getDb();
            const { ACTIVE_DIRECTORY_SQL, ensureMembershipStatusColumns } = require(
              "./membership-status-service"
            );
            ensureMembershipStatusColumns(db);
            memberCount = db
              .prepare(
                `SELECT COUNT(*) AS c
                 FROM members m
                 LEFT JOIN member_profiles mp ON mp.member_id = m.id
                 WHERE ${ACTIVE_DIRECTORY_SQL}`
              )
              .get().c;
            const admin = db
              .prepare(
                `SELECT email FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1`
              )
              .get();
            adminEmail = admin?.email || null;
          });
        } catch (_) {
          /* org db may not exist yet */
        }
        return { ...org, memberCount, adminEmail };
      });
      res.json({ organizations: orgs, pricing: pricingSummary(), stripeConfigured: isStripeConfigured() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get(
    "/api/platform/organizations/:slug",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const subscription = getTenantSubscription(req.params.slug);
        res.json({ subscription });
      } catch (err) {
        res.status(404).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/platform/organizations/:slug/check-payment",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const { plan, checkNumber, notes, billingEmail } = req.body || {};
        const org = recordCheckPayment(req.params.slug, {
          plan,
          checkNumber,
          notes,
          billingEmail,
        });
        res.json({ success: true, organization: org });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/platform/organizations/:slug/extend-grace",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const { days, until, notes } = req.body || {};
        const { extendSubscriptionGrace } = require("./platform-billing-service");
        const org = extendSubscriptionGrace(req.params.slug, { days, until, notes });
        res.json({ success: true, organization: org });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/platform/organizations/:slug/grant-legacy",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const { notes, plan, billingEmail } = req.body || {};
        const org = grantLegacySubscription(req.params.slug, {
          plan: plan || SUBSCRIPTION_PLAN.MONTHLY,
          notes,
          billingEmail,
        });
        res.json({ success: true, organization: org });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/platform/organizations/:slug/cancel-subscription",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const org = cancelSubscription(req.params.slug, req.body?.notes || "Canceled by platform admin");
        res.json({ success: true, organization: org });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/platform/organizations/:slug/set-status",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const { status, notes } = req.body || {};
        const allowed = Object.values(SUBSCRIPTION_STATUS);
        if (!allowed.includes(status)) {
          return res.status(400).json({ error: "Invalid subscription status" });
        }
        const { updateOrganizationBilling } = require("./organization-service");
        const org = updateOrganizationBilling(req.params.slug, {
          subscriptionStatus: status,
          subscriptionNotes: notes || null,
        });
        res.json({ success: true, organization: org });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );
}

function registerBillingRoutes(app, { requireAdmin, requireAuth, restoreOrgContext }) {
  app.get("/api/billing/subscription", requireAuth, requireAdmin, (req, res) => {
    try {
      res.json({ subscription: getTenantSubscription() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/billing/stripe/checkout", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { createStripeCheckoutSession } = require("./platform-billing-service");
      const plan = req.body?.plan;
      const billingEmail = req.body?.billingEmail || req.user?.email;
      const session = await createStripeCheckoutSession(
        req.user.organizationSlug,
        plan,
        billingEmail
      );
      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/billing/stripe/portal", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { createStripeBillingPortalSession } = require("./platform-billing-service");
      const session = await createStripeBillingPortalSession(req.user.organizationSlug);
      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/billing/check-request", requireAuth, requireAdmin, (req, res) => {
    try {
      const { requestCheckPayment } = require("./platform-billing-service");
      const org = requestCheckPayment(req.user.organizationSlug, {
        reference: req.body?.reference,
        notes: req.body?.notes,
        billingEmail: req.body?.billingEmail || req.user?.email,
      });
      res.json({ success: true, organization: org });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

function requireActiveSubscription(req, res, next) {
  if (req.platformUser) return next();
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const billingPaths = [
    "/billing/",
    "/auth/",
    "/platform/",
    "/admin/",
  ];
  if (billingPaths.some((p) => req.path.startsWith(p))) return next();
  try {
    const { getOrganization } = require("./organization-service");
    const { isSubscriptionAccessAllowed } = require("./platform-billing-service");
    const slug = req.user?.organizationSlug || req.organization?.slug;
    if (!slug) return next();
    const org = getOrganization(slug);
    if (org && isSubscriptionAccessAllowed(org)) return next();
    if (req.user?.role !== "admin") {
      return res.status(402).json({
        error: "Cooperative subscription inactive. Contact your administrator.",
        subscriptionStatus: org?.subscriptionStatus || "pending",
      });
    }
    return res.status(402).json({
      error: "Active subscription required. Open Cooperative Books → Platform Subscription to pay.",
      subscriptionStatus: org?.subscriptionStatus || "pending",
      subscriptionGraceUntil: org?.subscriptionGraceUntil || null,
    });
  } catch (_) {
    return next();
  }
}

module.exports = {
  registerPlatformRoutes,
  registerBillingRoutes,
  attachPlatformUser,
  requirePlatformAuth,
  requireActiveSubscription,
  getPlatformToken,
};
