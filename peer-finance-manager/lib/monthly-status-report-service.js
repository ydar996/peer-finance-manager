const fs = require("fs");
const path = require("path");
const { getDb } = require("../db/database");
const { getOrgSlug, runWithOrg } = require("./org-context");
const { getOrganization, getOrgDataDir, listOrganizations } = require("./organization-service");
const {
  getCooperativeSetting,
  setCooperativeSetting,
  ensureSettingsTable,
} = require("./cooperative-settings");
const {
  generateCooperativeStatusReportPdf,
  resolveReportPeriod,
  defaultReportMonthEnd,
} = require("./cooperative-status-report");

const SETTING_AUTO_GENERATE = "monthly_status_auto_generate";
const SETTING_AUTO_PUBLISH = "monthly_status_auto_publish";
const SETTING_ORG_WEBSITE = "organization_website";

function ensureReportsTable(db) {
  ensureSettingsTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cooperative_status_reports (
      period_slug TEXT PRIMARY KEY,
      as_of_date TEXT NOT NULL,
      file_name TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      published_at TEXT,
      is_published INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function getCooperativeStatusReportsDir(orgSlug) {
  const slug = orgSlug || getOrgSlug();
  return path.join(getOrgDataDir(slug), "reports", "cooperative-status");
}

function truthySetting(value) {
  return value === "1" || value === "true" || value === true;
}

function getMonthlyStatusReportSettings() {
  const db = getDb();
  ensureReportsTable(db);
  return {
    autoGenerate: truthySetting(getCooperativeSetting(SETTING_AUTO_GENERATE)),
    autoPublish: truthySetting(getCooperativeSetting(SETTING_AUTO_PUBLISH)),
    organizationWebsite: getCooperativeSetting(SETTING_ORG_WEBSITE) || "",
  };
}

function updateMonthlyStatusReportSettings(payload = {}) {
  const db = getDb();
  ensureReportsTable(db);
  if (payload.autoGenerate !== undefined) {
    setCooperativeSetting(db, SETTING_AUTO_GENERATE, payload.autoGenerate ? "1" : "0");
  }
  if (payload.autoPublish !== undefined) {
    setCooperativeSetting(db, SETTING_AUTO_PUBLISH, payload.autoPublish ? "1" : "0");
  }
  if (payload.organizationWebsite !== undefined) {
    const website = String(payload.organizationWebsite || "").trim();
    if (website) setCooperativeSetting(db, SETTING_ORG_WEBSITE, website);
    else db.prepare(`DELETE FROM cooperative_settings WHERE key = ?`).run(SETTING_ORG_WEBSITE);
  }
  return getMonthlyStatusReportSettings();
}

function getOrganizationBrandingForReport(orgSlug) {
  const slug = orgSlug || getOrgSlug();
  const org = getOrganization(slug);
  return {
    organizationName: org?.name || "Cooperative",
    website: getCooperativeSetting(SETTING_ORG_WEBSITE) || "",
  };
}

function getReportRecord(periodSlug) {
  const db = getDb();
  ensureReportsTable(db);
  return db
    .prepare(`SELECT * FROM cooperative_status_reports WHERE period_slug = ?`)
    .get(periodSlug);
}

function listCooperativeStatusReports({ publishedOnly = false } = {}) {
  const db = getDb();
  ensureReportsTable(db);
  const rows = db
    .prepare(
      `SELECT period_slug, as_of_date, file_name, generated_at, published_at, is_published
       FROM cooperative_status_reports
       ${publishedOnly ? "WHERE is_published = 1" : ""}
       ORDER BY period_slug DESC`
    )
    .all();
  return rows.map((row) => ({
    periodSlug: row.period_slug,
    asOfDate: row.as_of_date,
    fileName: row.file_name,
    generatedAt: row.generated_at,
    publishedAt: row.published_at,
    isPublished: Boolean(row.is_published),
  }));
}

function saveReportRecord({ period, fileName, outputPath }) {
  const db = getDb();
  ensureReportsTable(db);
  db.prepare(
    `INSERT INTO cooperative_status_reports (
       period_slug, as_of_date, file_name, generated_at, published_at, is_published
     ) VALUES (?, ?, ?, datetime('now'), NULL, 0)
     ON CONFLICT(period_slug) DO UPDATE SET
       as_of_date = excluded.as_of_date,
       file_name = excluded.file_name,
       generated_at = datetime('now'),
       published_at = NULL,
       is_published = 0`
  ).run(period.slug, period.dateIso, fileName);
  return getReportRecord(period.slug);
}

function resolveReportFilePath(record) {
  if (!record) return null;
  const orgSlug = getOrgSlug();
  const candidate = path.join(
    getCooperativeStatusReportsDir(orgSlug),
    record.period_slug,
    record.file_name
  );
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function getMonthlyStatusReportStatus(options = {}) {
  const period = resolveReportPeriod(options);
  const record = getReportRecord(period.slug);
  const settings = getMonthlyStatusReportSettings();
  const filePath = resolveReportFilePath(record);
  return {
    period,
    settings,
    generated: Boolean(record && filePath),
    published: Boolean(record?.is_published),
    generatedAt: record?.generated_at || null,
    publishedAt: record?.published_at || null,
    fileName: record?.file_name || null,
  };
}

async function generateMonthlyStatusReport(options = {}) {
  const orgSlug = getOrgSlug();
  const period = resolveReportPeriod(options);
  const outDir = path.join(getCooperativeStatusReportsDir(orgSlug), period.slug);
  const branding = getOrganizationBrandingForReport(orgSlug);

  const result = await generateCooperativeStatusReportPdf({
    ...options,
    year: period.year,
    month: period.month,
    outputDir: outDir,
    organizationName: branding.organizationName,
    website: branding.website,
  });

  saveReportRecord({
    period: result.period,
    fileName: result.fileName,
    outputPath: result.outputPath,
  });

  const settings = getMonthlyStatusReportSettings();
  let published = false;
  if (settings.autoPublish) {
    publishMonthlyStatusReport(period.slug);
    published = true;
  }

  return {
    ...result,
    published,
    status: getMonthlyStatusReportStatus({ year: period.year, month: period.month }),
  };
}

function publishMonthlyStatusReport(periodSlug) {
  const db = getDb();
  ensureReportsTable(db);
  const record = getReportRecord(periodSlug);
  if (!record) throw new Error("Generate the report before publishing");
  if (!resolveReportFilePath(record)) {
    throw new Error("Report file is missing on disk. Generate the report again.");
  }
  db.prepare(
    `UPDATE cooperative_status_reports
     SET is_published = 1, published_at = datetime('now')
     WHERE period_slug = ?`
  ).run(periodSlug);
  return getMonthlyStatusReportStatus({
    year: Number(periodSlug.slice(0, 4)),
    month: Number(periodSlug.slice(5, 7)),
  });
}

function getReportDownloadPath(periodSlug, { requirePublished = false } = {}) {
  const record = getReportRecord(periodSlug);
  if (!record) throw new Error("Report not found");
  if (requirePublished && !record.is_published) {
    throw new Error("This report has not been published yet");
  }
  const filePath = resolveReportFilePath(record);
  if (!filePath) throw new Error("Report file is missing on disk");
  return { filePath, fileName: record.file_name, record };
}

function isMonthEndDay(date = new Date()) {
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

function previousMonthPeriod(fromDate = new Date()) {
  const year = fromDate.getMonth() === 0 ? fromDate.getFullYear() - 1 : fromDate.getFullYear();
  const month = fromDate.getMonth() === 0 ? 12 : fromDate.getMonth();
  return resolveReportPeriod({ year, month });
}

async function maybeAutoGenerateAndPublishMonthlyStatusReport() {
  const settings = getMonthlyStatusReportSettings();
  if (!settings.autoGenerate && !settings.autoPublish) return { skipped: true };

  const now = new Date();
  const periodsToTry = [];

  if (settings.autoGenerate && isMonthEndDay(now)) {
    periodsToTry.push(defaultReportMonthEnd());
  }
  if (settings.autoGenerate && now.getDate() === 1) {
    periodsToTry.push(previousMonthPeriod(now));
  }

  const results = [];
  for (const period of periodsToTry) {
    const existing = getReportRecord(period.slug);
    if (!existing) {
      results.push(await generateMonthlyStatusReport({ year: period.year, month: period.month }));
      continue;
    }
    if (settings.autoPublish && !existing.is_published && resolveReportFilePath(existing)) {
      publishMonthlyStatusReport(period.slug);
      results.push({ periodSlug: period.slug, published: true });
    }
  }

  return { results };
}

async function runScheduledMonthlyStatusJobsForAllOrganizations() {
  const orgs = listOrganizations();
  const summary = [];
  for (const org of orgs) {
    await runWithOrg(org.slug, async () => {
      try {
        const outcome = await maybeAutoGenerateAndPublishMonthlyStatusReport();
        summary.push({ orgSlug: org.slug, ...outcome });
      } catch (err) {
        summary.push({ orgSlug: org.slug, error: err.message });
      }
    });
  }
  return summary;
}

module.exports = {
  SETTING_AUTO_GENERATE,
  SETTING_AUTO_PUBLISH,
  SETTING_ORG_WEBSITE,
  getCooperativeStatusReportsDir,
  getOrganizationBrandingForReport,
  getMonthlyStatusReportSettings,
  updateMonthlyStatusReportSettings,
  getMonthlyStatusReportStatus,
  listCooperativeStatusReports,
  generateMonthlyStatusReport,
  publishMonthlyStatusReport,
  getReportDownloadPath,
  maybeAutoGenerateAndPublishMonthlyStatusReport,
  runScheduledMonthlyStatusJobsForAllOrganizations,
};
