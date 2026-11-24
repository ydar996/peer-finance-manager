const { getDb } = require("../db/database");
const { ensureSettingsTable, getCooperativeSetting } = require("./cooperative-settings");
const { sendEmail, isEmailConfigured } = require("./email-service");
const { trace } = require("./trace-log");
const { getOrganization } = require("./organization-service");
const { getOrgSlug } = require("./org-context");
const { getMemberPortalLoginUrl } = require("./portal-urls");
const {
  parseAsOfDate,
  defaultReportAsOfToday,
} = require("./cooperative-status-report");
const { isMonthEndDay, nowUtcIso } = require("./cooperative-time");

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
  try {
    db.exec(`ALTER TABLE cooperative_status_reports ADD COLUMN preview_sent_at TEXT`);
  } catch (_) {}
  try {
    db.exec(`ALTER TABLE cooperative_status_reports ADD COLUMN preview_sent_to TEXT`);
  } catch (_) {}
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

function getMemberPortalUrl(slug) {
  return getMemberPortalLoginUrl(slug);
}

function listMemberNotificationRecipients() {
  const db = getDb();
  const { EMAIL_ELIGIBLE_SQL } = require("./membership-status-service");
  const rows = db
    .prepare(
      `SELECT m.id AS memberId,
              COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName,
              COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), '')) AS email
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       LEFT JOIN users u ON u.member_id = m.id AND u.role = 'member' AND u.active = 1
       WHERE ${EMAIL_ELIGIBLE_SQL}
         AND COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), '')) IS NOT NULL
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
  const { memberEmailNotificationsEnabled } = require("./member-email-gate");
  if (!memberEmailNotificationsEnabled()) {
    return { sent: false, skipped: true, reason: "member_email_disabled" };
  }
  if (!isEmailConfigured()) {
    return { sent: false, skipped: true, reason: "not_configured" };
  }
  if (notificationAlreadySent(dedupeKey)) {
    return { sent: false, skipped: true, reason: "already_sent", dedupeKey };
  }

  const recipients = listMemberNotificationRecipients();
  if (!recipients.length) {
    trace.info("Report reminder email skipped: no member emails on file", { triggerType, periodSlug });
    return { sent: false, skipped: true, reason: "no_recipients" };
  }

  const deliveries = [];
  for (const recipient of recipients) {
    const text = textFor(recipient);
    const html = htmlFor(recipient);
    try {
      const result = await sendEmail({
        to: recipient.email,
        subject,
        text,
        html,
      });
      if (result.sent) {
        deliveries.push({
          memberId: recipient.memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject,
          bodyText: text,
          bodyHtml: html,
          status: "sent",
        });
      } else {
        deliveries.push({
          memberId: recipient.memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject,
          bodyText: text,
          bodyHtml: html,
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
        bodyText: text,
        bodyHtml: html,
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
  const { renderAutomatedEmail } = require("./automated-message-service");
  const branding = getOrganizationBrandingForReport();
  const portalUrl = getMemberPortalUrl();
  const dedupeKey = `published:${periodSlug}:${record.published_at || record.generated_at}`;
  const vars = {
    orgName: branding.organizationName,
    portalUrl,
    periodLabel: period.periodLabel,
    asOfDate: period.labelUs,
  };
  const sample = renderAutomatedEmail("report_published", {
    ...vars,
    memberName: "Member",
  });

  return sendReportReminderEmails({
    triggerType: "report_published",
    dedupeKey,
    periodSlug,
    subject: sample.subject,
    textFor: (recipient) =>
      renderAutomatedEmail("report_published", {
        ...vars,
        memberName: recipient.memberName,
      }).text,
    htmlFor: (recipient) =>
      renderAutomatedEmail("report_published", {
        ...vars,
        memberName: recipient.memberName,
      }).html,
  });
}

/**
 * Sends the publish-announcement email to a single administrator so the
 * report can be checked before it goes to all members. Does not publish.
 */
async function sendCooperativeReportPreviewEmail(periodSlug, adminUser) {
  const record = getReportRecord(periodSlug);
  if (!record) throw new Error("Generate the report before sending a preview");
  if (!isEmailConfigured()) throw new Error("Email is not configured");

  const email = String(adminUser?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Your administrator account has no email address on file");

  const period = parseAsOfDate(record.as_of_date);
  const { renderAutomatedEmail } = require("./automated-message-service");
  const branding = getOrganizationBrandingForReport();
  const portalUrl = getMemberPortalUrl();
  const rendered = renderAutomatedEmail("report_published", {
    orgName: branding.organizationName,
    portalUrl,
    periodLabel: period.periodLabel,
    asOfDate: period.labelUs,
    memberName: adminUser?.displayName || adminUser?.name || "Administrator",
  });

  await sendEmail({
    to: email,
    subject: `Preview: ${rendered.subject}`,
    text: rendered.text,
    html: rendered.html,
  });
  const db = getDb();
  db.prepare(
    `UPDATE cooperative_status_reports
     SET preview_sent_at = ?, preview_sent_to = ?
     WHERE period_slug = ?`
  ).run(nowUtcIso(), email, periodSlug);
  trace.info("Report preview email sent to administrator", { periodSlug, to: email });
  return { sent: true, to: email };
}

async function sendMonthEndReportReminderEmails(date = new Date()) {
  if (!isMonthEndDay(date)) return { skipped: true, reason: "not_month_end" };

  const period = defaultReportAsOfToday(date);
  const dateIso = period.dateIso;
  const dedupeKey = `month_end:${dateIso}`;
  const { renderAutomatedEmail } = require("./automated-message-service");
  const branding = getOrganizationBrandingForReport();
  const portalUrl = getMemberPortalUrl();
  const vars = {
    orgName: branding.organizationName,
    portalUrl,
    periodLabel: period.periodLabel,
  };
  const sample = renderAutomatedEmail("month_end", {
    ...vars,
    memberName: "Member",
  });

  return sendReportReminderEmails({
    triggerType: "month_end",
    dedupeKey,
    periodSlug: period.slug,
    subject: sample.subject,
    textFor: (recipient) =>
      renderAutomatedEmail("month_end", {
        ...vars,
        memberName: recipient.memberName,
      }).text,
    htmlFor: (recipient) =>
      renderAutomatedEmail("month_end", {
        ...vars,
        memberName: recipient.memberName,
      }).html,
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
  sendCooperativeReportPreviewEmail,
  sendMonthEndReportReminderEmails,
  queueCooperativeReportPublishedEmails,
};
