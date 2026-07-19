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
  summarizePendingApplications,
  isProvisioningConfigured,
  approveMembershipApplication,
} = require("./flexxforms-service");
const { requireAuth, requireAdmin, requireActiveMemberAccount } = require("./auth-middleware");

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

  app.get("/api/flexxforms/applications/summary", requireAuth, requireAdmin, (req, res) => {
    try {
      const slug = requestOrgSlug(req);
      res.json(summarizePendingApplications(slug));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/flexxforms/loan-applications", requireAuth, requireAdmin, (req, res) => {
    try {
      const { listLoanApplications } = require("./flexxforms-loan-service");
      res.json({ applications: listLoanApplications() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/flexxforms/loan-applications/:id", requireAuth, requireAdmin, (req, res) => {
    try {
      const { getLoanApplicationDetail } = require("./flexxforms-loan-service");
      res.json({ application: getLoanApplicationDetail(Number(req.params.id)) });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  app.post(
    "/api/flexxforms/loan-applications/:id/link-member",
    requireAuth,
    requireAdmin,
    (req, res) => {
      try {
        const { linkLoanApplicationMember } = require("./flexxforms-loan-service");
        const application = linkLoanApplicationMember(
          Number(req.params.id),
          Number(req.body?.memberId)
        );
        res.json({ success: true, application });
      } catch (err) {
        res.status(err.status || 400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/flexxforms/loan-applications/:id/approve",
    requireAuth,
    requireAdmin,
    (req, res) => {
      try {
        const { approveLoanApplication } = require("./flexxforms-loan-service");
        const result = approveLoanApplication(Number(req.params.id), req.user?.id, req.body || {});
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(err.status || 400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/flexxforms/loan-applications/:id/reject",
    requireAuth,
    requireAdmin,
    (req, res) => {
      try {
        const { rejectLoanApplication } = require("./flexxforms-loan-service");
        const application = rejectLoanApplication(
          Number(req.params.id),
          req.body?.reason || null
        );
        res.json({ success: true, application });
      } catch (err) {
        res.status(err.status || 400).json({ error: err.message });
      }
    }
  );

  app.delete(
    "/api/flexxforms/loan-applications/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {
      try {
        const { deleteLoanApplication } = require("./flexxforms-loan-service");
        const result = deleteLoanApplication(Number(req.params.id));
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(err.status || 400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/me/loan-applications/claim",
    requireAuth,
    requireActiveMemberAccount,
    (req, res) => {
      try {
        const { claimLoanApplicationForMember } = require("./flexxforms-loan-service");
        const application = claimLoanApplicationForMember(req.user, {
          submissionId: req.body?.submissionId,
          applicationId: req.body?.applicationId,
        });
        res.json({ success: true, application });
      } catch (err) {
        res.status(err.status || 400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/flexxforms/applications/:id/approve",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const slug = requestOrgSlug(req);
        const result = await approveMembershipApplication(slug, req.params.id, req.user?.id);
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
    async (req, res) => {
      try {
        const slug = requestOrgSlug(req);
        const { reprocessMembershipApplicationWithFetch } = require("./flexxforms-service");
        const result = await reprocessMembershipApplicationWithFetch(slug, Number(req.params.id));
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
