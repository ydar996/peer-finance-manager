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
  const branding = organizationBranding();
  const greeting = memberName || "Applicant";
  const subject = `${branding.name}: We Received Your Membership Application`;
  const text =
    `Hello ${greeting},\n\n` +
    `Welcome to ${branding.name}. We received your membership application.\n\n` +
    `Once we verify your deposits, you will receive another email with the details of the transaction.\n\n` +
    `Thank you for applying.\n`;
  const html =
    `<p>Hello ${escapeHtml(greeting)},</p>` +
    `<p>Welcome to ${escapeHtml(branding.name)}. We received your membership application.</p>` +
    `<p>Once we verify your deposits, you will receive another email with the details of the transaction.</p>` +
    `<p>Thank you for applying.</p>`;
  return sendEmail({ to, subject, text, html });
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
  const branding = organizationBranding();
  const greeting = memberName || "Member";
  const feeLabel = formatMoney(feeAmount);
  const contributionLabel = formatMoney(contributionAmount);
  const subject = `${branding.name}: Your Deposits Have Been Verified`;
  const text =
    `Hello ${greeting},\n\n` +
    `Your membership fee (${feeLabel}) and initial contribution (${contributionLabel}) have been verified for ${branding.name}.\n\n` +
    `Please sign in to the member portal to check your balances and continue using the portal going forward.\n` +
    `${branding.portalUrl}\n`;
  const html =
    `<p>Hello ${escapeHtml(greeting)},</p>` +
    `<p>Your membership fee (${escapeHtml(feeLabel)}) and initial contribution (${escapeHtml(contributionLabel)}) have been verified for ${escapeHtml(branding.name)}.</p>` +
    `<p>Please sign in to the member portal to check your balances and continue using the portal going forward.</p>` +
    `<p><a href="${escapeHtml(branding.portalUrl)}">${escapeHtml(branding.portalUrl)}</a></p>`;
  return sendEmail({ to, subject, text, html });
}

function notifyMemberPortalDepositsVerified({ memberId, memberName }) {
  const { postMemberSystemNotice } = require("./messaging-service");
  const branding = organizationBranding();
  const greeting = memberName || "Member";
  const feeLabel = formatMoney(MEMBERSHIP_FEE);
  const contributionLabel = formatMoney(INITIAL_MEMBERSHIP_CONTRIBUTION);
  return postMemberSystemNotice({
    memberId,
    subject: "Your Deposits Have Been Verified",
    body:
      `<p>Hello ${escapeHtml(greeting)},</p>` +
      `<p>Your membership fee (${escapeHtml(feeLabel)}) and initial contribution (${escapeHtml(contributionLabel)}) have been verified.</p>` +
      `<p>Please check your balances in this portal and continue to use it going forward.</p>` +
      `<p><a href="${escapeHtml(branding.portalUrl)}">Open Member Portal</a></p>`,
  });
}

module.exports = {
  emailApplicantApplicationReceived,
  emailApplicantDepositsVerified,
  notifyMemberPortalDepositsVerified,
};
