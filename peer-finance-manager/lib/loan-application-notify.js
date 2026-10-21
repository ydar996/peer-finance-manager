/**
 * Email + portal notices for loan application terms and approval.
 */
const { sendEmail, isEmailConfigured } = require("./email-service");
const { getOrgSlugOrNull } = require("./org-context");
const { getMemberPortalLoginUrl } = require("./portal-urls");
const { formatMoney } = require("./money-format");
const { formatCooperativeDate } = require("./cooperative-date-format");
const { recordDeliveryBatch } = require("./email-audit-service");
const { renderAutomatedEmail } = require("./automated-message-service");
const { postMemberNoticeFromAutomatedEmail } = require("./messaging-service");

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

function formatRatePercent(annualRate) {
  const pct = Math.round(Number(annualRate || 0) * 10000) / 100;
  return String(pct).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatScheduleText(schedule = []) {
  return (schedule || [])
    .map((row) => {
      const due = formatCooperativeDate(row.dueDate) || row.dueDate;
      return `${due}    ${formatMoney(row.totalDue)}`;
    })
    .join("\n");
}

function formatScheduleHtml(schedule = []) {
  const { escapeHtml } = require("./markdown-lite");
  const rows = (schedule || [])
    .map((row) => {
      const due = formatCooperativeDate(row.dueDate) || row.dueDate || "";
      return `<tr><td>${escapeHtml(due)}</td><td>${escapeHtml(formatMoney(row.totalDue))}</td></tr>`;
    })
    .join("");
  return `<table><thead><tr><th>Due Date</th><th>Payment</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buildPortalTermsHtml({ memberName, terms }) {
  const { escapeHtml } = require("./markdown-lite");
  const name = escapeHtml(memberName || "Member");
  const rate = escapeHtml(formatRatePercent(terms.annualRate));
  return [
    `<p>Hello ${name},</p>`,
    `<p>Your Cooperative has prepared repayment terms for your loan application.</p>`,
    `<p><strong>Principal:</strong> ${escapeHtml(formatMoney(terms.principal))}<br>`,
    `<strong>Annual Interest Rate:</strong> ${rate}%<br>`,
    `<strong>Term:</strong> ${escapeHtml(String(terms.termMonths))} Months<br>`,
    `<strong>Monthly Payment:</strong> ${escapeHtml(formatMoney(terms.monthlyPayment))}</p>`,
    `<p><strong>Repayment Schedule</strong></p>`,
    formatScheduleHtml(terms.schedule),
    `<p>Use Accept Terms or Reject Terms below.</p>`,
  ].join("");
}

function lookupMemberContact(memberId) {
  const { getDb } = require("../db/database");
  const id = Number(memberId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT m.id AS memberId,
                COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName,
                mp.email AS profileEmail,
                u.email AS loginEmail
         FROM members m
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         LEFT JOIN users u ON u.member_id = m.id AND u.role = 'member'
         WHERE m.id = ?
         LIMIT 1`
      )
      .get(id) || null
  );
}

function usableEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email.includes("@") || email.endsWith(".local")) return null;
  return email;
}

async function sendLoanApplicationNotice({
  triggerType,
  memberId,
  message,
  dedupeKey,
  portalHtml = null,
}) {
  const contact = lookupMemberContact(memberId) || {};
  const email = usableEmail(contact.profileEmail) || usableEmail(contact.loginEmail);
  const portal = postMemberNoticeFromAutomatedEmail({
    memberId,
    message: {
      subject: message.subject,
      html: portalHtml || message.html,
      text: message.text,
    },
  });
  let status = portal?.created ? "sent" : "skipped";
  let errorMessage = portal?.created ? null : portal?.reason || portal?.error || null;
  if (email && isEmailConfigured()) {
    try {
      const result = await sendEmail({
        to: email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      if (result?.sent) {
        status = "sent";
        errorMessage = portal?.created ? null : errorMessage;
      } else if (!portal?.created) {
        status = "skipped";
        errorMessage = result?.reason || "not_sent";
      } else {
        errorMessage = result?.reason || "portal_only";
      }
    } catch (err) {
      if (!portal?.created) {
        status = "failed";
        errorMessage = err.message;
      } else {
        errorMessage = err.message;
      }
    }
  } else if (portal?.created) {
    errorMessage = email ? "portal_only:not_configured" : "portal_only";
  } else if (!email) {
    errorMessage = "no_email";
  } else {
    errorMessage = "not_configured";
  }

  try {
    recordDeliveryBatch({
      triggerType,
      dedupeKey,
      subject: message.subject,
      deliveries: [
        {
          memberId,
          memberName: contact.memberName || "Member",
          email: email || "none",
          subject: message.subject,
          bodyText: message.text,
          bodyHtml: message.html,
          status,
          errorMessage,
        },
      ],
    });
  } catch (_) {
    /* audit is best-effort */
  }

  return { portalPosted: Boolean(portal?.created), emailStatus: status };
}

async function notifyLoanTermsOffered({ memberId, terms, applicationId }) {
  const contact = lookupMemberContact(memberId);
  const branding = organizationBranding();
  const firstDue = terms?.schedule?.[0]?.dueDate || terms?.startDate;
  const message = renderAutomatedEmail("loan_terms_offered", {
    memberName: contact?.memberName || "Member",
    orgName: branding.name,
    portalUrl: branding.portalUrl,
    principal: formatMoney(terms.principal),
    annualRatePercent: formatRatePercent(terms.annualRate),
    termMonths: String(terms.termMonths),
    monthlyPayment: formatMoney(terms.monthlyPayment),
    startDate: formatCooperativeDate(firstDue) || firstDue || "",
    scheduleText: formatScheduleText(terms.schedule),
  });
  return sendLoanApplicationNotice({
    triggerType: "loan_terms_offered",
    memberId,
    message,
    portalHtml: buildPortalTermsHtml({
      memberName: contact?.memberName || "Member",
      terms,
    }),
    dedupeKey: `loan-terms:${applicationId}:${terms.offeredAt || Date.now()}`,
  });
}

async function notifyLoanApplicationApproved({ memberId, terms, applicationId, loanId }) {
  const contact = lookupMemberContact(memberId);
  const branding = organizationBranding();
  const message = renderAutomatedEmail("loan_application_approved", {
    memberName: contact?.memberName || "Member",
    orgName: branding.name,
    portalUrl: branding.portalUrl,
    principal: formatMoney(terms.principal),
    termMonths: String(terms.termMonths),
    monthlyPayment: formatMoney(terms.monthlyPayment),
  });
  return sendLoanApplicationNotice({
    triggerType: "loan_application_approved",
    memberId,
    message,
    dedupeKey: `loan-approved:${applicationId}:${loanId}`,
  });
}

module.exports = {
  formatScheduleText,
  formatScheduleHtml,
  buildPortalTermsHtml,
  notifyLoanTermsOffered,
  notifyLoanApplicationApproved,
};
