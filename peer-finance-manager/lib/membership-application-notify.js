/**
 * Applicant emails and portal notices for the membership application lifecycle.
 */
const { sendEmail, isEmailConfigured } = require("./email-service");
const { getOrgSlugOrNull } = require("./org-context");
const { getMemberPortalLoginUrl } = require("./portal-urls");
const { formatMoney } = require("./money-format");
const { MEMBERSHIP_FEE, INITIAL_MEMBERSHIP_CONTRIBUTION } = require("./constants");

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
  feeAmount = MEMBERSHIP_FEE,
  contributionAmount = INITIAL_MEMBERSHIP_CONTRIBUTION,
} = {}) {
  if (!isEmailConfigured()) {
    return { sent: false, skipped: true, reason: "not_configured" };
  }
  if (!to) {
    return { sent: false, skipped: true, reason: "no_email" };
  }
  const { renderAutomatedEmail } = require("./automated-message-service");
  const branding = organizationBranding();
  const greeting = memberName || "Member";
  const message = renderAutomatedEmail("deposits_verified", {
    memberName: greeting,
    orgName: branding.name,
    portalUrl: branding.portalUrl,
    feeAmount: formatMoney(feeAmount),
    contributionAmount: formatMoney(contributionAmount),
  });
  return sendEmail({ to, subject: message.subject, text: message.text, html: message.html });
}

function notifyMemberPortalDepositsVerified({ memberId, memberName }) {
  const { renderAutomatedEmail } = require("./automated-message-service");
  const { postMemberSystemNotice } = require("./messaging-service");
  const branding = organizationBranding();
  const greeting = memberName || "Member";
  const message = renderAutomatedEmail("deposits_verified", {
    memberName: greeting,
    orgName: branding.name,
    portalUrl: branding.portalUrl,
    feeAmount: formatMoney(MEMBERSHIP_FEE),
    contributionAmount: formatMoney(INITIAL_MEMBERSHIP_CONTRIBUTION),
  });
  return postMemberSystemNotice({
    memberId,
    subject: message.subject.replace(`${branding.name}: `, ""),
    body: message.html,
  });
}

module.exports = {
  emailApplicantApplicationReceived,
  emailApplicantDepositsVerified,
  notifyMemberPortalDepositsVerified,
};
