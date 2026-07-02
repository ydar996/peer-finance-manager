const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { getDb } = require("./db/database");
const { listMembersWithBalances, getMemberTransactions } = require("./lib/balance-service");
const {
  listMembersWithProfiles,
  getMemberProfile,
} = require("./lib/member-profile-service");
const {
  createMember,
  updateMemberProfile,
  recordMembershipFee,
} = require("./lib/member-service");
const { getCooperativeBooks, getBookDetail } = require("./lib/cooperative-books");
const {
  getCdBalanceSnapshot,
  updateCdBalance,
} = require("./lib/cd-balance-service");
const {
  getCheckingBalanceSnapshot,
  updateCheckingBalance,
} = require("./lib/checking-balance-service");
const { importWpformsProfiles } = require("./lib/import-wpforms-profiles");
const { importFromSpreadsheet } = require("./lib/import-spreadsheet");
const {
  listLoans,
  validateLoanApplication,
  maxLoanAmount,
  isEligibleForLoan,
} = require("./lib/loan-service");
const {
  recordMemberDepositEntry,
  recordExpense,
  listExpenses,
  getExpenseCategories,
  createManualLoan,
  recordManualLoanRepayment,
} = require("./lib/manual-entry-service");
const {
  recordMemberDistribution,
  importDistributionFromFile,
  listRecentDistributions,
} = require("./lib/import-distribution-file");
const { importScheduleFromFile } = require("./lib/import-loan-schedule");
const { importBankLedger } = require("./lib/import-bank-ledger");
const {
  getAllBankLoanLots,
  getBankLoanLot,
  hasBankLoanLedger,
} = require("./lib/loan-ledger-service");
const {
  registerBankImport,
  parseBankStatementPreview,
  listBankImports,
  runBankImportFromUpload,
  bankUploadFromMulter,
} = require("./lib/bank-import");
const {
  MEMBERSHIP_FEE,
  LATE_FEE_AMOUNT,
  DEFAULT_LOAN_ANNUAL_RATE,
  MIN_MEMBERSHIP_MONTHS_FOR_LOAN,
} = require("./lib/constants");

const { getDataDir, getPublicDir } = require("./lib/paths");
const { getOrgDataDir } = require("./lib/organization-service");
const { registerStatementRoutes } = require("./lib/statement-routes");
const { registerAuthRoutes } = require("./lib/auth-routes");
const {
  registerPlatformRoutes,
  registerBillingRoutes,
  requireActiveSubscription,
} = require("./lib/platform-routes");
const {
  attachUser,
  requireAuth,
  requireAdmin,
  requireCooperativeView,
  requireMemberSelf,
  blockWritesUnlessAdmin,
  restoreOrgContext,
} = require("./lib/auth-middleware");
const { canAccessMember, canViewCooperative, ROLES } = require("./lib/auth-service");

const upload = multer({
  dest: (req, file, cb) => {
    const slug = req.user?.organizationSlug || req.organization?.slug;
    if (!slug) return cb(new Error("No organization selected"));
    const dir = path.join(getOrgDataDir(slug), "uploads");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
});

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (origin && (allowed.includes(origin) || allowed.includes("*"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.post(
  "/api/billing/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const { handleStripeWebhook } = require("./lib/platform-billing-service");
      const result = await handleStripeWebhook(req.body, req.headers["stripe-signature"]);
      res.json(result);
    } catch (err) {
      console.error("Stripe webhook error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

app.use(express.json());
app.use(attachUser);

app.get("/api/health", (req, res) => {
  const fs = require("fs");
  const { migrateLegacyDatabaseIfNeeded, ASSURANCE_SLUG, getOrgDataDir } = require("./lib/organization-service");
  const { loadBetterSqlite3 } = require("./lib/native-sqlite");
  migrateLegacyDatabaseIfNeeded();
  const payload = { ok: true, name: "Peer Finance Manager" };
  try {
    const dbPath = path.join(getOrgDataDir(ASSURANCE_SLUG), "peerfinance.db");
    if (fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      const Database = loadBetterSqlite3();
      const db = new Database(dbPath, { readonly: true });
      const latest = db.prepare(`SELECT MAX(transaction_date) AS d FROM transactions`).get().d;
      const bankImport = db
        .prepare(`SELECT COUNT(1) AS c FROM transactions WHERE source = 'bank_import'`)
        .get().c;
      db.close();
      payload.ledger = {
        dbSize: stat.size,
        latestTransaction: latest,
        bankImportRows: bankImport,
      };
    }
  } catch (_) {
    /* health check stays ok even if ledger probe fails */
  }
  try {
    const { isEmailConfigured } = require("./lib/report-notification-service");
    payload.emailConfigured = isEmailConfigured();
  } catch (_) {}
  try {
    const { isStripeConfigured } = require("./lib/platform-billing-service");
    payload.stripeConfigured = isStripeConfigured();
  } catch (_) {}
  try {
    const { todayIso, getCooperativeTimezone } = require("./lib/cooperative-time");
    payload.cooperativeToday = todayIso();
    payload.timezone = getCooperativeTimezone();
  } catch (_) {}
  res.json(payload);
});

registerPlatformRoutes(app);
registerAuthRoutes(app, { upload });
registerBillingRoutes(app, { requireAdmin, requireAuth, restoreOrgContext });

app.get("/", (req, res) => res.redirect("/member"));
for (const portalPath of ["/member", "/staff", "/admin", "/register", "/platform"]) {
  app.get(portalPath, (req, res) => {
    res.sendFile(path.join(getPublicDir(), "index.html"));
  });
}

app.use("/api", (req, res, next) => {
  if (
    req.path === "/auth/login" ||
    req.path === "/auth/register-organization" ||
    req.path === "/organizations/lookup" ||
    req.path.startsWith("/platform/") ||
    req.path === "/billing/stripe-webhook"
  ) {
    return next();
  }
  requireAuth(req, res, next);
});
app.use("/api", requireActiveSubscription);
app.use("/api", blockWritesUnlessAdmin);

app.use(express.static(getPublicDir()));
registerStatementRoutes(app);

app.get("/api/config", (req, res) => {
  res.json({
    organization: req.user?.organizationName || req.organization?.name || null,
    organizationSlug: req.user?.organizationSlug || req.organization?.slug || null,
    membershipFee: MEMBERSHIP_FEE,
    lateFeeAmount: LATE_FEE_AMOUNT,
    defaultLoanRate: DEFAULT_LOAN_ANNUAL_RATE,
    minMembershipMonthsForLoan: MIN_MEMBERSHIP_MONTHS_FOR_LOAN,
  });
});

app.get("/api/members", (req, res) => {
  try {
    if (req.user.role === ROLES.MEMBER) {
      const withProfiles = req.query.profiles === "true";
      const all = withProfiles ? listMembersWithProfiles() : listMembersWithBalances();
      const mine = all.filter((m) => m.id === req.user.memberId);
      return res.json({ members: mine });
    }
    const withProfiles = req.query.profiles === "true";
    res.json({
      members: withProfiles ? listMembersWithProfiles() : listMembersWithBalances(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/members/:id/profile", requireMemberSelf("id"), (req, res) => {
  try {
    const profile = getMemberProfile(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: "Member not found" });
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/members", (req, res) => {
  try {
    const result = createMember(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/members/:id/profile", (req, res) => {
  try {
    const result = updateMemberProfile(Number(req.params.id), req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/transactions/membership-fee", (req, res) => {
  try {
    const memberId = Number(req.body.memberId);
    if (!memberId) return res.status(400).json({ error: "Member is required" });
    const result = recordMembershipFee(memberId, {
      feeDate: req.body.feeDate,
      amount: req.body.amount,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/import/wpforms-profiles", upload.single("file"), (req, res) => {
  try {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ error: "No file uploaded" });
    const result = importWpformsProfiles(filePath);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/members/:id/transactions", requireMemberSelf("id"), (req, res) => {
  try {
    res.json({
      transactions: getMemberTransactions(Number(req.params.id)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/import/spreadsheet", upload.single("file"), (req, res) => {
  try {
    const filePath = req.file?.path;
    const sheetName = req.body.sheetName || "April 2026";
    if (!filePath) return res.status(400).json({ error: "No file uploaded" });
    const result = importFromSpreadsheet(filePath, sheetName, {
      replaceExisting: req.body.replace === "true",
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/import/bank-ledger", (req, res) => {
  try {
    const { getCoopRoot } = require("./lib/paths");
    const root = getCoopRoot();
    const result = importBankLedger({
      xlsxPath: path.join(root, "All deposits.xlsx"),
      csvPath: path.join(root, "data", "bank-statement-2026.csv"),
      cdBalance: req.body.cdBalance || "7193.74",
      replaceSpreadsheetDeposits: true,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/loans", requireCooperativeView, (req, res) => {
  try {
    if (hasBankLoanLedger()) {
      const lots = getAllBankLoanLots({ status: req.query.status });
      res.json({
        loans: lots.map((lot) => ({
          id: lot.ledgerKey,
          borrower_id: lot.memberId,
          borrower_name: lot.borrower,
          principal: lot.principal,
          bank_disbursement_amount: lot.bankDisbursementAmount,
          principal_note: lot.principalNote,
          agreed_principal: lot.agreedPrincipal,
          collected: lot.collected,
          outstanding: lot.outstanding,
          interest_income: lot.interestIncome,
          scheduled_total_interest: lot.scheduledTotalInterest,
          scheduled_monthly_payment: lot.scheduledMonthlyPayment,
          scheduled_total_payable: lot.scheduledTotalPayable,
          schedule_title: lot.scheduleTitle,
          schedule: lot.schedule,
          start_date: lot.disbursementDate,
          status: lot.status,
          loan_number: lot.loanNumber,
          source: "bank_ledger",
          repayment_count: lot.repayments.length,
          disbursement_description: lot.disbursementDescription,
        })),
      });
      return;
    }
    res.json({ loans: listLoans(req.query.status) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/loans/ledger/:memberId/:loanNumber", (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    if (!canAccessMember(req.user, memberId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const loan = getBankLoanLot(
      Number(req.params.memberId),
      Number(req.params.loanNumber)
    );
    if (!loan) {
      res.status(404).json({ error: "Loan not found" });
      return;
    }
    res.json({ loan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/loans/ledger/:memberId/:loanNumber/statement", async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    if (!canAccessMember(req.user, memberId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const loan = getBankLoanLot(
      Number(req.params.memberId),
      Number(req.params.loanNumber)
    );
    if (!loan) {
      res.status(404).json({ error: "Loan not found" });
      return;
    }
    const { generateLoanStatementPdf } = require("./lib/loan-statement-generator");
    const result = await generateLoanStatementPdf(loan, {
      year: Number(req.query.year) || undefined,
      month: Number(req.query.month) || undefined,
    });
    res.download(result.outputPath, result.fileName);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/loans/validate", (req, res) => {
  try {
    const result = validateLoanApplication(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/loans", (req, res) => {
  try {
    const { loanId } = createManualLoan(req.body);
    res.json({ success: true, loanId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/loans/:id/repayments", (req, res) => {
  try {
    const result = recordManualLoanRepayment({
      loanId: Number(req.params.id),
      amount: req.body.amount,
      paymentDate: req.body.paymentDate,
      description: req.body.description,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/transactions/member", (req, res) => {
  try {
    const result = recordMemberDepositEntry(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/distributions/member", (req, res) => {
  try {
    const result = recordMemberDistribution(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/distributions/import", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const result = importDistributionFromFile({
      filePath: req.file.path,
      creditedDate: req.body.creditedDate,
      label: req.body.label,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/distributions/recent", requireCooperativeView, (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    res.json({ distributions: listRecentDistributions(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/expenses", requireCooperativeView, (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    res.json({ expenses: listExpenses(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/expense-categories", requireCooperativeView, (req, res) => {
  try {
    res.json({ categories: getExpenseCategories() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/expenses", (req, res) => {
  try {
    const result = recordExpense(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/loans/:id/import-schedule", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const count = importScheduleFromFile(Number(req.params.id), req.file.path);
    res.json({ success: true, installmentsImported: count });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/bank-import/preview", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const preview = parseBankStatementPreview(req.file.path);
    const importId = registerBankImport(req.file.originalname);
    res.json({ importId, ...preview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/bank-import/check-conflicts",
  requireAdmin,
  upload.fields([
    { name: "workbook", maxCount: 1 },
    { name: "statement", maxCount: 1 },
  ]),
  restoreOrgContext,
  (req, res) => {
    try {
      const upload = bankUploadFromMulter(req.files);
      if (!upload.workbookPath && !upload.statementPath) {
        return res.status(400).json({
          error: "Upload your master ledger file (cooperative-bank-ledger-reference.csv).",
        });
      }
      const { findManualLedgerMissingFromImport } = require("./lib/bank-import-conflicts");
      const conflicts = findManualLedgerMissingFromImport(upload);
      res.json({ conflicts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/api/bank-import/run",
  requireAdmin,
  upload.fields([
    { name: "workbook", maxCount: 1 },
    { name: "statement", maxCount: 1 },
  ]),
  restoreOrgContext,
  (req, res) => {
    try {
      const upload = bankUploadFromMulter(req.files);
      if (!upload.workbookPath && !upload.statementPath) {
        return res.status(400).json({
          error: "Upload your master ledger file (cooperative-bank-ledger-reference.csv).",
        });
      }
      const { findManualLedgerMissingFromImport } = require("./lib/bank-import-conflicts");
      const conflicts = findManualLedgerMissingFromImport(upload);
      const acknowledged =
        req.body?.acknowledgeManualLoss === "true" ||
        req.body?.acknowledgeManualLoss === true;
      if (conflicts.hasConflicts && !acknowledged) {
        return res.status(409).json({
          error:
            "This import would remove manual transactions that are not in the uploaded file. Download the reference CSV, include those rows, or confirm to proceed.",
          conflicts,
        });
      }
      const result = runBankImportFromUpload({
        ...upload,
        cdBalance: req.body?.cdBalance,
      });
      res.json({ success: true, result, conflicts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/api/bank-import/missing-rows/download",
  requireAdmin,
  upload.fields([
    { name: "workbook", maxCount: 1 },
    { name: "statement", maxCount: 1 },
  ]),
  restoreOrgContext,
  (req, res) => {
    try {
      const upload = bankUploadFromMulter(req.files);
      if (!upload.workbookPath && !upload.statementPath) {
        return res.status(400).json({
          error: "Upload your master ledger file (cooperative-bank-ledger-reference.csv).",
        });
      }
      const { findManualLedgerMissingFromImport } = require("./lib/bank-import-conflicts");
      const {
        buildMissingManualRowsCsvContent,
        MISSING_MANUAL_ROWS_CSV_BASENAME,
      } = require("./lib/cooperative-bank-ledger-csv");
      const conflicts = findManualLedgerMissingFromImport(upload);
      if (!conflicts.missingFromImport.length) {
        return res.status(404).json({
          error: "No missing manual transactions for the file you selected.",
        });
      }
      const csv = buildMissingManualRowsCsvContent(conflicts.missingFromImport);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${MISSING_MANUAL_ROWS_CSV_BASENAME}"`
      );
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/api/bank-import/sync-missing",
  requireAdmin,
  restoreOrgContext,
  (req, res) => {
    try {
      const { syncMissingBankLedgerRows } = require("./lib/import-bank-ledger");
      const result = syncMissingBankLedgerRows();
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get("/api/bank-imports", requireCooperativeView, (req, res) => {
  try {
    res.json({ imports: listBankImports() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/bank-ledger/reference/sort-upload",
  requireAdmin,
  upload.fields([
    { name: "workbook", maxCount: 1 },
    { name: "statement", maxCount: 1 },
  ]),
  restoreOrgContext,
  (req, res) => {
    try {
      const upload = bankUploadFromMulter(req.files);
      if (!upload.workbookPath && !upload.statementPath) {
        return res.status(400).json({
          error: "Upload your master ledger file (cooperative-bank-ledger-reference.csv).",
        });
      }
      const {
        buildSortedReferenceCsvFromUpload,
        CSV_BASENAME,
      } = require("./lib/cooperative-bank-ledger-csv");
      const { content } = buildSortedReferenceCsvFromUpload(upload);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${CSV_BASENAME}"`);
      res.send(content);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get("/api/bank-ledger/reference/download", requireAdmin, restoreOrgContext, (req, res) => {
  try {
    const fs = require("fs");
    const {
      syncCooperativeBankLedgerCsvFiles,
      getCooperativeBankLedgerCsvPath,
      CSV_BASENAME,
    } = require("./lib/cooperative-bank-ledger-csv");
    syncCooperativeBankLedgerCsvFiles();
    const filePath = getCooperativeBankLedgerCsvPath();
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Reference CSV not found" });
    }
    res.download(filePath, CSV_BASENAME);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/books", requireCooperativeView, (req, res) => {
  try {
    res.json({ books: getCooperativeBooks() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/books/detail/:slug", requireCooperativeView, (req, res) => {
  try {
    res.json({ detail: getBookDetail(req.params.slug) });
  } catch (err) {
    res.status(err.message === "Unknown book detail" ? 404 : 500).json({
      error: err.message,
    });
  }
});

app.get("/api/books/monthly-status-report/status", requireCooperativeView, (req, res) => {
  try {
    const {
      getMonthlyStatusReportStatus,
      listCooperativeStatusReports,
    } = require("./lib/monthly-status-report-service");
    const { getCooperativeStatusReportData } = require("./lib/cooperative-status-report");
    const periodOptions =
      req.query.year || req.query.month
        ? {
            year: req.query.year ? Number(req.query.year) : undefined,
            month: req.query.month ? Number(req.query.month) : undefined,
            useMonthEnd: true,
          }
        : { asOfToday: true };
    const reportData = getCooperativeStatusReportData(periodOptions);
    res.json({
      status: {
        ...getMonthlyStatusReportStatus(periodOptions),
        performanceOverview: reportData.performanceOverview,
      },
      reports: listCooperativeStatusReports(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/books/monthly-status-report/settings", requireCooperativeView, (req, res) => {
  try {
    const { getMonthlyStatusReportSettings } = require("./lib/monthly-status-report-service");
    res.json({ settings: getMonthlyStatusReportSettings() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/books/monthly-status-report/settings", requireAdmin, (req, res) => {
  try {
    const { updateMonthlyStatusReportSettings } = require("./lib/monthly-status-report-service");
    const settings = updateMonthlyStatusReportSettings(req.body || {});
    res.json({ settings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/books/monthly-status-report/generate", requireAdmin, async (req, res) => {
  try {
    const { generateMonthlyStatusReport } = require("./lib/monthly-status-report-service");
    const year = req.body?.year ? Number(req.body.year) : undefined;
    const month = req.body?.month ? Number(req.body.month) : undefined;
    const result = await generateMonthlyStatusReport(
      year != null && month != null ? { year, month, useMonthEnd: true } : { asOfToday: true }
    );
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/books/monthly-status-report/publish", requireAdmin, (req, res) => {
  try {
    const { publishMonthlyStatusReport } = require("./lib/monthly-status-report-service");
    const { defaultReportAsOfToday } = require("./lib/cooperative-status-report");
    const periodSlug = req.body?.periodSlug || defaultReportAsOfToday().slug;
    const status = publishMonthlyStatusReport(periodSlug);
    res.json({ success: true, status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/books/monthly-status-report/unpublish", requireAdmin, (req, res) => {
  try {
    const { unpublishMonthlyStatusReport } = require("./lib/monthly-status-report-service");
    const { defaultReportAsOfToday } = require("./lib/cooperative-status-report");
    const periodSlug = req.body?.periodSlug || defaultReportAsOfToday().slug;
    const status = unpublishMonthlyStatusReport(periodSlug);
    res.json({ success: true, status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/books/monthly-status-report/download", requireCooperativeView, (req, res) => {
  try {
    const { getReportDownloadPath } = require("./lib/monthly-status-report-service");
    const { defaultReportAsOfToday } = require("./lib/cooperative-status-report");
    const periodSlug = req.query.periodSlug || defaultReportAsOfToday().slug;
    const file = getReportDownloadPath(periodSlug, { requirePublished: false });
    res.download(file.filePath, file.fileName);
  } catch (err) {
    res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

app.get("/api/books/meetings", requireCooperativeView, (req, res) => {
  try {
    const { listMeetings, getMeetingSettings } = require("./lib/cooperative-meeting-service");
    res.json({
      meetings: listMeetings({ includeDrafts: true, includeCancelled: true }),
      settings: getMeetingSettings(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/books/meetings/settings", requireCooperativeView, (req, res) => {
  try {
    const { getMeetingSettings } = require("./lib/cooperative-meeting-service");
    res.json({ settings: getMeetingSettings() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/books/meetings/settings", requireAdmin, (req, res) => {
  try {
    const { updateMeetingSettings } = require("./lib/cooperative-meeting-service");
    res.json({ settings: updateMeetingSettings(req.body || {}) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/books/meetings", requireAdmin, (req, res) => {
  try {
    const { createMeeting } = require("./lib/cooperative-meeting-service");
    const meeting = createMeeting(req.body || {}, req.user?.id || null);
    res.json({ success: true, meeting });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/books/meetings/:id", requireAdmin, (req, res) => {
  try {
    const { updateMeeting } = require("./lib/cooperative-meeting-service");
    const meeting = updateMeeting(Number(req.params.id), req.body || {});
    res.json({ success: true, meeting });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/books/meetings/:id", requireAdmin, (req, res) => {
  try {
    const { deleteMeeting } = require("./lib/cooperative-meeting-service");
    res.json(deleteMeeting(Number(req.params.id)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/books/meetings/:id/announce", requireAdmin, (req, res) => {
  try {
    const { announceMeeting } = require("./lib/cooperative-meeting-service");
    res.json({ success: true, meeting: announceMeeting(Number(req.params.id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/books/meetings/:id/cancel", requireAdmin, (req, res) => {
  try {
    const { cancelMeeting } = require("./lib/cooperative-meeting-service");
    res.json({ success: true, meeting: cancelMeeting(Number(req.params.id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/books/meetings/:id/resend-announcement", requireAdmin, async (req, res) => {
  try {
    const { getMeetingById } = require("./lib/cooperative-meeting-service");
    const { sendMeetingAnnouncedEmails } = require("./lib/meeting-notification-service");
    const meeting = getMeetingById(Number(req.params.id));
    if (!meeting || meeting.status !== "announced") {
      return res.status(400).json({ error: "Only announced meetings can be re-notified" });
    }
    const emailResult = await sendMeetingAnnouncedEmails(meeting, { bypassDedupe: true });
    res.json({ success: true, emailResult });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/books/expense-report-labels", requireCooperativeView, (req, res) => {
  try {
    const {
      listExpenseReportLabels,
      listExpenseReportLines,
    } = require("./lib/expense-report-label-service");
    res.json({
      labels: listExpenseReportLabels(),
      lines: listExpenseReportLines(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/books/expense-report-labels", requireAdmin, (req, res) => {
  try {
    const { updateExpenseReportLineLabels } = require("./lib/expense-report-label-service");
    const result = updateExpenseReportLineLabels(req.body?.assignments || []);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/books/operational-expenses-summary", requireCooperativeView, (req, res) => {
  try {
    const { getOperationalExpensesSummary } = require("./lib/expense-report-label-service");
    const { getCooperativeStatusReportData } = require("./lib/cooperative-status-report");
    const reportData = getCooperativeStatusReportData();
    res.json({
      summary: getOperationalExpensesSummary(),
      performanceOverview: reportData.performanceOverview,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/settings/cd-balance", requireCooperativeView, (req, res) => {
  try {
    res.json({ cdBalance: getCdBalanceSnapshot() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/settings/checking-balance", requireCooperativeView, (req, res) => {
  try {
    res.json({ checkingBalance: getCheckingBalanceSnapshot() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/settings/timezones", requireCooperativeView, (req, res) => {
  try {
    const {
      listSupportedTimezones,
      getCooperativeTimezone,
      timezoneLabel,
    } = require("./lib/cooperative-time");
    const timezones = listSupportedTimezones().map((id) => ({
      id,
      label: timezoneLabel(id),
    }));
    res.json({
      cooperativeTimezone: getCooperativeTimezone(),
      timezones,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings/cd-balance", (req, res) => {
  try {
    const result = updateCdBalance({
      balance: req.body.balance,
      asOfDate: req.body.asOfDate,
      note: req.body.note,
    });
    res.json({ success: true, cdBalance: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/settings/checking-balance", (req, res) => {
  try {
    const result = updateCheckingBalance({
      balance: req.body.balance,
      asOfDate: req.body.asOfDate,
      note: req.body.note,
    });
    res.json({ success: true, checkingBalance: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const { trace } = require("./lib/trace-log");

function startServer(port, callback) {
  const listenPort = Number(
    port || process.env.PORT || process.env.PFM_PORT || 3457
  );
  trace.info("Binding HTTP server", { port: listenPort });
  const server = app.listen(listenPort, "0.0.0.0", () => {
    trace.info("HTTP server listening", { port: listenPort });
    try {
      const {
        runScheduledMonthlyStatusJobsForAllOrganizations,
      } = require("./lib/monthly-status-report-service");
      runScheduledMonthlyStatusJobsForAllOrganizations().catch((err) => {
        trace.info("Monthly status report scheduler error", { error: err.message });
      });
      setInterval(() => {
        runScheduledMonthlyStatusJobsForAllOrganizations().catch((err) => {
          trace.info("Monthly status report scheduler error", { error: err.message });
        });
      }, 6 * 60 * 60 * 1000);

      const {
        runScheduledMeetingJobsForAllOrganizations,
      } = require("./lib/cooperative-meeting-service");
      runScheduledMeetingJobsForAllOrganizations().catch((err) => {
        trace.info("Meeting reminder scheduler error", { error: err.message });
      });
      setInterval(() => {
        runScheduledMeetingJobsForAllOrganizations().catch((err) => {
          trace.info("Meeting reminder scheduler error", { error: err.message });
        });
      }, 6 * 60 * 60 * 1000);

      const { listOrganizations } = require("./lib/organization-service");
      const { runWithOrg } = require("./lib/org-context");
      const { syncMissingBankLedgerRows } = require("./lib/import-bank-ledger");
      for (const org of listOrganizations()) {
        runWithOrg(org.slug, () => {
          try {
            const result = syncMissingBankLedgerRows();
            if (result.inserted > 0) {
              trace.info("Synced missing bank ledger rows", {
                orgSlug: org.slug,
                inserted: result.inserted,
                afterBalance: result.afterBalance,
              });
            }
          } catch (err) {
            trace.info("Ledger sync skipped", { orgSlug: org.slug, error: err.message });
          }
        });
      }
    } catch (err) {
      trace.info("Monthly status report scheduler unavailable", { error: err.message });
    }
    if (callback) callback(null, listenPort);
  });
  server.on("error", (err) => {
    if (callback) callback(err);
    else throw err;
  });
  return server;
}

module.exports = { app, startServer };

if (require.main === module) {
  const port = Number(process.env.PORT || process.env.PFM_PORT || 3457);
  const { initPaths } = require("./lib/paths");
  initPaths();

  if (process.env.NODE_ENV === "production") {
    const { migrateLegacyDatabaseIfNeeded, migrateLegacyOrgBillingDefaults } = require("./lib/organization-service");
    const { ensureCooperativeData } = require("./lib/startup-seed");
    const { ensurePlatformAdminUser } = require("./lib/platform-auth-service");
    migrateLegacyDatabaseIfNeeded();
    migrateLegacyOrgBillingDefaults();
    ensureCooperativeData();
    try {
      const result = ensurePlatformAdminUser();
      console.log(`Platform admin ready (${result.email}, ${result.created ? "created" : "updated"})`);
    } catch (err) {
      console.error("Platform admin setup failed:", err.message);
    }
  } else {
    const { ensureSingleInstance } = require("./lib/kill-existing-instances");
    const { killPort } = require("./lib/kill-port");
    const { migrateLegacyDatabaseIfNeeded, migrateLegacyOrgBillingDefaults } = require("./lib/organization-service");
    const { ensurePlatformAdminUser } = require("./lib/platform-auth-service");
    ensureSingleInstance(port);
    killPort(port);
    migrateLegacyDatabaseIfNeeded();
    migrateLegacyOrgBillingDefaults();
    try {
      ensurePlatformAdminUser();
    } catch (err) {
      console.error("Platform admin setup failed:", err.message);
    }
  }

  startServer(port, (err) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
  });
}
