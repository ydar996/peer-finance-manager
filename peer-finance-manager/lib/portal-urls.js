const { getOrgSlugOrNull } = require("./org-context");

function publicSiteOrigin() {
  const origins = process.env.ALLOWED_ORIGINS;
  if (origins) {
    const first = origins.split(",")[0].trim();
    if (first) return first.replace(/\/$/, "");
  }
  return "https://peer-finance-manager.netlify.app";
}

function appendOrgQuery(url, slug) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!url || !normalized) return url;
  if (/[?&](?:org|organizationSlug)=/i.test(url)) return url;
  const hashIndex = url.indexOf("#");
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const sep = withoutHash.includes("?") ? "&" : "?";
  return `${withoutHash}${sep}org=${encodeURIComponent(normalized)}${hash}`;
}

function getMemberPortalLoginUrl(slug = getOrgSlugOrNull()) {
  const base = process.env.MEMBER_PORTAL_URL
    ? process.env.MEMBER_PORTAL_URL.replace(/\/$/, "")
    : `${publicSiteOrigin()}/member`;
  return appendOrgQuery(base, slug);
}

module.exports = {
  publicSiteOrigin,
  appendOrgQuery,
  getMemberPortalLoginUrl,
};
