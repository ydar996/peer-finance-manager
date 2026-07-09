const { getDb } = require("../db/database");
const { ensureSettingsTable, getCooperativeSetting } = require("./cooperative-settings");
const { sendEmail, isEmailConfigured } = require("./email-service");
const { trace } = require("./trace-log");
const { getOrganization } = require("./organization-service");
const { getOrgSlug } = require("./org-context");
const {
  parseAsOfDate,
  defaultReportAsOfToday,
} = require("./cooperative-status-report");
const { isMonthEndDay } = require("./cooperative-time");

const SETTING_ORG_WEBSITE = "organization_website";

function getReportRecord(periodSlug) {
  const db = getDb();
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
  return db
    .prepare(`SELECT * FROM cooperative_status_reports WHERE period_slug = ?`)
    .get(periodSlug);
}

function getOrganizationBrandingForReport() {
  const org = getOrganization(getOrgSlug());
  return {
    organizationName: org?.name || "Cooperative",
    website: getCooperativeSetting(SETTING_ORG_WEBSITE) || "",
  };
}

const {
  ensureEmailAuditTables,
  recordDeliveryBatch,
} = require("./email-audit-service");

function ensureNotificationLogTable(db) {
  ensureEmailAuditTables(db);
}

function getMemberPortalUrl() {
  if (process.env.MEMBER_PORTAL_URL) {
    return process.env.MEMBER_PORTAL_URL.replace(/\/$/, "");
  }
  const origins = process.env.ALLOWED_ORIGINS;
  if (origins) {
    const first = origins.split(",")[0].trim();
    if (first) return `${first.replace(/\/$/, "")}/member`;
  }
  return "https://peer-finance-manager.netlify.app/member";
}

function listMemberNotificationRecipients() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.id AS memberId,
              COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName,
              COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), '')) AS email
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       LEFT JOIN users u ON u.member_id = m.id AND u.role = 'member' AND u.active = 1
       WHERE COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), '')) IS NOT NULL
       ORDER BY m.name`
    )
    .all();

  const seen = new Set();
  const recipients = [];
  for (const row of rows) {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      memberId: row.memberId,
      memberName: row.memberName,
      email,
    });
  }
  return recipients;
}

function notificationAlreadySent(dedupeKey) {
  const db = getDb();
  ensureNotificationLogTable(db);
  return Boolean(
    db.prepare(`SELECT 1 FROM member_report_email_log WHERE dedupe_key = ?`).get(dedupeKey)
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendReportReminderEmails({ triggerType, dedupeKey, periodSlug, subject, textFor, htmlFor }) {
  if (!isEmailConfigured()) {
    return { sent: false, skipped: true, reason: "not_configured" };
  }
  if (notificationAlreadySent(dedupeKey)) {
    return { sent: false, skipped: true, reason: "already_sent", dedupeKey };
  }

  const recipients = listMemberNotificationRecipients();
  if (!recipients.length) {
    trace.info("Report reminder email skipped : no member emails on file", { triggerType, periodSlug });
    return { sent: false, skipped: true, reason: "no_recipients" };
  }

  const deliveries = [];
  for (const recipient of recipients) {
    try {
      const result = await sendEmail({
        to: recipient.email,
        subject,
        text: textFor(recipient),
        html: htmlFor(recipient),
      });
      if (result.sent) {
        deliveries.push({
          memberId: recipient.memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject,
          status: "sent",
        });
      } else {
        deliveries.push({
          memberId: recipient.memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject,
          status: "skipped",
          errorMessage: result.reason || "skipped",
        });
      }
    } catch (err) {
      deliveries.push({
        memberId: recipient.memberId,
        memberName: recipient.memberName,
        email: recipient.email,
        subject,
        status: "failed",
        errorMessage: err.message || "send failed",
      });
      trace.warn("Report reminder email failed for recipient", {
        triggerType,
        periodSlug,
        email: recipient.email,
        error: err.message,
      });
    }
  }

  const summary = recordDeliveryBatch({
    triggerType,
    periodSlug,
    dedupeKey,
    subject,
    deliveries,
  });

  trace.info("Report reminder emails sent", {
    triggerType,
    periodSlug,
    dedupeKey,
    sentCount: summary.sentCount,
    failedCount: summary.failedCount,
  });

  return {
    sent: summary.sentCount > 0,
    recipientCount: summary.sentCount,
    failedCount: summary.failedCount,
    batchId: summary.batchId,
    dedupeKey,
  };
}

async function sendCooperativeReportPublishedEmails(periodSlug) {
  const record = getReportRecord(periodSlug);
  if (!record?.is_published) return { skipped: true, reason: "not_published" };

  const period = parseAsOfDate(record.as_of_date);
  const branding = getOrganizationBrandingForReport();
  const portalUrl = getMemberPortalUrl();
  const dedupeKey = `published:${periodSlug}:${record.published_at || record.generated_at}`;
  const subject = `${branding.organizationName} : Cooperative Status Report Published`;

  return sendReportReminderEmails({
    triggerType: "report_published",
    dedupeKey,
    periodSlug,
    subject,
    textFor: (recipient) =>
      `Hello ${recipient.memberName},\n\n` +
      `The Cooperative monthly status report for ${period.periodLabel} (as at ${period.labelUs}) is now available on the member portal. ` +
      `You can also review your personal account statements there.\n\n` +
      `Sign in: ${portalUrl}\n\n` +
      `${branding.organizationName}`,
    htmlFor: (recipient) =>
      `<p>Hello ${escapeHtml(recipient.memberName)},</p>` +
      `<p>The Cooperative monthly status report for <strong>${escapeHtml(period.periodLabel)}</strong> ` +
      `(as at ${escapeHtml(period.labelUs)}) is now available on the member portal. ` +
      `You can also review your personal account statements there.</p>` +
      `<p><a href="${escapeHtml(portalUrl)}">Sign In to the Member Portal</a></p>` +
      `<p>${escapeHtml(branding.organizationName)}</p>`,
  });
}

async function sendMonthEndReportReminderEmails(date = new Date()) {
  if (!isMonthEndDay(date)) return { skipped: true, reason: "not_month_end" };

  const period = defaultReportAsOfToday(date);
  const dateIso = period.dateIso;
  const dedupeKey = `month_end:${dateIso}`;
  const branding = getOrganizationBrandingForReport();
  const portalUrl = getMemberPortalUrl();
  const subject = `${branding.organizationName} : Review Your Monthly Reports`;

  return sendReportReminderEmails({
    triggerType: "month_end",
    dedupeKey,
    periodSlug: period.slug,
    subject,
    textFor: (recipient) =>
      `Hello ${recipient.memberName},\n\n` +
      `Today is the last day of ${period.periodLabel}. Please sign in to the member portal to review your personal account statements and the Cooperative monthly status report.\n\n` +
      `Sign in: ${portalUrl}\n\n` +
      `${branding.organizationName}`,
    htmlFor: (recipient) =>
      `<p>Hello ${escapeHtml(recipient.memberName)},</p>` +
      `<p>Today is the last day of <strong>${escapeHtml(period.periodLabel)}</strong>. ` +
      `Please sign in to the member portal to review your personal account statements and the Cooperative monthly status report.</p>` +
      `<p><a href="${escapeHtml(portalUrl)}">Sign In to the Member Portal</a></p>` +
      `<p>${escapeHtml(branding.organizationName)}</p>`,
  });
}

function queueCooperativeReportPublishedEmails(periodSlug) {
  setImmediate(() => {
    sendCooperativeReportPublishedEmails(periodSlug).catch((err) => {
      trace.warn("Cooperative report publish email failed", {
        error: err.message,
        periodSlug,
      });
    });
  });
}

module.exports = {
  isEmailConfigured,
  getMemberPortalUrl,
  listMemberNotificationRecipients,
  sendCooperativeReportPublishedEmails,
  sendMonthEndReportReminderEmails,
  queueCooperativeReportPublishedEmails,
};
