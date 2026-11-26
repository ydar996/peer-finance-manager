const { getToken } = require("./auth-middleware");
const { recordSecurityEvent, clientIp } = require("./security-events");
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
  getNgBankTransferDetails,
  setNgBankTransferDetails,
} = require("./platform-billing-service");
const {
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
  PAYMENT_METHOD,
} = require("./platform-billing-constants");

function getPlatformToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  if (req.headers["x-platform-token"]) return req.headers["x-platform-token"];
  const { parseCookies, PLATFORM_COOKIE } = require("./session-cookie");
  return parseCookies(req)[PLATFORM_COOKIE] || null;
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
      recordSecurityEvent({
        eventType: "platform.login",
        actorLabel: email ? String(email).trim().toLowerCase() : null,
        ip: clientIp(req),
      });
      const { setAuthCookie, PLATFORM_COOKIE } = require("./session-cookie");
      setAuthCookie(res, req, result.token, PLATFORM_COOKIE);
      res.json(result);
    } catch (err) {
      recordSecurityEvent({
        eventType: "platform.login_failed",
        severity: "warning",
        actorLabel: email ? String(email).trim().toLowerCase() : null,
        ip: clientIp(req),
        detail: String(err.message || "").slice(0, 120),
      });
      res.status(401).json({ error: err.message });
    }
  });

  app.post("/api/platform/auth/logout", attachPlatformUser, (req, res) => {
    platformLogout(req.platformToken);
    recordSecurityEvent({
      eventType: "platform.logout",
      actorLabel: req.platformUser?.email || null,
      ip: clientIp(req),
    });
    const { clearAuthCookie, PLATFORM_COOKIE } = require("./session-cookie");
    clearAuthCookie(res, req, PLATFORM_COOKIE);
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
        const { getOrganizationFlexxForms } = require("./flexxforms-service");
        const ff = getOrganizationFlexxForms(org.slug) || {};
        return {
          ...org,
          memberCount,
          adminEmail,
          flexxformsProvisioned: Boolean(ff.tenantId && ff.apiKey),
          webhookSecured: Boolean(ff.webhookSecret),
        };
      });
      res.json({
        organizations: orgs,
        pricing: pricingSummary(),
        stripeConfigured: isStripeConfigured(),
        ngBankTransferDetails: getNgBankTransferDetails(),
      });
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
    "/api/platform/ng-bank-transfer-details",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const details = setNgBankTransferDetails(req.body?.details);
        res.json({ success: true, ngBankTransferDetails: details });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.delete(
    "/api/platform/organizations/:slug",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const slug = String(req.params.slug || "").trim().toLowerCase();
        const confirmSlug = String(req.body?.confirmSlug || "").trim().toLowerCase();
        if (!slug) {
          return res.status(400).json({ error: "Organization code is required" });
        }
        if (confirmSlug !== slug) {
          return res
            .status(400)
            .json({ error: "Type the organization code exactly to confirm deletion." });
        }
        const { closeDb } = require("../db/database");
        const { deleteOrganization } = require("./organization-service");
        closeDb(slug);
        const deleted = deleteOrganization(slug);
        recordSecurityEvent({
          organizationSlug: slug,
          eventType: "org.deleted",
          severity: "critical",
          actorLabel: req.platformUser?.email || null,
          ip: clientIp(req),
          detail: `deleted=${deleted}`,
        });
        res.json({ success: true, deleted });
      } catch (err) {
        res.status(400).json({ error: err.message });
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
        recordSecurityEvent({
          organizationSlug: req.params.slug,
          eventType: "billing.check_payment_recorded",
          actorLabel: req.platformUser?.email || null,
          ip: clientIp(req),
          detail: `plan=${plan || ""}`,
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

  app.get(
    "/api/platform/organizations/:slug/flexxforms",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const { getOrganization } = require("./organization-service");
        const org = getOrganization(req.params.slug);
        if (!org) return res.status(404).json({ error: "Organization not found" });
        const {
          getFlexxFormsAdminView,
          isProvisioningConfigured,
        } = require("./flexxforms-service");
        const view = getFlexxFormsAdminView(org.slug, { consumeTempPassword: false });
        if (view) delete view.tempPassword;
        res.json({ settings: view, provisioningConfigured: isProvisioningConfigured() });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/platform/organizations/:slug/flexxforms/retry",
    attachPlatformUser,
    requirePlatformAuth,
    async (req, res) => {
      try {
        const { getOrganization } = require("./organization-service");
        const org = getOrganization(req.params.slug);
        if (!org) return res.status(404).json({ error: "Organization not found" });
        const { provisionOrganization, getFlexxFormsAdminView } = require("./flexxforms-service");
        const settings = await provisionOrganization(org.slug, {
          email: org.adminEmail || org.admin_email || null,
          organizationName: org.name,
        });
        if (settings) delete settings.tempPassword;
        res.json({ success: true, settings });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/platform/organizations/:slug/resend-welcome-email",
    attachPlatformUser,
    requirePlatformAuth,
    async (req, res) => {
      try {
        const { getOrganization } = require("./organization-service");
        const org = getOrganization(req.params.slug);
        if (!org) return res.status(404).json({ error: "Organization not found" });
        const adminUser = runWithOrg(org.slug, () =>
          getDb()
            .prepare(
              `SELECT email, display_name FROM users
               WHERE role = 'admin' AND active = 1
               ORDER BY id LIMIT 1`
            )
            .get()
        );
        const to = adminUser?.email || org.adminEmail || null;
        if (!to) {
          return res.status(400).json({ error: "No administrator email on file for this organization" });
        }
        const { sendOrganizationAdminWelcomeEmail } = require("./organization-welcome-email");
        const result = await sendOrganizationAdminWelcomeEmail({
          slug: org.slug,
          organizationName: org.name,
          countryCode: org.countryCode,
          adminEmail: to,
          adminDisplayName: adminUser?.display_name || adminUser?.displayName || null,
          dedupeKey: `organization-admin-welcome:${org.slug}:resend:${Date.now()}`,
        });
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/platform/organizations/:slug/member-directory",
    attachPlatformUser,
    requirePlatformAuth,
    (req, res) => {
      try {
        const { getOrganization } = require("./organization-service");
        const org = getOrganization(req.params.slug);
        if (!org) return res.status(404).json({ error: "Organization not found" });
        const result = runWithOrg(org.slug, () => {
          const {
            ensureMembershipStatusColumns,
            isActiveDirectoryStatus,
            isCessationStatus,
            formatAccountStatusLabel,
            normalizeAccountStatus,
          } = require("./membership-status-service");
          const db = getDb();
          ensureMembershipStatusColumns(db);
          const rows = db
            .prepare(
              `SELECT m.id AS memberId, m.name, m.member_number AS memberNumber,
                      mp.id AS profileId, mp.display_name AS displayName,
                      mp.cooperative_account_status AS accountStatus
               FROM members m
               LEFT JOIN member_profiles mp ON mp.member_id = m.id
               ORDER BY m.name`
            )
            .all();
          const members = rows.map((row) => {
            const status = normalizeAccountStatus(row.accountStatus) || "active";
            return {
              memberId: row.memberId,
              name: row.displayName || row.name,
              memberNumber: row.memberNumber || null,
              hasProfile: Boolean(row.profileId),
              accountStatus: status,
              statusLabel: formatAccountStatusLabel(status),
              activeDirectory: isActiveDirectoryStatus(status),
              former: isCessationStatus(status),
            };
          });
          return {
            members,
            counts: {
              total: members.length,
              active: members.filter((m) => m.activeDirectory).length,
              withProfile: members.filter((m) => m.activeDirectory && m.hasProfile).length,
              missingProfile: members.filter((m) => m.activeDirectory && !m.hasProfile)
                .length,
              former: members.filter((m) => m.former).length,
            },
          };
        });
        res.json(result);
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
        plan: req.body?.plan,
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
