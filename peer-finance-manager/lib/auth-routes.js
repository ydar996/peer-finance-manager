const {
  login,
  logout,
  changePassword,
  listUsers,
  createUser,
  provisionAllMemberAccounts,
  listMemberCredentialsSummary,
  registerOrganizationWithAdmin,
  canAccessMember,
  ROLES,
  PORTALS,
} = require("./auth-service");
const { getOrganization } = require("./organization-service");
const { getMemberProfile } = require("./member-profile-service");
const {
  getMemberDepositAccountBalance,
  getMemberTransactions,
  attachDepositRunningBalances,
} = require("./balance-service");
const { TRANSACTION_TYPES } = require("./constants");
const {
  getMemberLoanLedgerSummary,
  hasBankLoanLedger,
} = require("./loan-ledger-service");
const path = require("path");
const { requireAuth, requireAdmin, requireMemberSelf, getToken } = require("./auth-middleware");
const { runWithOrg } = require("./org-context");
const {
  saveMemberPhotoUpload,
  updateMemberEmergencyContact,
  resolveMemberPhotoFile,
} = require("./member-self-service");

function requestOrgSlug(req) {
  return req.user?.organizationSlug || req.organization?.slug || null;
}

function registerAuthRoutes(app, deps = {}) {
  const upload = deps.upload;
  app.get("/api/organizations/lookup", (req, res) => {
    try {
      const organization = getOrganization(req.query.slug || "");
      if (!organization) return res.status(404).json({ error: "Organization not found" });
      res.json({ organization });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/auth/register-organization", (req, res) => {
    try {
      const { name, slug, adminEmail, adminPassword, adminDisplayName } = req.body || {};
      const result = registerOrganizationWithAdmin({
        name,
        slug,
        adminEmail,
        adminPassword,
        adminDisplayName,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, username, identifier, password, portal, organizationSlug } = req.body || {};
      const loginId = identifier || username || email;
      const result = login(
        loginId,
        password,
        portal || PORTALS.MEMBER,
        organizationSlug
      );
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    logout(getToken(req));
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/auth/change-password", requireAuth, (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      const user = changePassword(req.user.id, currentPassword, newPassword);
      res.json({ success: true, user });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/users", requireAuth, requireAdmin, (req, res) => {
    res.json({ users: listUsers() });
  });

  app.post("/api/users", requireAuth, requireAdmin, (req, res) => {
    try {
      const user = createUser(req.body || {});
      res.json({ success: true, user });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/users/provision-members", requireAuth, requireAdmin, (req, res) => {
    try {
      const result = provisionAllMemberAccounts({
        forceReset: Boolean(req.body?.forceReset),
      });
      res.json({
        success: true,
        created: result.created,
        skipped: result.skipped,
        exportPath: result.exportPath,
        exportFileName: path.basename(result.exportPath),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/users/member-credentials", requireAuth, requireAdmin, (req, res) => {
    res.json({ accounts: listMemberCredentialsSummary() });
  });

  app.get("/api/users/member-credentials-export", requireAuth, requireAdmin, (req, res) => {
    try {
      const fs = require("fs");
      const { getDataDir } = require("./paths");
      const exportDir = path.join(getDataDir(), "exports");
      if (!fs.existsSync(exportDir)) {
        return res.status(404).json({ error: "No credentials file found. Generate member credentials first." });
      }
      const files = fs
        .readdirSync(exportDir)
        .filter((f) => f.startsWith("member-credentials-") && f.endsWith(".csv"))
        .sort()
        .reverse();
      if (!files.length) {
        return res.status(404).json({ error: "No credentials file found. Generate member credentials first." });
      }
      const filePath = path.join(exportDir, files[0]);
      res.download(filePath, files[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/members/:id/photo", requireAuth, requireMemberSelf("id"), (req, res) => {
    try {
      const memberId = Number(req.params.id);
      const filePath = resolveMemberPhotoFile(memberId);
      if (!filePath) return res.status(404).end();
      res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/me/profile", requireAuth, (req, res) => {
    try {
      const user = req.user;
      if (user.role !== ROLES.MEMBER || !user.memberId) {
        return res.status(403).json({ error: "Member account required" });
      }
      const result = updateMemberEmergencyContact(user.memberId, req.body || {});
      const profile = getMemberProfile(user.memberId);
      res.json({ success: true, ...result, profile });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  if (upload) {
    function handleMemberPhotoUpload(req, res, memberId) {
      const slug = requestOrgSlug(req);
      if (!slug) {
        return res.status(400).json({ error: "No organization selected" });
      }
      runWithOrg(slug, () => {
        try {
          const result = saveMemberPhotoUpload(memberId, req.file);
          const profile = getMemberProfile(memberId);
          res.json({ success: true, ...result, profile });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      });
    }

    app.post(
      "/api/me/profile/photo",
      requireAuth,
      upload.single("photo"),
      (req, res) => {
        const user = req.user;
        if (user.role !== ROLES.MEMBER || !user.memberId) {
          return res.status(403).json({ error: "Member account required" });
        }
        handleMemberPhotoUpload(req, res, user.memberId);
      }
    );

    app.post(
      "/api/members/:id/photo",
      requireAuth,
      requireAdmin,
      upload.single("photo"),
      (req, res) => {
        const memberId = Number(req.params.id);
        if (!memberId) {
          return res.status(400).json({ error: "Invalid member id" });
        }
        handleMemberPhotoUpload(req, res, memberId);
      }
    );
  }

  app.get("/api/me/account", requireAuth, (req, res) => {
    try {
      const user = req.user;
      if (user.role !== ROLES.MEMBER || !user.memberId) {
        return res.status(403).json({ error: "Member account required" });
      }
      const profile = getMemberProfile(user.memberId);
      const depositBalance = getMemberDepositAccountBalance(user.memberId);
      const depositTypes = [
        TRANSACTION_TYPES.DEPOSIT,
        TRANSACTION_TYPES.WITHDRAWAL,
        TRANSACTION_TYPES.DISTRIBUTION,
        TRANSACTION_TYPES.MEMBERSHIP_FEE,
      ];
      const depositTransactions = attachDepositRunningBalances(
        user.memberId,
        getMemberTransactions(user.memberId, 500).filter((tx) => depositTypes.includes(tx.type))
      ).map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        transaction_date: tx.transaction_date,
        description: tx.description,
        balance_after: tx.balance_after,
      }));
      const {
        listMemberDepositStatementMonths,
      } = require("./member-deposit-statement");
      let loanSummary = null;
      if (hasBankLoanLedger()) {
        loanSummary = getMemberLoanLedgerSummary(user.memberId);
      }
      res.json({
        user,
        profile,
        depositBalance,
        depositTransactions,
        statementMonths: listMemberDepositStatementMonths(user.memberId),
        loanSummary,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/me/cooperative-status-reports", requireAuth, (req, res) => {
    try {
      const user = req.user;
      if (user.role !== ROLES.MEMBER) {
        return res.status(403).json({ error: "Member account required" });
      }
      const { listCooperativeStatusReports } = require("./monthly-status-report-service");
      res.json({ reports: listCooperativeStatusReports({ publishedOnly: true }) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/me/cooperative-status-reports/:periodSlug/file", requireAuth, (req, res) => {
    try {
      const user = req.user;
      if (user.role !== ROLES.MEMBER) {
        return res.status(403).json({ error: "Member account required" });
      }
      const { getReportDownloadPath } = require("./monthly-status-report-service");
      const file = getReportDownloadPath(req.params.periodSlug, { requirePublished: true });
      res.download(file.filePath, file.fileName);
    } catch (err) {
      res.status(err.message.includes("not found") || err.message.includes("published") ? 404 : 500).json({
        error: err.message,
      });
    }
  });

  app.get("/api/me/operational-expenses-summary", requireAuth, (req, res) => {
    try {
      const user = req.user;
      if (user.role !== ROLES.MEMBER) {
        return res.status(403).json({ error: "Member account required" });
      }
      const { listCooperativeStatusReports } = require("./monthly-status-report-service");
      const published = listCooperativeStatusReports({ publishedOnly: true });
      if (!published.length) {
        return res.json({ summary: null });
      }
      const { getOperationalExpensesSummary } = require("./expense-report-label-service");
      res.json({ summary: getOperationalExpensesSummary() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/me/deposit-statement", requireAuth, async (req, res) => {
    try {
      const user = req.user;
      if (user.role !== ROLES.MEMBER || !user.memberId) {
        return res.status(403).json({ error: "Member account required" });
      }
      const year = Number(req.query.year);
      const month = Number(req.query.month);
      if (!year || !month) {
        return res.status(400).json({ error: "Select a statement month to download" });
      }
      const { generateMemberDepositStatementPdf } = require("./member-deposit-statement");
      const result = await generateMemberDepositStatementPdf(user.memberId, { year, month });
      res.download(result.outputPath, result.fileName);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/members/:id/deposit-statement", requireAuth, async (req, res) => {
    try {
      const memberId = Number(req.params.id);
      if (!canAccessMember(req.user, memberId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const year = Number(req.query.year);
      const month = Number(req.query.month);
      const { generateMemberDepositStatementPdf } = require("./member-deposit-statement");
      const result = await generateMemberDepositStatementPdf(memberId, {
        year: year || undefined,
        month: month || undefined,
      });
      res.download(result.outputPath, result.fileName);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerAuthRoutes };
