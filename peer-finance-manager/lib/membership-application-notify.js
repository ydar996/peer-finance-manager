/**
 * Applicant emails and portal notices for the membership application lifecycle.
 */
const { sendEmail, isEmailConfigured } = require("./email-service");
const { getOrgSlugOrNull } = require("./org-context");
const { getMemberPortalLoginUrl } = require("./portal-urls");
const { formatMoney } = require("./money-format");
const { getDb } = require("../db/database");
const { MEMBERSHIP_FEE } = require("./constants");
const { recordDeliveryBatch, ensureEmailAuditTables } = require("./email-audit-service");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      /* tests and missing registry fall back */
    }
  }
  return { slug, name, portalUrl: getMemberPortalLoginUrl(slug) };
}

function depositsVerifiedAmounts(readiness = {}) {
  const feeAmount = Number(readiness.membershipFeeRequired);
  const depositAmount = Number(readiness.depositTotal);
  const contributionAmount = Number(readiness.extraAfterFee);
  return {
    feeAmount: Number.isFinite(feeAmount) && feeAmount > 0 ? feeAmount : MEMBERSHIP_FEE,
    depositAmount: Number.isFinite(depositAmount) ? depositAmount : 0,
    contributionAmount: Number.isFinite(contributionAmount) ? contributionAmount : 0,
  };
}

function renderDepositsVerifiedMessage({
  memberName,
  feeAmount,
  depositAmount,
  contributionAmount,
} = {}) {
  const { renderAutomatedEmail } = require("./automated-message-service");
  const branding = organizationBranding();
  const amounts = depositsVerifiedAmounts({
    membershipFeeRequired: feeAmount,
    depositTotal: depositAmount,
    extraAfterFee: contributionAmount,
  });
  const message = renderAutomatedEmail("deposits_verified", {
    memberName: memberName || "Member",
    orgName: branding.name,
    portalUrl: branding.portalUrl,
    feeAmount: formatMoney(amounts.feeAmount),
    depositAmount: formatMoney(amounts.depositAmount),
    contributionAmount: formatMoney(amounts.contributionAmount),
  });
  return { branding, message, amounts };
}

async function emailApplicantApplicationReceived({ to, memberName }) {
  if (!isEmailConfigured()) {
    return { sent: false, skipped: true, reason: "not_configured" };
  }
  if (!to) {
    return { sent: false, skipped: true, reason: "no_email" };
  }
  const { renderAutomatedEmail } = require("./automated-message-service");
  const branding = organizationBranding();
  const greeting = memberName || "Applicant";
  const message = renderAutomatedEmail("membership_application_received", {
    memberName: greeting,
    orgName: branding.name,
    portalUrl: branding.portalUrl,
  });
  return sendEmail({ to, subject: message.subject, text: message.text, html: message.html });
}

async function emailApplicantDepositsVerified({
  to,
  memberName,
  feeAmount,
  depositAmount,
  contributionAmount,
} = {}) {
  if (!isEmailConfigured()) {
    return { sent: false, skipped: true, reason: "not_configured" };
  }
  if (!to) {
    return { sent: false, skipped: true, reason: "no_email" };
  }
  const { message } = renderDepositsVerifiedMessage({
    memberName,
    feeAmount,
    depositAmount,
    contributionAmount,
  });
  return sendEmail({ to, subject: message.subject, text: message.text, html: message.html });
}

function notifyMemberPortalDepositsVerified({
  memberId,
  memberName,
  feeAmount,
  depositAmount,
  contributionAmount,
} = {}) {
  const { postMemberSystemNotice } = require("./messaging-service");
  const { branding, message } = renderDepositsVerifiedMessage({
    memberName,
    feeAmount,
    depositAmount,
    contributionAmount,
  });
  return postMemberSystemNotice({
    memberId,
    subject: message.subject.replace(`${branding.name}: `, ""),
    body: message.html,
  });
}

function findDepositsVerifiedNotice(memberId) {
  const db = getDb();
  const { ensureMessagingSchema } = require("./messaging-service");
  ensureMessagingSchema(db);
  const id = Number(memberId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (
    db
      .prepare(
        `SELECT t.id AS threadId, m.id AS messageId, m.body, t.subject
         FROM coop_message_threads t
         INNER JOIN coop_message_participants p
           ON p.thread_id = t.id AND p.member_id = ? AND p.role = 'member'
         INNER JOIN coop_messages m ON m.thread_id = t.id
         WHERE t.created_by_role = 'system'
           AND t.subject LIKE '%Deposits Have Been Verified%'
         ORDER BY m.id DESC
         LIMIT 1`
      )
      .get(id) || null
  );
}

function noticeHasVerifiedAmounts(body, amounts) {
  const text = String(body || "");
  const extraLabel = formatMoney(amounts.contributionAmount);
  const depositLabel = formatMoney(amounts.depositAmount);
  const hasNewWording =
    /agreed membership application fee/i.test(text) &&
    /has been credited to your contributions account/i.test(text);
  return text.includes(extraLabel) && text.includes(depositLabel) && hasNewWording;
}

function rewriteDepositsVerifiedNotice(notice, html) {
  if (!notice?.messageId) return false;
  const db = getDb();
  try {
    db.prepare(`UPDATE coop_messages SET body = ?, body_format = 'html' WHERE id = ?`).run(
      html,
      notice.messageId
    );
  } catch (_) {
    db.prepare(`UPDATE coop_messages SET body = ? WHERE id = ?`).run(html, notice.messageId);
  }
  if (notice.threadId) {
    db.prepare(
      `UPDATE coop_message_threads SET updated_at = datetime('now') WHERE id = ?`
    ).run(notice.threadId);
  }
  return true;
}

function correctionAlreadySent(dedupeKey) {
  const db = getDb();
  ensureEmailAuditTables(db);
  return Boolean(
    db.prepare(`SELECT 1 FROM member_report_email_log WHERE dedupe_key = ?`).get(dedupeKey)
  );
}

async function sendDepositsVerifiedCorrectionEmail({
  to,
  memberId,
  memberName,
  feeAmount,
  depositAmount,
  contributionAmount,
}) {
  if (!to) return { sent: false, skipped: true, reason: "no_email" };
  const amounts = depositsVerifiedAmounts({
    membershipFeeRequired: feeAmount,
    depositTotal: depositAmount,
    extraAfterFee: contributionAmount,
  });
  const dedupeKey = `deposits-verified-correction:v2:${memberId}:${amounts.depositAmount}:${amounts.feeAmount}:${amounts.contributionAmount}`;
  if (correctionAlreadySent(dedupeKey)) {
    return { sent: false, skipped: true, reason: "already_sent", dedupeKey };
  }
  const { message } = renderDepositsVerifiedMessage({
    memberName,
    ...amounts,
  });
  let delivery = { status: "skipped", errorMessage: null };
  if (!isEmailConfigured()) {
    delivery = { status: "skipped", errorMessage: "not_configured" };
  } else {
    try {
      const result = await sendEmail({
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      delivery = {
        status: result?.sent === false ? "failed" : "sent",
        errorMessage: result?.error || result?.reason || null,
      };
    } catch (err) {
      delivery = { status: "failed", errorMessage: err.message };
    }
  }
  recordDeliveryBatch({
    triggerType: "deposits_verified_correction",
    dedupeKey,
    subject: message.subject,
    deliveries: [
      {
        memberId,
        memberName,
        email: to,
        subject: message.subject,
        status: delivery.status,
        errorMessage: delivery.errorMessage,
      },
    ],
  });
  return {
    sent: delivery.status === "sent",
    skipped: delivery.status === "skipped",
    dedupeKey,
    status: delivery.status,
  };
}

module.exports = {
  escapeHtml,
  depositsVerifiedAmounts,
  renderDepositsVerifiedMessage,
  emailApplicantApplicationReceived,
  emailApplicantDepositsVerified,
  notifyMemberPortalDepositsVerified,
  findDepositsVerifiedNotice,
  noticeHasVerifiedAmounts,
  rewriteDepositsVerifiedNotice,
  sendDepositsVerifiedCorrectionEmail,
};
