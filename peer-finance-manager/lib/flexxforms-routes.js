const {
  getFlexxFormsAdminView,
  getFlexxFormsPublicConfig,
  retryProvision,
  listIntegrationForms,
  listIntegrationDocumentTemplates,
  saveFormDocumentIds,
  getLoanDocuments,
  createLoanAgreementDocument,
  listPendingApplications,
  isProvisioningConfigured,
  approveMembershipApplication,
} = require("./flexxforms-service");
const { requireAuth, requireAdmin } = require("./auth-middleware");

function requestOrgSlug(req) {
  return req.user?.organizationSlug || req.organization?.slug || null;
}

function registerFlexxFormsRoutes(app) {
  // Webhook is registered in server.js with express.raw (before express.json).

  app.get("/api/public/organizations/:slug/flexxforms", (req, res) => {
    try {
      const config = getFlexxFormsPublicConfig(req.params.slug);
      if (!config) return res.status(404).json({ error: "Organization not found" });
      res.json(config);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/flexxforms/settings", requireAuth, requireAdmin, (req, res) => {
    try {
      const slug = requestOrgSlug(req);
      const settings = getFlexxFormsAdminView(slug, {
        consumeTempPassword: true,
        sessionUser: req.user,
      });
      res.json({ settings, provisioningConfigured: isProvisioningConfigured() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/flexxforms/settings", requireAuth, requireAdmin, (req, res) => {
    try {
      const slug = requestOrgSlug(req);
      const settings = saveFormDocumentIds(slug, req.body || {});
      res.json({ success: true, settings });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/flexxforms/retry-provision", requireAuth, requireAdmin, async (req, res) => {
    try {
      const slug = requestOrgSlug(req);
      const settings = await retryProvision(slug, req.user);
      res.json({
        ok: true,
        success: true,
        settings: getFlexxFormsAdminView(slug, { sessionUser: req.user }),
      });
    } catch (err) {
      console.error("FlexxForms retry provision failed:", err.message);
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/flexxforms/forms", requireAuth, requireAdmin, async (req, res) => {
    try {
      const slug = requestOrgSlug(req);
      const forms = await listIntegrationForms(slug);
      let templates = [];
      try {
        templates = await listIntegrationDocumentTemplates(slug);
      } catch (templateErr) {
        console.warn("FlexxForms document templates list failed:", templateErr.message);
      }
      res.json({ forms, templates });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/flexxforms/applications", requireAuth, requireAdmin, (req, res) => {
    try {
      const slug = requestOrgSlug(req);
      res.json({ applications: listPendingApplications(slug) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post(
    "/api/flexxforms/applications/:id/approve",
    requireAuth,
    requireAdmin,
    (req, res) => {
      try {
        const slug = requestOrgSlug(req);
        const result = approveMembershipApplication(slug, req.params.id, req.user?.id);
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/flexxforms/applications/:id/reprocess",
    requireAuth,
    requireAdmin,
    (req, res) => {
      try {
        const slug = requestOrgSlug(req);
        const { reprocessMembershipApplication: reprocess } = require("./flexxforms-membership-service");
        const { runWithOrg } = require("./org-context");
        const result = runWithOrg(slug, () => reprocess(Number(req.params.id)));
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.delete(
    "/api/flexxforms/applications/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {
      try {
        const slug = requestOrgSlug(req);
        const { deleteMembershipApplication } = require("./flexxforms-membership-service");
        const { runWithOrg } = require("./org-context");
        const result = runWithOrg(slug, () => deleteMembershipApplication(Number(req.params.id)));
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.get("/api/flexxforms/config", requireAuth, (req, res) => {
    try {
      const slug = requestOrgSlug(req);
      const config = getFlexxFormsPublicConfig(slug);
      res.json({ config });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/loans/:id/flexxforms-documents", requireAuth, (req, res) => {
    try {
      const docs = getLoanDocuments(req.params.id);
      if (!docs) return res.status(404).json({ error: "Loan not found" });
      res.json({ documents: docs });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post(
    "/api/loans/:id/flexxforms-documents",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const slug = requestOrgSlug(req);
        const purpose = req.body?.purpose;
        const documents = await createLoanAgreementDocument(slug, req.params.id, purpose);
        res.json({ success: true, documents });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );
}

module.exports = { registerFlexxFormsRoutes };
