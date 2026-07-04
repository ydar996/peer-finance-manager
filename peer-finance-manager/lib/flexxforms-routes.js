const {
  getFlexxFormsAdminView,
  getFlexxFormsPublicConfig,
  retryProvision,
  listIntegrationForms,
  saveFormDocumentIds,
  getLoanDocuments,
  createLoanAgreementDocument,
  listPendingApplications,
  isProvisioningConfigured,
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
      const settings = getFlexxFormsAdminView(slug, { consumeTempPassword: true });
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
      const settings = await retryProvision(slug);
      res.json({ success: true, settings });
    } catch (err) {
      console.error("FlexxForms retry provision failed:", err.message);
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/flexxforms/forms", requireAuth, requireAdmin, async (req, res) => {
    try {
      const slug = requestOrgSlug(req);
      const forms = await listIntegrationForms(slug);
      res.json({ forms });
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
