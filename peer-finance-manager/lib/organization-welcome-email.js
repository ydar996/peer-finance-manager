/**
 * Organization administrator welcome email.
 * Sent once when a Cooperative registers, and on demand from Platform Admin.
 * Recorded in the Cooperative Email Notices audit like other automated mail.
 */
const { sendEmail, isEmailConfigured } = require("./email-service");
const { renderAutomatedEmail } = require("./automated-message-service");
const { recordDeliveryBatch } = require("./email-audit-service");
const { runWithOrg } = require("./org-context");
const { getMemberPortalLoginUrl, publicSiteOrigin, appendOrgQuery } = require("./portal-urls");
const { getCountryProfileByCode } = require("./country-profile");

function adminSignInUrl(slug) {
  return appendOrgQuery(`${publicSiteOrigin()}/admin`, slug);
}

async function sendOrganizationAdminWelcomeEmail({
  slug,
  organizationName,
  countryCode,
  adminEmail,
  adminDisplayName,
  dedupeKey,
} = {}) {
  const normalizedSlug = String(slug || "").trim().toLowerCase();
  const to = String(adminEmail || "").trim().toLowerCase();
  if (!normalizedSlug) return { sent: false, skipped: true, reason: "no_organization" };
  if (!to || !to.includes("@")) return { sent: false, skipped: true, reason: "no_email" };

  const key = dedupeKey || `organization-admin-welcome:${normalizedSlug}`;

  return runWithOrg(normalizedSlug, async () => {
    const profile = getCountryProfileByCode(countryCode);
    const message = renderAutomatedEmail("organization_admin_welcome", {
      orgName: organizationName || "Your Cooperative",
      organizationCode: normalizedSlug,
      adminName: adminDisplayName || "Administrator",
      adminEmail: to,
      adminSignInUrl: adminSignInUrl(normalizedSlug),
      memberSignInUrl: getMemberPortalLoginUrl(normalizedSlug),
      countryName: profile.name,
      currency: profile.currency,
    });

    let delivery = { status: "skipped", errorMessage: "not_configured" };
    if (isEmailConfigured()) {
      try {
        const result = await sendEmail({
          to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        delivery =
          result?.sent === false
            ? {
                status: "failed",
                errorMessage: result?.error || result?.reason || "send_failed",
              }
            : { status: "sent", errorMessage: null };
      } catch (err) {
        delivery = { status: "failed", errorMessage: err.message };
      }
    }

    try {
      recordDeliveryBatch({
        triggerType: "organization_admin_welcome",
        dedupeKey: key,
        subject: message.subject,
        deliveries: [
          {
            memberName: adminDisplayName || null,
            email: to,
            subject: message.subject,
            bodyText: message.text,
            bodyHtml: message.html,
            status: delivery.status,
            errorMessage: delivery.errorMessage,
          },
        ],
      });
    } catch (_) {
      /* audit is best-effort; never block the send result */
    }

    return {
      sent: delivery.status === "sent",
      skipped: delivery.status === "skipped",
      status: delivery.status,
      to,
      subject: message.subject,
      error: delivery.errorMessage,
      dedupeKey: key,
    };
  });
}

module.exports = { sendOrganizationAdminWelcomeEmail, adminSignInUrl };
