/**
 * Annual membership dues reminders (annual fee model only).
 *
 * Emails every active member whose dues payments for the year are below the
 * required amount. Frequency is Cooperative-admin configurable (daily,
 * weekly, monthly) via Membership Policy; a manual "send now" path exists for
 * on-demand reminders. Scheduled runs stamp a last-sent date so frequency is
 * honoured. No penalties apply: dues may be paid in full or in instalments.
 */
const { sendEmail, isEmailConfigured } = require("./email-service");
const { getDb } = require("../db/database");
const { getOrgSlugOrNull } = require("./org-context");
const { getMemberPortalLoginUrl } = require("./portal-urls");
const { formatMoney } = require("./money-format");
const { todayIso } = require("./cooperative-time");
const { recordDeliveryBatch, ensureEmailAuditTables } = require("./email-audit-service");
const {
  getMembershipPolicy,
  setMembershipPolicy,
  SETTING_DUES_REMINDER_LAST_SENT,
  FEE_MODEL_ANNUAL,
} = require("./membership-policy-service");
const { setCooperativeSetting } = require("./cooperative-settings");
const {
  currentDuesYear,
  getAnnualDuesStatus,
} = require("./annual-dues-service");

const TRIGGER_TYPE = "annual_dues_reminder";
const FREQUENCY_DAYS = { daily: 1, weekly: 7, monthly: 30 };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function usableEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email.includes("@") || email.endsWith(".local")) return null;
  return email;
}

function organizationBranding() {
  const slug = getOrgSlugOrNull();
  let name = "Your Cooperative";
  if (slug) {
    try {
      const { getOrganization } = require("./organization-service");
      const org = getOrganization(slug);
      if (org?.name) name = org.name;
    } catch (_) {
      /* fall back to generic branding */
    }
  }
  return { slug, name, portalUrl: getMemberPortalLoginUrl(slug) };
}

function lookupRecipient(memberId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT m.id AS memberId,
              COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName,
              mp.email AS profileEmail,
              u.email AS loginEmail
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       LEFT JOIN users u ON u.member_id = m.id AND u.role = 'member'
       WHERE m.id = ?`
    )
    .get(Number(memberId));
  if (!row) return null;
  return {
    memberId: row.memberId,
    memberName: row.memberName,
    email: usableEmail(row.profileEmail) || usableEmail(row.loginEmail),
  };
}

function buildDuesReminderEmail({ memberName, orgName, year, paid, required, outstanding, portalUrl }) {
  const subject = `${orgName}: ${year} Annual Membership Fee Reminder`;
  const text = [
    `Dear ${memberName},`,
    ``,
    `This is a friendly reminder that your ${year} annual membership fee with ${orgName} has an outstanding balance.`,
    ``,
    `Required for ${year}: ${formatMoney(required)}`,
    `Paid to date: ${formatMoney(paid)}`,
    `Outstanding: ${formatMoney(outstanding)}`,
    ``,
    `You may pay the balance in full or in instalments at any time during the year, with no penalty.`,
    `Sign in to your member portal to view your account: ${portalUrl}`,
    ``,
    `Thank you,`,
    `${orgName}`,
  ].join("\n");
  const html = text.split("\n").map((l) => (l ? `<p>${escapeHtml(l)}</p>` : "")).join("");
  return { subject, text, html };
}

/**
 * Send dues reminders to every member with an outstanding balance for `year`.
 * `manual` bypasses the enabled flag (admin on-demand send).
 */
async function sendDuesReminders({ year = currentDuesYear(), manual = false } = {}) {
  const policy = getMembershipPolicy();
  if (policy.feeModel !== FEE_MODEL_ANNUAL) {
    return { sent: 0, failed: 0, skipped: 0, outstanding: 0, reason: "not_annual_model" };
  }
  if (!manual && !policy.annualDuesReminderEnabled) {
    return { sent: 0, failed: 0, skipped: 0, outstanding: 0, reason: "disabled" };
  }

  const status = getAnnualDuesStatus(year);
  const outstanding = status.rows.filter((r) => r.outstanding > 0);
  if (!outstanding.length) {
    return { sent: 0, failed: 0, skipped: 0, outstanding: 0, reason: null, year };
  }

  const { name: orgName, portalUrl } = organizationBranding();
  ensureEmailAuditTables();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of outstanding) {
    const recipient = lookupRecipient(row.memberId);
    const dedupeKey = `${TRIGGER_TYPE}:${year}:${row.memberId}:${todayIso()}`;
    const deliveryBase = {
      memberId: row.memberId,
      recipientEmail: recipient?.email || null,
      subject: `${orgName}: ${year} Annual Membership Fee Reminder`,
    };
    if (!recipient?.email) {
      skipped += 1;
      recordDeliveryBatch({
        triggerType: TRIGGER_TYPE,
        dedupeKey,
        deliveries: [{ ...deliveryBase, status: "skipped", errorMessage: "no_email" }],
      });
      continue;
    }
    const email = buildDuesReminderEmail({
      memberName: recipient.memberName,
      orgName,
      year,
      paid: row.paid,
      required: row.required,
      outstanding: row.outstanding,
      portalUrl,
    });
    try {
      const result = await sendEmail({
        to: recipient.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      const ok = result?.sent !== false;
      if (ok) sent += 1;
      else skipped += 1;
      recordDeliveryBatch({
        triggerType: TRIGGER_TYPE,
        dedupeKey,
        deliveries: [
          {
            ...deliveryBase,
            status: ok ? "sent" : "skipped",
            errorMessage: ok ? null : result?.reason || "not_sent",
          },
        ],
      });
    } catch (err) {
      failed += 1;
      recordDeliveryBatch({
        triggerType: TRIGGER_TYPE,
        dedupeKey,
        deliveries: [
          { ...deliveryBase, status: "failed", errorMessage: err.message },
        ],
      });
    }
  }

  return {
    sent,
    failed,
    skipped,
    outstanding: outstanding.length,
    year,
    reason: !isEmailConfigured() ? "not_configured" : null,
  };
}

function reminderDueNow() {
  const policy = getMembershipPolicy();
  if (policy.feeModel !== FEE_MODEL_ANNUAL || !policy.annualDuesReminderEnabled) {
    return false;
  }
  const lastSent = String(
    (function () {
      try {
        const { getCooperativeSetting } = require("./cooperative-settings");
        return getCooperativeSetting(SETTING_DUES_REMINDER_LAST_SENT) || "";
      } catch (_) {
        return "";
      }
    })()
  );
  const intervalDays = FREQUENCY_DAYS[policy.annualDuesReminderFrequency] || 30;
  if (!lastSent) return true;
  const elapsedMs = Date.now() - new Date(lastSent).getTime();
  return elapsedMs >= intervalDays * 24 * 60 * 60 * 1000;
}

async function runScheduledDuesRemindersForAllOrganizations() {
  const { listOrganizations } = require("./organization-service");
  const { runWithOrg } = require("./org-context");
  const summary = [];
  for (const org of listOrganizations()) {
    await runWithOrg(org.slug, async () => {
      try {
        if (!reminderDueNow()) return;
        const outcome = await sendDuesReminders({});
        const db = getDb();
        setCooperativeSetting(db, SETTING_DUES_REMINDER_LAST_SENT, new Date().toISOString());
        if (outcome.sent || outcome.outstanding) {
          summary.push({ orgSlug: org.slug, ...outcome });
        }
      } catch (err) {
        summary.push({ orgSlug: org.slug, error: err.message });
      }
    });
  }
  return summary;
}

module.exports = {
  TRIGGER_TYPE,
  FREQUENCY_DAYS,
  buildDuesReminderEmail,
  sendDuesReminders,
  reminderDueNow,
  runScheduledDuesRemindersForAllOrganizations,
};
