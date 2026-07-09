const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const PLACEHOLDER_PHOTO = "/placeholder-avatar.svg";
const SESSION_KEY = "pfm_session";
const PLATFORM_SESSION_KEY = "pfm_platform_session";
const ORG_SLUG_KEY = "pfm_org_slug";
const DEFAULT_ORG_SLUG = "assurance";
let sessionToken = localStorage.getItem(SESSION_KEY) || "";
let platformToken = localStorage.getItem(PLATFORM_SESSION_KEY) || "";
let currentUser = null;
let platformUser = null;
let cooperativeTimezone = "America/Los_Angeles";
let timezoneOptionsLoaded = false;

function coopCopy(text) {
  if (text == null || text === "") return text;
  return String(text)
    .replace(/\bcooperatives\b(?![-])/g, "Cooperatives")
    .replace(/\bcooperative\b(?![-])/g, "Cooperative");
}

const TIMEZONE_SELECT_PRIORITY = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Africa/Lagos",
];

let activeTab = null;
let selectedMemberId = null;
let pendingAccountPanel = null;
let loadedProfileMemberId = null;
let membersListRequestId = 0;
let membersListCache = [];
let memberSearchQuery = "";
let profileRequestId = 0;
let bookDetailRequestId = 0;
let activeBookDetail = null;
let activeBookDetailSlug = null;
let booksRequestId = 0;
let loansRequestId = 0;
let loanDetailRequestId = 0;
let myAccountRequestId = 0;
let recordTabRequestId = 0;
let profileFormRequestId = 0;
let statementInspectRequestId = 0;

function applyCooperativeTimezone(timeZone) {
  cooperativeTimezone = timeZone || "America/Los_Angeles";
}

function populateTimezoneSelect(select, timezones, selected) {
  if (!select) return;
  const entries = (timezones || []).map((row) =>
    typeof row === "string" ? { id: row, label: row.replace(/_/g, " ") } : row
  );
  if (!entries.length) return;

  if (select.dataset.populated !== "1") {
    select.innerHTML = "";
    const ids = new Set(entries.map((row) => row.id));
    const appendOption = (parent, row) => {
      const opt = document.createElement("option");
      opt.value = row.id;
      opt.textContent = row.label || row.id.replace(/_/g, " ");
      parent.appendChild(opt);
    };

    for (const id of TIMEZONE_SELECT_PRIORITY) {
      if (!ids.has(id)) continue;
      appendOption(select, entries.find((row) => row.id === id));
    }

    const rest = entries
      .filter((row) => !TIMEZONE_SELECT_PRIORITY.includes(row.id))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (rest.length) {
      const group = document.createElement("optgroup");
      group.label = "All time zones";
      rest.forEach((row) => appendOption(group, row));
      select.appendChild(group);
    }
    select.dataset.populated = "1";
  }

  if (selected) {
    const hasOption = [...select.options].some((opt) => opt.value === selected);
    if (!hasOption) {
      const opt = document.createElement("option");
      opt.value = selected;
      opt.textContent = selected.replace(/_/g, " ");
      select.insertBefore(opt, select.firstChild);
    }
    select.value = selected;
  }
}

async function ensureTimezoneOptions(selected) {
  const select = $("#cooperativeTimezone");
  if (!select || (timezoneOptionsLoaded && select.dataset.populated === "1")) {
    if (selected) populateTimezoneSelect(select, [], selected);
    return;
  }
  const res = await fetch("/api/settings/timezones");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load time zones");
  populateTimezoneSelect(select, data.timezones, selected || data.cooperativeTimezone);
  applyCooperativeTimezone(selected || data.cooperativeTimezone);
  timezoneOptionsLoaded = true;
}

function setButtonBusy(button, busy, busyLabel = "Loading…") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.busyLabel) button.dataset.busyLabel = button.textContent;
    button.disabled = true;
    button.textContent = busyLabel;
  } else {
    button.disabled = false;
    if (button.dataset.busyLabel) {
      button.textContent = button.dataset.busyLabel;
      delete button.dataset.busyLabel;
    }
  }
}

const nativeFetch = window.fetch.bind(window);
window.fetch = function patchedFetch(url, options = {}) {
  const path = typeof url === "string" ? url : url?.url || "";
  if (
    path.startsWith("/api/") &&
    !path.startsWith("/api/auth/login") &&
    !path.startsWith("/api/platform/auth/login")
  ) {
    const headers = new Headers(options.headers || {});
    if (path.startsWith("/api/platform/") && platformToken) {
      headers.set("Authorization", `Bearer ${platformToken}`);
    } else if (sessionToken && !path.startsWith("/api/platform/")) {
      headers.set("Authorization", `Bearer ${sessionToken}`);
    }
    return nativeFetch(url, { ...options, headers });
  }
  return nativeFetch(url, options);
};

function getPublicPageInfo() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const match = path.match(/^\/c\/([^/]+)\/(about|bylaws)$/i);
  if (!match) return null;
  return { slug: decodeURIComponent(match[1]).toLowerCase(), page: match[2].toLowerCase() };
}

function isPublicPagePath() {
  return !!getPublicPageInfo();
}

function getPortalFromPath() {
  const publicInfo = getPublicPageInfo();
  if (publicInfo) return publicInfo.page === "bylaws" ? "public-bylaws" : "public-about";
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/register") return "register";
  if (path === "/platform") return "platform";
  if (path === "/admin") return "admin";
  if (path === "/staff") return "staff";
  return "member";
}

const APP_NAME = "Peer Finance Manager";

function applyAppBranding() {
  document.querySelectorAll(".org-brand").forEach((el) => {
    el.textContent = APP_NAME;
  });
}

function applyOrganizationBranding(organizationName) {
  applyAppBranding();

  const orgName = String(organizationName || "").trim();
  const appSubtitle = $("#appOrgSubtitle");
  if (appSubtitle) {
    appSubtitle.textContent = orgName
      ? `${orgName} : Cooperative Asset Management : Member Contributions Accounts, Loan Accounts, and Books`
      : "Cooperative Asset Management : Member Contributions Accounts, Loan Accounts, and Books";
  }

  document.querySelectorAll(".org-cooperative-name").forEach((el) => {
    if (orgName) {
      el.textContent = orgName;
      el.classList.remove("hidden");
    } else {
      el.textContent = "";
      el.classList.add("hidden");
    }
  });
}

function rememberOrgSlug(slug) {
  if (slug) localStorage.setItem(ORG_SLUG_KEY, slug);
}

function preferredOrgSlug() {
  return localStorage.getItem(ORG_SLUG_KEY) || DEFAULT_ORG_SLUG;
}

function fillOrgSlugInputs(slug = preferredOrgSlug()) {
  document.querySelectorAll(".org-slug-input").forEach((input) => {
    if (!input.value) input.value = slug;
  });
  refreshOrganizationPreview(slug);
}

async function refreshPublicOrgLinks(slug) {
  const normalized = String(slug || "").trim().toLowerCase();
  const containers = document.querySelectorAll(".public-org-links, #memberPublicLinks");
  if (!normalized) {
    containers.forEach((el) => el.classList.add("hidden"));
    return;
  }
  try {
    const res = await nativeFetch(`/api/public/organizations/${encodeURIComponent(normalized)}`);
    const data = await res.json();
    if (!res.ok) {
      containers.forEach((el) => el.classList.add("hidden"));
      return;
    }
    document.querySelectorAll(".public-about-link").forEach((link) => {
      link.href = data.publicAboutUrl || `/c/${encodeURIComponent(normalized)}/about`;
      link.classList.toggle("hidden", !data.aboutAvailable);
    });
    document.querySelectorAll(".public-bylaws-link").forEach((link) => {
      link.href = data.publicBylawsUrl || `/c/${encodeURIComponent(normalized)}/bylaws`;
      link.classList.toggle("hidden", !data.bylawsAvailable);
    });
    document.querySelectorAll(".public-apply-link").forEach((link) => {
      link.href = data.publicApplyUrl
        ? data.publicApplyUrl + (data.publicApplyUrl.includes("?") ? "" : "?from=about")
        : `/c/${encodeURIComponent(normalized)}/apply?from=about`;
      link.classList.toggle("hidden", !data.applyAvailable);
    });
    document.querySelectorAll(".public-apply-sep").forEach((el) => {
      el.classList.toggle("hidden", !data.applyAvailable);
    });
    containers.forEach((el) => {
      el.classList.toggle(
        "hidden",
        !data.aboutAvailable && !data.bylawsAvailable && !data.applyAvailable
      );
    });
  } catch (_) {
    containers.forEach((el) => el.classList.add("hidden"));
  }
}

async function refreshOrganizationPreview(slug) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) {
    applyOrganizationBranding(null);
    await refreshPublicOrgLinks("");
    return;
  }
  try {
    const res = await nativeFetch(`/api/organizations/lookup?slug=${encodeURIComponent(normalized)}`);
    const data = await res.json();
    if (res.ok) applyOrganizationBranding(data.organization.name);
    else applyOrganizationBranding(null);
  } catch (_) {
    applyOrganizationBranding(null);
  }
  await refreshPublicOrgLinks(normalized);
}

function userMatchesPortal(user, portal) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (portal === "admin") return user.role === "admin";
  if (portal === "staff") return user.role === "staff";
  if (portal === "member") return user.role === "member";
  return false;
}

function hideAllScreens() {
  $("#loginScreenMember")?.classList.add("hidden");
  $("#loginScreenStaff")?.classList.add("hidden");
  $("#loginScreenAdmin")?.classList.add("hidden");
  $("#loginScreenPlatform")?.classList.add("hidden");
  $("#registerScreen")?.classList.add("hidden");
  $("#changePasswordScreen")?.classList.add("hidden");
  $("#membershipApplyScreen")?.classList.add("hidden");
  $("#appShell")?.classList.add("hidden");
  $("#platformShell")?.classList.add("hidden");
  $("#publicShell")?.classList.add("hidden");
}

function showLoginForPortal(portal = getPortalFromPath(), message = "") {
  if (portal === "register") {
    hideAllScreens();
    $("#registerScreen")?.classList.remove("hidden");
    return;
  }
  hideAllScreens();
  const screenId =
    portal === "platform"
      ? "loginScreenPlatform"
      : portal === "admin"
        ? "loginScreenAdmin"
        : portal === "staff"
          ? "loginScreenStaff"
          : "loginScreenMember";
  $(`#${screenId}`)?.classList.remove("hidden");
  const status = document.querySelector(`[data-login-status="${portal}"]`);
  if (status && message) setFormStatus(status, message, false);
  else if (status) status.textContent = "";
  fillOrgSlugInputs();
}

function showChangePassword() {
  hideAllScreens();
  $("#changePasswordScreen")?.classList.remove("hidden");
}

function showApp() {
  hideAllScreens();
  $("#appShell")?.classList.remove("hidden");
  if (currentUser?.organizationName) applyOrganizationBranding(currentUser.organizationName);
  if (currentUser?.organizationSlug) refreshPublicOrgLinks(currentUser.organizationSlug);
}

function showPublicShell() {
  hideAllScreens();
  $("#publicShell")?.classList.remove("hidden");
}

function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "staff") return "Staff (Read-Only)";
  if (role === "member") return "Member";
  return role;
}

function applyRoleUi() {
  const role = currentUser?.role || "";
  document.querySelectorAll("#mainTabs .tab").forEach((tab) => {
    const roles = (tab.dataset.roles || "").split(",").map((r) => r.trim());
    tab.classList.toggle("hidden", !roles.includes(role));
  });

  let banner = $("#readonlyBanner");
  if (role === "staff") {
    if (!banner) {
      banner = document.createElement("p");
      banner.id = "readonlyBanner";
      banner.className = "readonly-banner";
      banner.textContent =
        "You Are Signed In With a Read-Only Staff Account. Contact the Administrator to Record Changes.";
      $("#mainTabs")?.insertAdjacentElement("afterend", banner);
    }
  } else if (banner) {
    banner.remove();
  }

  const sessionUser = $("#sessionUser");
  if (sessionUser && currentUser) {
    sessionUser.textContent = `${currentUser.displayName || currentUser.email} · ${roleLabel(currentUser.role)}`;
  }

  if (role === "member") switchTab("my-account");
  else if (role === "admin" || role === "staff") switchTab("books");

  $("#appShell")?.classList.toggle("member-portal", role === "member");

  const registerBtn = $("#goRegisterMemberBtn");
  if (registerBtn) registerBtn.classList.toggle("hidden", role !== "admin");

  document.querySelectorAll(".admin-only-report-settings").forEach((el) => {
    el.classList.toggle("hidden", role !== "admin");
  });
}

async function restoreSession() {
  const portal = getPortalFromPath();
  if (portal === "register") {
    showLoginForPortal("register");
    return false;
  }
  if (!sessionToken) {
    showLoginForPortal(portal);
    return false;
  }
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Session expired");
    currentUser = data.user;
    applyCooperativeTimezone(data.cooperativeTimezone);
    if (!userMatchesPortal(currentUser, portal)) {
      sessionToken = "";
      localStorage.removeItem(SESSION_KEY);
      showLoginForPortal(portal, "Sign In With the Correct Account for This Page.");
      return false;
    }
    if (currentUser.mustChangePassword) {
      showChangePassword();
      return false;
    }
    showApp();
    applyRoleUi();
    return true;
  } catch (err) {
    sessionToken = "";
    localStorage.removeItem(SESSION_KEY);
    showLoginForPortal(portal, err.message);
    return false;
  }
}

function formatSaasPricingLine(pricing, stripeConfigured) {
  if (!pricing) return "";
  const stripeNote = stripeConfigured
    ? "Stripe: configured"
    : "Stripe: not configured : see STRIPE-SETUP.md";
  return `SaaS pricing: $${pricing.monthlyPriceUsd.toFixed(2)}/month, $${pricing.quarterlyPriceUsd.toFixed(2)}/quarter (${pricing.quarterlyDiscountPercent}% off 3 months), or $${pricing.annualPriceUsd.toFixed(2)}/year (${pricing.annualDiscountPercent}% off). ${stripeNote}.`;
}

function updateSubscriptionPayButtons(pricing) {
  if (!pricing) return;
  const monthlyBtn = $("#payMonthlyStripe");
  const quarterlyBtn = $("#payQuarterlyStripe");
  const annualBtn = $("#payAnnualStripe");
  if (monthlyBtn) {
    monthlyBtn.textContent = `Pay Monthly ($${pricing.monthlyPriceUsd.toFixed(2)})`;
  }
  if (quarterlyBtn) {
    quarterlyBtn.textContent = `Pay Quarterly ($${pricing.quarterlyPriceUsd.toFixed(2)} : ${pricing.quarterlyDiscountPercent}% off)`;
  }
  if (annualBtn) {
    annualBtn.textContent = `Pay Annual ($${pricing.annualPriceUsd.toFixed(2)} : ${pricing.annualDiscountPercent}% off)`;
  }
}

function subscriptionStatusLabel(status) {
  const labels = {
    pending: "Pending",
    active: "Active",
    past_due: "Past Due",
    canceled: "Canceled",
    check_pending: "Check Pending",
  };
  return labels[status] || status || "Unknown";
}

function subscriptionStatusClass(status) {
  if (status === "active") return "subscription-active";
  if (status === "past_due" || status === "pending") return "subscription-warning";
  if (status === "check_pending") return "subscription-info";
  return "subscription-muted";
}

function formatSubscriptionDate(iso) {
  if (!iso) return ":";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: cooperativeTimezone,
    });
  } catch (_) {
    return iso.slice(0, 10);
  }
}

function showPlatformApp() {
  hideAllScreens();
  $("#platformShell")?.classList.remove("hidden");
  const sessionUser = $("#platformSessionUser");
  if (sessionUser && platformUser) {
    sessionUser.textContent = `${platformUser.displayName || platformUser.email} · Platform Admin`;
  }
}

async function restorePlatformSession() {
  if (!platformToken) {
    showLoginForPortal("platform");
    return false;
  }
  try {
    const res = await nativeFetch("/api/platform/auth/me", {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Session expired");
    platformUser = data.user;
    showPlatformApp();
    return true;
  } catch (err) {
    platformToken = "";
    localStorage.removeItem(PLATFORM_SESSION_KEY);
    showLoginForPortal("platform", err.message);
    return false;
  }
}

async function bootstrapPlatformApp() {
  const ok = await restorePlatformSession();
  if (!ok) return;
  await loadPlatformOrganizations();
}

async function loadPlatformOrganizations() {
  const body = $("#platformOrgsBody");
  const statusEl = $("#platformOrgsStatus");
  const pricingEl = $("#platformPricingSummary");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="9">Loading…</td></tr>`;
  if (statusEl) statusEl.textContent = "";
  try {
    const res = await fetch("/api/platform/organizations");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load organizations");
    const pricing = data.pricing;
    if (pricingEl && pricing) {
      pricingEl.textContent = formatSaasPricingLine(pricing, data.stripeConfigured);
    }
    const orgs = data.organizations || [];
    if (!orgs.length) {
      body.innerHTML = `<tr><td colspan="9" class="subtle">No Cooperatives registered yet.</td></tr>`;
      return;
    }
    body.innerHTML = orgs
      .map((org) => {
        const status = org.subscriptionStatus || "pending";
        return `
      <tr>
        <td>${escapeHtml(org.name)}</td>
        <td><code>${escapeHtml(org.slug)}</code></td>
        <td>${org.memberCount ?? ":"}</td>
        <td>${escapeHtml(org.adminEmail || ":")}</td>
        <td><span class="subscription-badge ${subscriptionStatusClass(status)}">${escapeHtml(subscriptionStatusLabel(status))}</span></td>
        <td>${escapeHtml(org.subscriptionPlan || ":")}</td>
        <td>${escapeHtml(formatSubscriptionDate(org.subscriptionCurrentPeriodEnd))}</td>
        <td>${escapeHtml(formatSubscriptionDate(org.subscriptionGraceUntil))}</td>
        <td class="platform-org-actions">
          <button type="button" class="btn btn-small" data-platform-action="extend-grace" data-slug="${escapeHtml(org.slug)}">+15 Days Grace</button>
          <button type="button" class="btn btn-small" data-platform-action="grant-legacy" data-slug="${escapeHtml(org.slug)}">Grant Legacy</button>
          <button type="button" class="btn btn-small" data-platform-action="cancel" data-slug="${escapeHtml(org.slug)}">Cancel</button>
        </td>
      </tr>`;
      })
      .join("");
  } catch (err) {
    body.innerHTML = `<tr><td colspan="9" class="status err">${escapeHtml(err.message)}</td></tr>`;
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function platformOrgAction(action, slug) {
  const statusEl = $("#platformOrgsStatus");
  if (action === "extend-grace") {
    const daysStr = prompt(`Extend subscription grace for ${slug} by how many days?`, "15");
    if (daysStr === null) return;
    const days = Number(daysStr);
    if (!Number.isFinite(days) || days < 1) {
      if (statusEl) setFormStatus(statusEl, "Enter a positive number of days.", false);
      return;
    }
    try {
      const res = await fetch(`/api/platform/organizations/${encodeURIComponent(slug)}/extend-grace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extend grace");
      if (statusEl) setFormStatus(statusEl, `Grace extended for ${slug}.`, true);
      await loadPlatformOrganizations();
    } catch (err) {
      if (statusEl) setFormStatus(statusEl, err.message, false);
    }
    return;
  }
  const notes =
    action === "cancel"
      ? prompt(`Cancel subscription for ${slug}? Optional note:`) ?? undefined
      : action === "grant-legacy"
        ? prompt(`Grant legacy active subscription for ${slug}? Optional note:`) ?? undefined
        : undefined;
  if (action === "cancel" && notes === null) return;
  if (action === "grant-legacy" && notes === null) return;
  const path =
    action === "grant-legacy"
      ? `/api/platform/organizations/${encodeURIComponent(slug)}/grant-legacy`
      : `/api/platform/organizations/${encodeURIComponent(slug)}/cancel-subscription`;
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Action failed");
    if (statusEl) setFormStatus(statusEl, `Updated ${slug}.`, true);
    await loadPlatformOrganizations();
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function loadPlatformSubscriptionPanel() {
  const panel = $("#platformSubscriptionPanel");
  const badge = $("#platformSubscriptionBadge");
  const summary = $("#platformSubscriptionSummary");
  const statusEl = $("#platformSubscriptionStatus");
  const checkBox = $("#platformCheckInstructions");
  const portalBtn = $("#openStripePortal");
  if (!panel) return;
  panel.classList.remove("hidden");
  if (badge) badge.textContent = "Loading…";
  try {
    const res = await fetch("/api/billing/subscription");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load subscription");
    const sub = data.subscription;
    const status = sub.subscriptionStatus || "pending";
    if (badge) {
      if (sub.inGracePeriod && !sub.active) {
        badge.textContent = `Grace (${sub.graceDaysRemaining}d left)`;
        badge.className = "badge subscription-info";
      } else {
        badge.textContent = subscriptionStatusLabel(status);
        badge.className = `badge ${subscriptionStatusClass(status)}`;
      }
    }
    if (summary) {
      updateSubscriptionPayButtons(sub.pricing);
      let accessNote = "";
      if (sub.inGracePeriod && !sub.active) {
        accessNote = `<p class="subscription-grace-banner">Full access continues through <strong>${escapeHtml(formatSubscriptionDate(sub.subscriptionGraceUntil))}</strong> (${sub.graceDaysRemaining} day(s) remaining). You may pay now or before that date : restricted access begins after the grace period unless subscription is active.</p>`;
      } else if (!sub.active) {
        accessNote = `<p class="subscription-banner">An active subscription is required to record changes in Cooperative Books. Pay below or contact the platform administrator.</p>`;
      }
      summary.innerHTML = `
        <p><strong>Status:</strong> ${escapeHtml(subscriptionStatusLabel(status))}</p>
        <p><strong>Plan:</strong> ${escapeHtml(sub.subscriptionPlan || "Not selected")}</p>
        <p><strong>Payment method:</strong> ${escapeHtml(sub.paymentMethod || ":")}</p>
        <p><strong>Current period ends:</strong> ${escapeHtml(formatSubscriptionDate(sub.subscriptionCurrentPeriodEnd))}</p>
        <p><strong>Monthly:</strong> $${sub.pricing.monthlyPriceUsd.toFixed(2)} · <strong>Quarterly:</strong> $${sub.pricing.quarterlyPriceUsd.toFixed(2)} (${sub.pricing.quarterlyDiscountPercent}% off) · <strong>Annual:</strong> $${sub.pricing.annualPriceUsd.toFixed(2)} (${sub.pricing.annualDiscountPercent}% off)</p>
        ${sub.subscriptionNotes ? `<p class="subtle">${escapeHtml(sub.subscriptionNotes)}</p>` : ""}
        ${accessNote}`;
    }
    if (portalBtn) {
      portalBtn.hidden = !sub.stripeConfigured || !sub.active || sub.paymentMethod !== "stripe";
    }
    if (checkBox) {
      if (status === "check_pending") {
        checkBox.classList.remove("hidden");
        checkBox.innerHTML = `
          <p><strong>Check payment requested.</strong> Mail your check payable to <strong>${escapeHtml(sub.checkPayableTo)}</strong>.</p>
          <p>${escapeHtml(sub.checkMailingAddress)}</p>
          <p class="subtle">Reference: ${escapeHtml(sub.checkPaymentReference || ":")}</p>`;
      } else {
        checkBox.classList.add("hidden");
        checkBox.innerHTML = "";
      }
    }
    if (statusEl) statusEl.textContent = "";
  } catch (err) {
    if (badge) badge.textContent = "Error";
    if (summary) summary.textContent = err.message;
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

function handleBillingReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const billing = params.get("billing");
  if (!billing) return;
  switchTab("subscription");
  const statusEl = $("#platformSubscriptionStatus");
  if (billing === "success") {
    if (statusEl) setFormStatus(statusEl, "Payment received. Subscription will activate shortly.", true);
    loadPlatformSubscriptionPanel();
  } else if (billing === "canceled") {
    if (statusEl) setFormStatus(statusEl, "Checkout canceled.", false);
  }
  params.delete("billing");
  params.delete("session_id");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.replaceState({}, "", next);
}

async function startStripeCheckout(plan) {
  const statusEl = $("#platformSubscriptionStatus");
  if (statusEl) {
    statusEl.textContent = "Opening Stripe checkout…";
    statusEl.className = "status";
  }
  try {
    const res = await fetch("/api/billing/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, billingEmail: currentUser?.email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Checkout failed");
    window.location.href = data.url;
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function openStripeBillingPortal() {
  const statusEl = $("#platformSubscriptionStatus");
  try {
    const res = await fetch("/api/billing/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Portal unavailable");
    window.location.href = data.url;
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function requestTenantCheckPayment() {
  const statusEl = $("#platformSubscriptionStatus");
  const notes = prompt("Optional note for the platform administrator (e.g. check mailed today):") || "";
  try {
    const res = await fetch("/api/billing/check-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, billingEmail: currentUser?.email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    if (statusEl) setFormStatus(statusEl, "Check payment requested. See mailing instructions below.", true);
    await loadPlatformSubscriptionPanel();
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function bootstrapApp() {
  if (!currentUser) {
    const ok = await restoreSession();
    if (!ok) return;
  }
  const role = currentUser?.role;
  if (role === "member") {
    loadMyAccount();
    return;
  }
  loadBooks();
  loadMembers();
  loadLoans();
  loadStatementFiles();
  if (role === "admin") {
    loadRecordTabData();
    loadUsers();
    handleBillingReturnParams();
  }
}

async function loadUsers() {
  const body = $("#usersBody");
  const memberBody = $("#memberCredentialsBody");
  if (!body) return;
  try {
    const [usersRes, credsRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/users/member-credentials"),
    ]);
    const { users } = await usersRes.json();
    const { accounts } = await credsRes.json();

    if (memberBody) {
      if (!accounts?.length) {
        memberBody.innerHTML =
          '<tr><td colspan="4" class="subtle">No Member Portal Accounts Yet. Use Generate Member Credentials.</td></tr>';
      } else {
        memberBody.innerHTML = accounts
          .map(
            (a) => `
          <tr>
            <td>${escapeHtml(a.memberName)}</td>
            <td>${escapeHtml(a.username || ":")}</td>
            <td>${escapeHtml(a.email || ":")}</td>
            <td>${a.mustChangePassword ? "Must Change on First Login" : "Password Set"}</td>
          </tr>`
          )
          .join("");
      }
    }

    if (!users?.length) {
      body.innerHTML = '<tr><td colspan="5" class="subtle">No Accounts Yet</td></tr>';
      return;
    }
    body.innerHTML = users
      .map(
        (u) => `
      <tr>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.username || ":")}</td>
        <td>${escapeHtml(roleLabel(u.role))}</td>
        <td>${escapeHtml(u.memberName || ":")}</td>
        <td>${escapeHtml(u.createdAt || ":")}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="status err">${escapeHtml(err.message)}</td></tr>`;
    if (memberBody) {
      memberBody.innerHTML = `<tr><td colspan="4" class="status err">${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

let myAccountAccordionBound = false;

function bindMyAccountAccordions() {
  if (myAccountAccordionBound) return;
  const panels = document.querySelectorAll(".my-account-panel");
  if (!panels.length) return;
  myAccountAccordionBound = true;
  panels.forEach((panel) => {
    panel.addEventListener("toggle", () => {
      if (!panel.open) return;
      panels.forEach((other) => {
        if (other !== panel) other.open = false;
      });
    });
  });
}

async function loadMyAccount() {
  const requestId = ++myAccountRequestId;
  const depositBalanceSummary = $("#myDepositBalanceSummary");
  const loanBalanceSummary = $("#myLoanBalanceSummary");
  const depositBody = $("#myDepositBody");
  const loanLots = $("#myLoanLots");
  const refreshBtn = $("#refreshMyAccount");
  bindMyAccountAccordions();
  if (depositBalanceSummary) depositBalanceSummary.textContent = "…";
  if (loanBalanceSummary) loanBalanceSummary.textContent = "…";
  if (depositBody) depositBody.innerHTML = '<tr><td colspan="5" class="subtle">Loading…</td></tr>';
  if (loanLots) loanLots.innerHTML = '<p class="subtle">Loading loans…</p>';
  setButtonBusy(refreshBtn, true);
  try {
    const res = await fetch("/api/me/account");
    if (requestId !== myAccountRequestId) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const profile = data.profile;
    renderMyProfileSection(profile);
    await loadMyCooperativeReports();
    await loadMyMeetings();
    await loadMyLoanApplyEmbed();
    if (depositBalanceSummary) depositBalanceSummary.textContent = fmt.format(data.depositBalance || 0);
    if (loanBalanceSummary) loanBalanceSummary.textContent = fmt.format(data.loanSummary?.outstanding || 0);

    const depositTypes = DEPOSIT_LEDGER_TYPES;
    const depositRows = withDepositRunningBalances(
      (data.depositTransactions || []).filter((t) => depositTypes.has(t.type))
    );
    depositBody.innerHTML = depositRows.length
      ? depositRows
          .map(
            (t) => `
        <tr>
          <td class="col-date">${escapeHtml(formatDate(t.transaction_date))}</td>
          <td class="col-type">${escapeHtml(formatTxType(t.type))}</td>
          <td class="money">${fmt.format(t.amount)}</td>
          <td class="money">${fmt.format(t.balance_after ?? 0)}</td>
          <td class="col-description">${escapeHtml(t.description || "")}</td>
        </tr>`
          )
          .join("")
      : '<tr><td colspan="5" class="subtle">No Contributions Account Activity</td></tr>';

    const monthSelect = $("#myDepositStatementMonth");
    if (monthSelect) {
      const months =
        data.statementMonths?.length
          ? data.statementMonths
          : statementMonthsFromDates(depositRows.map((t) => t.transaction_date));
      monthSelect.innerHTML = months.length
        ? months
            .map(
              (m) =>
                `<option value="${m.year}-${m.month}">${escapeHtml(m.label)}</option>`
            )
            .join("")
        : '<option value="">No Monthly Statements Available</option>';
      $("#downloadMyDepositStatement").disabled = !months.length;
    }

    const lots = data.loanSummary?.lots || [];
    loanLots.innerHTML = lots.length
      ? lots
          .map((lot) => {
            const activityRows = buildLoanActivityRows(lot);
            const loanMonths = statementMonthsFromDates(activityRows.map((row) => row.date));
            const monthOptions = loanMonths.length
              ? loanMonths
                  .map(
                    (m) =>
                      `<option value="${m.year}-${m.month}">${escapeHtml(m.label)}</option>`
                  )
                  .join("")
              : '<option value="">No Monthly Statements Available</option>';
            const isPaid = lot.status === "paid";
            return `
        <details class="card loan-lot-disclosure profile-disclosure my-loan-card" style="margin-bottom:12px"${isPaid ? "" : " open"}>
          <summary class="loan-lot-summary my-loan-summary">
            <h4>Loan #${lot.loanNumber} · ${escapeHtml(lot.status || "active")}</h4>
            <span class="loan-lot-summary-meta subtle">${isPaid ? "Paid in Full" : `Outstanding ${fmt.format(lot.outstanding)}`}</span>
          </summary>
          <div class="loan-lot-body">
            <div class="panel-head">
              <p class="subtle">Principal ${fmt.format(lot.principal)} · Repaid ${fmt.format(lot.collected || 0)} · Outstanding ${fmt.format(lot.outstanding)}</p>
              <div class="panel-head-actions">
                <select class="statement-select my-loan-statement-month" data-loan-number="${lot.loanNumber}" aria-label="Loan statement month">
                  ${monthOptions}
                </select>
                <button type="button" class="btn primary" data-member-id="${profile.member_id}" data-loan-number="${lot.loanNumber}" data-action="my-loan-statement" ${loanMonths.length ? "" : "disabled"}>
                  Download Monthly Statement
                </button>
              </div>
            </div>
            ${loanScheduleHtml(lot)}
            <div class="table-wrap compact">
              <table class="member-tx-table">
                <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th class="col-description">Description</th></tr></thead>
                <tbody>${accountActivityTableRows(activityRows, { memberPortal: true, formatDates: true })}</tbody>
              </table>
            </div>
          </div>
        </details>`;
          })
          .join("")
      : '<p class="subtle">No Loan Accounts</p>';

    loanLots.querySelectorAll('[data-action="my-loan-statement"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const loanNumber = btn.dataset.loanNumber;
        const monthSelectEl = loanLots.querySelector(
          `.my-loan-statement-month[data-loan-number="${loanNumber}"]`
        );
        const [year, month] = String(monthSelectEl?.value || "").split("-").map(Number);
        downloadLoanStatement(btn.dataset.memberId, loanNumber, btn, { year, month }).catch((err) =>
          alert(err.message)
        );
      });
    });
  } catch (err) {
    if (requestId !== myAccountRequestId) return;
    if (depositBalanceSummary) depositBalanceSummary.textContent = ":";
    if (loanBalanceSummary) loanBalanceSummary.textContent = ":";
    if (depositBody) depositBody.innerHTML = `<tr><td colspan="5" class="status err">${escapeHtml(err.message)}</td></tr>`;
    if (loanLots) loanLots.innerHTML = `<p class="status err">${escapeHtml(err.message)}</p>`;
  } finally {
    if (requestId === myAccountRequestId) setButtonBusy(refreshBtn, false);
  }
}


function $(sel) {
  return document.querySelector(sel);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseStoredInstant(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s || /^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (s.includes("T")) {
    const normalized =
      s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatInstantDate(value) {
  const instant = parseStoredInstant(value);
  if (!instant) return null;
  return instant.toLocaleDateString("en-US", {
    timeZone: cooperativeTimezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDate(value) {
  if (!value) return ":";
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`).toLocaleDateString("en-US", {
      timeZone: cooperativeTimezone,
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  const instantLabel = formatInstantDate(s);
  if (instantLabel) return instantLabel;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    timeZone: cooperativeTimezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function switchTab(name, options = {}) {
  const sameTab = activeTab === name;
  closeBookDetail();
  collapseLoanDetails(true);

  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${name}`);
  });

  if (name === "members") resetMemberProfileView();
  if (name === "record" && !sameTab && !options.skipRecordLoad) loadRecordTabData();
  if (name === "users" && currentUser?.role === "admin" && !sameTab) {
    initMemberPickers();
    loadUsers();
  }
  if (name === "my-account" && currentUser?.role === "member" && !sameTab) loadMyAccount();
  if (name === "import" && currentUser?.role === "admin" && !sameTab) loadBankImportPanel();
  if (name === "status-report" && !sameTab) loadMonthlyStatusReportPanel();
  if (name === "meetings" && !sameTab) {
    loadCooperativeMeetingsPanel();
    if (currentUser?.role === "admin") loadEmailSendAudit();
  }
  if (name === "public-pages" && currentUser?.role === "admin" && !sameTab) loadPublicPagesPanel();
  if (name === "forms" && currentUser?.role === "admin" && !sameTab) loadFlexxFormsSettings();
  if (name === "subscription" && currentUser?.role === "admin" && !sameTab) loadPlatformSubscriptionPanel();

  activeTab = name;
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function hideLoanDetailRows(clearContent = false) {
  document.querySelectorAll(".loan-detail-row").forEach((row) => {
    row.classList.add("hidden");
    if (clearContent) {
      const cell = row.querySelector(".loan-detail-cell");
      if (cell) {
        cell.textContent = "Click the loan row to load disbursement and repayment details.";
      }
    }
  });
}

function cancelLoanDetailLoads() {
  loanDetailRequestId += 1;
}

function collapseLoanDetails(clearContent = false) {
  cancelLoanDetailLoads();
  hideLoanDetailRows(clearContent);
}

function resetMemberProfileView() {
  const root = $("#memberDetail");
  if (!root) return;
  root.querySelector("#memberAccountDetail")?.classList.add("hidden");
  root.querySelectorAll(".account-card[data-account-panel]").forEach((card) => {
    card.classList.remove("selected");
    card.setAttribute("aria-expanded", "false");
  });
  root.querySelectorAll("details.profile-disclosure, details.loan-lot-disclosure, details.loan-schedule-disclosure").forEach((el) => {
    el.open = false;
  });
}

function navigateToMemberFromBooks(memberId, accountPanel = "deposit") {
  const membersLoaded = Boolean($("#membersBody")?.querySelector(".member-row"));
  switchTab("members");
  if (membersLoaded) {
    selectMember(memberId, accountPanel);
  } else {
    selectedMemberId = memberId;
    pendingAccountPanel = accountPanel;
    loadMembers();
  }
}

function formatDetailCell(value, format) {
  if (format === "money") return fmt.format(Number(value) || 0);
  if (format === "date") return formatDate(value);
  return escapeHtml(value ?? "");
}

function bookCardHtml(slug, { accent, label, amount, note }) {
  return `
    <button type="button" class="book-card${accent ? " accent" : ""}" data-book-slug="${slug}">
      <p class="book-label">${label}</p>
      <p class="book-amount${typeof amount === "number" ? " money" : ""}">${typeof amount === "number" ? fmt.format(amount) : escapeHtml(amount)}</p>
      ${note ? `<p class="book-note">${note}</p>` : ""}
    </button>`;
}

function dashboardCardHtml(slug, { accent, label, amount, note }) {
  return `
    <button type="button" class="book-card dashboard-card${accent ? " accent" : ""}" data-book-slug="${slug}">
      <p class="book-label">${label}</p>
      <p class="book-amount${typeof amount === "number" ? " money" : ""}">${typeof amount === "number" ? fmt.format(amount) : escapeHtml(amount)}</p>
      ${note ? `<p class="book-note">${note}</p>` : ""}
    </button>`;
}

function formatPctChangeLabel(value) {
  if (value == null) return "new";
  if (value === 0) return "0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function dashboardCardsHtml(dashboard) {
  if (!dashboard) return "";
  const month = dashboard.depositsThisMonth;
  const ytd = dashboard.depositsYtd;
  const due = dashboard.loanRepaymentsDue;
  return [
    dashboardCardHtml("deposits-this-month", {
      accent: true,
      label: `Deposits This Month (${month.monthLabel})`,
      amount: month.total,
      note: "Member contributions recorded this calendar month",
    }),
    dashboardCardHtml("deposits-ytd", {
      label: `Deposits This Year (${ytd.year} YTD)`,
      amount: ytd.total,
      note: `vs ${ytd.lastYear.year} ${fmt.format(ytd.lastYear.total)} (${formatPctChangeLabel(ytd.lastYear.pctChange)}) · vs ${ytd.twoYearsAgo.year} ${fmt.format(ytd.twoYearsAgo.total)} (${formatPctChangeLabel(ytd.twoYearsAgo.pctChange)})`,
    }),
    dashboardCardHtml("loan-repayments-due", {
      label: `Loan Repayments Due (${due.monthLabel})`,
      amount: due.total,
      note:
        due.borrowersStillDue > 0
          ? `${due.borrowersStillDue} borrower${due.borrowersStillDue === 1 ? "" : "s"} still owe scheduled payment${due.borrowersStillDue === 1 ? "" : "s"} this month`
          : "All active borrowers have paid this month’s scheduled amount",
    }),
  ].join("");
}

function closeBookDetail() {
  bookDetailRequestId += 1;
  activeBookDetail = null;
  activeBookDetailSlug = null;
  $("#booksDetailViewTabs")?.classList.add("hidden");
  $("#booksDetail")?.classList.add("hidden");
  $("#booksSummary")?.classList.remove("hidden");
}

function bindBookDetailMemberRows(slug) {
  $("#booksDetailBody")?.querySelectorAll(".detail-member-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest(".detail-expand-toggle")) return;
      const memberId = Number(row.dataset.memberId);
      const panel = slug === "loan-repayments-due" ? "loan" : "deposit";
      navigateToMemberFromBooks(memberId, panel);
    });
  });
}

function bindBookDetailExpandRows() {
  $("#booksDetailBody")?.querySelectorAll(".detail-expand-toggle").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const rowKey = button.dataset.expandTarget;
      const panel = document.querySelector(`tr.detail-expand-panel[data-expand-for="${rowKey}"]`);
      if (!panel) return;
      const expanded = panel.classList.toggle("hidden");
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
      button.textContent = expanded ? "▸" : "▾";
    });
  });
}

function renderBookDetailTable(view, slug) {
  const head = $("#booksDetailHead");
  const body = $("#booksDetailBody");
  if (!head || !body) return;

  head.innerHTML = `<tr>${view.columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}</tr>`;

  if (!view.rows.length) {
    body.innerHTML = `<tr><td colspan="${view.columns.length}">${escapeHtml(view.emptyMessage || "No Records")}</td></tr>`;
    return;
  }

  if (view.expandable) {
    const childColspan = view.childColumns.length;
    body.innerHTML = view.rows
      .map((row, index) => {
        const rowKey = String(row.memberId ?? index);
        const toggle = `<button type="button" class="detail-expand-toggle" data-expand-target="${rowKey}" aria-expanded="false" aria-label="Show deposits for ${escapeHtml(row.member)}">▸</button>`;
        const mainCells = view.columns
          .map((col, colIndex) => {
            const cls = col.format === "money" ? ' class="money"' : "";
            const value =
              colIndex === 0
                ? `${toggle}<span class="detail-member-link">${formatDetailCell(row[col.key], col.format)}</span>`
                : formatDetailCell(row[col.key], col.format);
            return `<td${cls}>${value}</td>`;
          })
          .join("");
        const childRows = (row[view.expandKey] || [])
          .map((child) => {
            const cells = view.childColumns
              .map((col) => {
                const cls = col.format === "money" ? ' class="money"' : "";
                return `<td${cls}>${formatDetailCell(child[col.key], col.format)}</td>`;
              })
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        const nestedTable = childRows
          ? `<table class="detail-nested-table"><thead><tr>${view.childColumns
              .map((col) => `<th>${escapeHtml(col.label)}</th>`)
              .join("")}</tr></thead><tbody>${childRows}</tbody></table>`
          : `<p class="subtle detail-expand-empty">No deposit detail available.</p>`;
        return `
          <tr class="detail-member-row detail-expand-row" data-member-id="${row.memberId ?? ""}">
            ${mainCells}
          </tr>
          <tr class="detail-expand-panel hidden" data-expand-for="${rowKey}">
            <td colspan="${view.columns.length}">${nestedTable}</td>
          </tr>`;
      })
      .join("");
    bindBookDetailExpandRows();
    bindBookDetailMemberRows(slug);
    return;
  }

  body.innerHTML = view.rows
    .map((row) => {
      const memberAttr = row.memberId
        ? ` class="detail-member-row" data-member-id="${row.memberId}"`
        : "";
      const cells = view.columns
        .map((col) => {
          const cls = col.format === "money" ? ' class="money"' : "";
          return `<td${cls}>${formatDetailCell(row[col.key], col.format)}</td>`;
        })
        .join("");
      return `<tr${memberAttr}>${cells}</tr>`;
    })
    .join("");
  bindBookDetailMemberRows(slug);
}

function renderBookDetailView(viewId) {
  if (!activeBookDetail) return;
  const detail = activeBookDetail;
  const slug = activeBookDetailSlug;
  const view = detail.views.find((entry) => entry.id === viewId) || detail.views[0];
  if (!view) return;

  $("#booksDetailViewTabs")?.querySelectorAll("[data-book-view]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.bookView === view.id);
  });

  if (view.id === "by-member" && detail.views.length > 1) {
    const memberCount = view.rows.length;
    const summaryLine = `Total: ${fmt.format(detail.summary)} · ${memberCount} member${memberCount === 1 ? "" : "s"} with deposits`;
    $("#booksDetailSummary").textContent = summaryLine;
  } else {
    const summaryLine =
      typeof detail.summary === "number"
        ? `Total: ${fmt.format(detail.summary)}`
        : `Count: ${detail.summary}`;
    $("#booksDetailSummary").textContent = summaryLine;
  }

  renderBookDetailTable(view, slug);
}

function renderBookDetail(detail, slug) {
  activeBookDetail = detail;
  activeBookDetailSlug = slug;

  const summaryLine =
    typeof detail.summary === "number"
      ? `Total: ${fmt.format(detail.summary)}`
      : `Count: ${detail.summary}`;
  $("#booksDetailSummary").textContent = summaryLine;

  const tabLink = $("#booksDetailTabLink");
  if (detail.navigateTab) {
    tabLink.hidden = false;
    const tabLabels = {
      members: "Members & Accounts",
      loans: "Loans",
      record: "Record",
    };
    tabLink.textContent = `Open ${tabLabels[detail.navigateTab] || detail.navigateTab}`;
    tabLink.onclick = () => {
      switchTab(detail.navigateTab);
    };
  } else {
    tabLink.hidden = true;
  }

  const viewTabs = $("#booksDetailViewTabs");
  if (detail.views?.length) {
    viewTabs.classList.remove("hidden");
    viewTabs.innerHTML = detail.views
      .map(
        (view, index) =>
          `<button type="button" class="books-detail-view-tab${index === 0 ? " active" : ""}" data-book-view="${view.id}">${escapeHtml(view.label)}</button>`
      )
      .join("");
    viewTabs.querySelectorAll("[data-book-view]").forEach((tab) => {
      tab.addEventListener("click", () => renderBookDetailView(tab.dataset.bookView));
    });
    renderBookDetailView(detail.views[0].id);
    return;
  }

  viewTabs?.classList.add("hidden");
  renderBookDetailTable(
    {
      columns: detail.columns,
      rows: detail.rows || [],
      emptyMessage: "No Records",
    },
    slug
  );
}

async function openBookDetail(slug) {
  const requestId = ++bookDetailRequestId;
  const detailEl = $("#booksDetail");
  const summaryEl = $("#booksSummary");
  const body = $("#booksDetailBody");
  try {
    summaryEl?.classList.add("hidden");
    detailEl?.classList.remove("hidden");
    $("#booksDetailTitle").textContent = "Loading…";
    $("#booksDetailViewTabs")?.classList.add("hidden");
    body.innerHTML = `<tr><td>Loading…</td></tr>`;

    const res = await fetch(`/api/books/detail/${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (requestId !== bookDetailRequestId) return;
    if (!res.ok) throw new Error(data.error || "Failed to load details");

    const detail = data.detail;
    $("#booksDetailTitle").textContent = detail.title;
    renderBookDetail(detail, slug);
  } catch (err) {
    if (requestId !== bookDetailRequestId) return;
    activeBookDetail = null;
    activeBookDetailSlug = null;
    $("#booksDetailTitle").textContent = "Details";
    body.innerHTML = `<tr><td class="status err">${escapeHtml(err.message)}</td></tr>`;
  }
}

function bindBookCards() {
  $("#booksGrid")?.querySelectorAll("[data-book-slug]").forEach((card) => {
    card.addEventListener("click", () => openBookDetail(card.dataset.bookSlug));
  });
}

async function loadBooks() {
  const requestId = ++booksRequestId;
  const grid = $("#booksGrid");
  const refreshBtn = $("#refreshBooks");
  if (grid) grid.innerHTML = '<p class="subtle">Loading books…</p>';
  setButtonBusy(refreshBtn, true);
  try {
    const res = await fetch("/api/books");
    if (requestId !== booksRequestId) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.books?.error || "Failed to load books");
    const { books } = data;
    grid.innerHTML = [
      dashboardCardsHtml(books.dashboard),
      bookCardHtml("deposit-accounts", {
        accent: true,
        label: "Member Contributions Accounts (Total)",
        amount: books.totalMemberDepositAccounts,
        note: "Net of Contributions, Withdrawals, Distributions &amp; Fees",
      }),
      bookCardHtml("deposits-withdrawals", {
        label: "Member Contributions &amp; Withdrawals",
        amount: books.memberDeposits,
        note: "Contributions Minus Withdrawals Only: Excludes Distributions &amp; Registration Fees",
      }),
      bookCardHtml("registration-income", {
        label: "Registration Income",
        amount: books.registrationIncome,
      }),
      (books.cdInterestIncome || 0) > 0
        ? bookCardHtml("cd-interest-income", {
            label: "CD Interest Income",
            amount: books.cdInterestIncome,
            note: `Realized ${fmt.format(books.cdInterestRealized || 0)} · Accrued ${fmt.format(books.cdInterestAccrued || 0)}`,
          })
        : "",
      (books.loanCount || 0) > 0
        ? bookCardHtml("loan-interest-income", {
            label: "Loan Interest Income",
            amount: books.loanInterestIncome || 0,
            note: "Includes Interest From Active Loan Repayments",
          })
        : "",
      bookCardHtml("total-income", {
        accent: true,
        label: "Total Cooperative Income",
        amount: books.totalCooperativeIncome || 0,
        note: "Registration + Loan Interest + CD Interest",
      }),
      bookCardHtml("expenses", {
        label: "Cooperative Expenses",
        amount: books.expenses,
      }),
      bookCardHtml("distributions", {
        label: "Distributions Paid",
        amount: books.distributions,
      }),
      bookCardHtml("net-income", {
        accent: true,
        label: "Cooperative Net Income",
        amount: books.cooperativeNetIncome || 0,
        note: `Income ${fmt.format(books.totalCooperativeIncome || 0)} − Expenses ${fmt.format(books.expenses || 0)}`,
      }),
      (books.loanCount || 0) > 0
        ? bookCardHtml("expected-loan-interest", {
            label: "Expected Future Loan Interest",
            amount: books.expectedLoanInterest || 0,
            note: "Scheduled Interest Remaining on Active Loans",
          })
        : "",
      bookCardHtml("loans", {
        label: "Loans Outstanding",
        amount: books.loansOutstanding,
        note: books.loanCount
          ? `${books.loanCount} Loans · Disbursed ${fmt.format(books.loansPrincipal)} · Repaid ${fmt.format(books.loansCollected)}`
          : `Disbursed ${fmt.format(books.loansPrincipal)} · Repaid ${fmt.format(books.loansCollected)}`,
      }),
      books.checkingBalance != null || books.ledgerCheckingBalance != null
        ? bookCardHtml("checking-balance", {
            label: "Current Bank Balance",
            amount: books.checkingBalance ?? books.ledgerCheckingBalance ?? 0,
            note: [
              books.primaryCheckingCurrency && books.primaryCheckingCurrency !== "USD"
                ? `Currency ${books.primaryCheckingCurrency}`
                : null,
              books.checkingBalanceAsOf
                ? `Statement as of ${books.checkingBalanceAsOf}`
                : null,
              books.ledgerCheckingBalance != null
                ? `Ledger ${fmt.format(books.ledgerCheckingBalance)} through ${books.ledgerCheckingAsOf || ":"}`
                : null,
              books.bankAccounts?.length
                ? books.bankAccounts
                    .filter((a) => a.isPrimary)
                    .map((a) => a.institutionName || a.accountLabel)
                    .join(", ") || null
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Primary checking account",
          })
        : "",
      books.cdBalance != null
        ? bookCardHtml("cd-balance", {
            label: "CD Account Balance",
            amount: books.cdBalance,
            note: books.cdBalanceAsOf
              ? `As of ${books.cdBalanceAsOf} · Term start ${fmt.format(books.cdTermStartBalance ?? (books.cdBalance - (books.cdTermInterestEarned || 0)))} · Earned ${fmt.format(books.cdTermInterestEarned ?? books.cdInterestAccrued ?? 0)}`
              : "Certificate of Deposit",
          })
        : "",
      books.cdBalance != null && books.expectedCdInterest != null
        ? bookCardHtml("expected-cd-interest", {
            label: "Expected CD Interest",
            amount: books.expectedCdInterest,
            note: books.cdMaturityDate
              ? `To maturity ${books.cdMaturityDate} · ${(books.cdAnnualRate * 100).toFixed(2)}% rate · ${books.cdTermDaysRemaining ?? ":"} days left`
              : "Interest not yet received this term",
          })
        : "",
      (books.investments || 0) > 0
        ? bookCardHtml("investments", {
            label: "Cooperative Investments",
            amount: books.investments,
            note: "Caribe Restaurant and Lounge",
          })
        : "",
      bookCardHtml("members-profiles", {
        label: "Members/Profiles on File",
        amount: `${books.profileCount}/${books.memberCount}`,
      }),
    ].join("");
    bindBookCards();
  } catch (err) {
    if (requestId !== booksRequestId) return;
    grid.innerHTML = `<p class="status err">${escapeHtml(err.message)}</p>`;
  } finally {
    if (requestId === booksRequestId) setButtonBusy(refreshBtn, false);
  }
}

$("#booksDetailBack")?.addEventListener("click", closeBookDetail);

function updateMemberRowSelection() {
  $("#membersBody")?.querySelectorAll(".member-row").forEach((row) => {
    row.classList.toggle("selected", Number(row.dataset.memberId) === selectedMemberId);
  });
}

function bindMemberRowHandlers() {
  $("#membersBody")?.querySelectorAll(".member-row").forEach((row) => {
    row.querySelectorAll(".member-account-cell").forEach((cell) => {
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        selectMember(Number(row.dataset.memberId), cell.dataset.accountPanel);
      });
    });
    row.addEventListener("click", () => {
      selectMember(Number(row.dataset.memberId), null);
    });
  });
}

function selectMember(memberId, accountPanel = null, { force = false } = {}) {
  if (
    !force &&
    accountPanel &&
    selectedMemberId === memberId &&
    loadedProfileMemberId === memberId
  ) {
    const root = $("#memberDetail");
    if (root?.querySelector("#memberAccountDetail")) {
      updateMemberRowSelection();
      selectMemberAccountPanel(root, accountPanel);
      root.querySelector("#memberAccountDetail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
  }
  if (!force && !accountPanel && selectedMemberId === memberId && loadedProfileMemberId === memberId) {
    updateMemberRowSelection();
    return;
  }
  selectedMemberId = memberId;
  pendingAccountPanel = accountPanel;
  updateMemberRowSelection();
  showProfile(memberId);
}

async function loadMembers() {
  const requestId = ++membersListRequestId;
  const body = $("#membersBody");
  const refreshBtn = $("#refreshMembers");
  if (body) body.innerHTML = '<tr><td colspan="5" class="subtle">Loading members…</td></tr>';
  setButtonBusy(refreshBtn, true);
  try {
    const res = await fetch("/api/members?profiles=true");
    if (requestId !== membersListRequestId) return;
    const { members } = await res.json();
    membersListCache = members || [];
    renderMembersList();
  } catch (err) {
    if (requestId !== membersListRequestId) return;
    if (body) {
      body.innerHTML = `<tr><td colspan="5" class="status err">${escapeHtml(err.message)}</td></tr>`;
    }
  } finally {
    if (requestId === membersListRequestId) setButtonBusy(refreshBtn, false);
  }
}

function normalizeMemberSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "");
}

function memberMatchesSearch(member, query) {
  const needle = normalizeMemberSearchText(query);
  if (!needle) return true;
  const haystacks = [
    member.member_number,
    member.display_name,
    member.name,
  ].filter(Boolean);
  return haystacks.some((value) => {
    const normalized = normalizeMemberSearchText(value);
    return normalized.includes(needle);
  });
}

function renderMembersList() {
  const body = $("#membersBody");
  if (!body) return;

  const filtered = membersListCache.filter((m) => memberMatchesSearch(m, memberSearchQuery));
  if (!membersListCache.length) {
    body.innerHTML =
      '<tr><td colspan="5">No Members. Import Spreadsheet on the Import Tab.</td></tr>';
    return;
  }
  if (!filtered.length) {
    body.innerHTML =
      '<tr><td colspan="5" class="subtle">No members match your search.</td></tr>';
    return;
  }

  body.innerHTML = filtered
    .map(
      (m) => `
    <tr class="member-row${selectedMemberId === m.id ? " selected" : ""}" data-member-id="${m.id}">
      <td><span class="member-number">${escapeHtml(m.member_number || ":")}</span></td>
      <td><strong>${escapeHtml(m.display_name || m.name)}</strong><br /><span class="subtle">${escapeHtml(m.name)}</span></td>
      <td class="money member-account-cell" data-account-panel="deposit">${fmt.format(m.deposit_balance ?? m.balance)}</td>
      <td class="money member-account-cell" data-account-panel="loan">${fmt.format(m.loan_balance || 0)}</td>
      <td>${m.profile_id ? '<span class="badge ok">On File</span>' : '<span class="badge warn">Missing</span>'}</td>
    </tr>`
    )
    .join("");

  bindMemberRowHandlers();

  if (selectedMemberId && !filtered.some((m) => m.id === selectedMemberId)) {
    selectedMemberId = filtered[0]?.id || null;
  } else if (!selectedMemberId && filtered.length) {
    selectedMemberId = filtered[0].id;
  }
  updateMemberRowSelection();
  if (selectedMemberId) {
    showProfile(selectedMemberId);
  }
}

$("#memberSearch")?.addEventListener("input", (e) => {
  memberSearchQuery = e.target.value || "";
  renderMembersList();
});

function addressBlock(profile) {
  const lines = [
    profile.address_line1,
    profile.address_line2,
    [profile.city, profile.state, profile.postal_code].filter(Boolean).join(", "),
    profile.country,
  ].filter(Boolean);
  return lines.length ? lines.map(escapeHtml).join("<br />") : ":";
}

async function bindProfilePhotoImage(img, memberId) {
  if (!img || !memberId) return;
  try {
    const res = await fetch(`/api/members/${memberId}/photo`);
    if (!res.ok) {
      img.src = PLACEHOLDER_PHOTO;
      return;
    }
    const blob = await res.blob();
    if (img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl);
    const objectUrl = URL.createObjectURL(blob);
    img.dataset.objectUrl = objectUrl;
    img.src = objectUrl;
  } catch {
    img.src = PLACEHOLDER_PHOTO;
  }
}

function bindAdminProfilePhotoUpload(root, memberId) {
  const form = root?.querySelector("#adminProfilePhotoForm");
  if (!form) return;

  const status = root.querySelector("#adminProfilePhotoStatus");
  const img = root.querySelector(".profile-photo");
  const caption = root.querySelector(".photo-caption");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setFormStatus(status, "Uploading…");
    try {
      const file = form.querySelector('input[type="file"]')?.files?.[0];
      if (!file) throw new Error("Choose a photo first");
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/members/${memberId}/photo`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setFormStatus(status, "Profile photo saved.", true);
      form.reset();
      if (caption) caption.textContent = "Member Photo";
      await bindProfilePhotoImage(img, memberId);
    } catch (err) {
      setFormStatus(status, err.message, false);
    }
  });
}

function emergencyContactName(profile) {
  return [profile?.next_of_kin_first_name, profile?.next_of_kin_last_name]
    .filter(Boolean)
    .join(" ");
}

function formatAccountStatus(status) {
  const raw = String(status || "active").trim();
  if (!raw) return "Active";
  if (raw === "pending_approval") return "Pending Approval";
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
}

function formatFlexxFormsApplicationStatus(status) {
  const map = {
    pending: "Received",
    awaiting_payment: "Awaiting Payment",
    awaiting_approval: "Ready for Approval",
    approved: "Approved",
    duplicate: "Duplicate",
    rejected: "Rejected",
    error: "Processing Error",
  };
  return map[status] || formatAccountStatus(status);
}

function profileFieldValue(value, { asDate = false } = {}) {
  if (asDate) {
    if (!value) return "";
    const formatted = formatDate(value);
    return formatted === ":" ? "" : formatted;
  }
  const text = value == null ? "" : String(value).trim();
  return text ? escapeHtml(text) : "";
}

function profileFieldRow(label, value, { asDate = false } = {}) {
  const display = profileFieldValue(value, { asDate });
  const valueHtml = display
    ? `<span class="profile-field-value">${display}</span>`
    : `<span class="profile-field-value profile-field-empty"></span>`;
  return `<p class="profile-field"><span class="profile-field-label">${escapeHtml(label)}:</span> ${valueHtml}</p>`;
}

function profileDisclosureHtml(summary, bodyHtml, { extraClass = "" } = {}) {
  const cls = extraClass ? ` profile-disclosure ${extraClass}` : " profile-disclosure";
  return `
    <details class="${cls.trim()}">
      <summary>${escapeHtml(summary)}</summary>
      <div class="profile-disclosure-body">
        ${bodyHtml}
      </div>
    </details>`;
}

function profileDemographicsGridHtml(p) {
  const hasProfile = Boolean(p?.id || p?.first_name || p?.email || p?.phone);
  if (!hasProfile) {
    return '<p class="subtle">No Membership Biodata on File Yet. You Can Still Add an Emergency Contact Below.</p>';
  }
  return `
    <div class="profile-grid">
      <section>
        <h4>Identity</h4>
        ${profileFieldRow("First Name", p.first_name)}
        ${profileFieldRow("Middle Name", p.middle_name)}
        ${profileFieldRow("Last Name", p.last_name)}
        ${profileFieldRow("Display Name", p.display_name || p.ledger_account_name)}
        ${profileFieldRow("Gender", p.gender)}
        ${profileFieldRow("Date of Birth", p.date_of_birth, { asDate: true })}
      </section>
      <section>
        <h4>Contact</h4>
        ${profileFieldRow("Email", p.email)}
        ${profileFieldRow("Phone", p.phone)}
      </section>
      <section>
        <h4>Address</h4>
        <p class="profile-field-value">${addressBlock(p)}</p>
      </section>
      <section>
        <h4>Payments (Zelle/Bank)</h4>
        ${profileFieldRow("Method", p.preferred_payment_method)}
        ${profileFieldRow("Bank/Zelle Name", p.zelle_bank_name)}
        ${profileFieldRow("Registration Fee Paid", p.membership_fee_paid ? "Yes" : "No")}
        ${profileFieldRow("Joined", p.joined_at)}
      </section>
      <section>
        <h4>Membership Application</h4>
        ${profileFieldRow("Signed", p.application_signed_at, { asDate: true })}
        ${profileFieldRow("Signature", p.signature_name)}
        ${profileFieldRow("Account Status", formatAccountStatus(p.cooperative_account_status))}
      </section>
    </div>`;
}

function renderMyProfileSection(profile) {
  const section = $("#myProfileSection");
  if (!section || currentUser?.role !== "member") return;

  const p = profile || {};
  const memberId = p.member_id || currentUser?.memberId;
  section.classList.remove("hidden");
  section.innerHTML = `
    <div class="profile-header">
      <div class="profile-photo-wrap">
        <img class="profile-photo" id="myProfilePhoto" src="${PLACEHOLDER_PHOTO}" alt="" />
        <form id="myProfilePhotoForm" class="profile-photo-upload">
          <label class="subtle profile-photo-file-label">Choose Photo (Optional)
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif" />
          </label>
          <button type="submit" class="btn primary profile-photo-submit-btn">Upload Photo</button>
        </form>
        <p id="myProfilePhotoStatus" class="status"></p>
      </div>
      <div class="profile-summary">
        <h3>${escapeHtml(p.display_name || p.ledger_account_name || currentUser?.memberName || "My Profile")}</h3>
        <p class="profile-field"><span class="profile-field-label">Account Name:</span> <span class="profile-field-value">${escapeHtml(p.ledger_account_name || currentUser?.memberName || "")}</span></p>
        <p class="subtle profile-summary-hint">Expand a section below to review biodata or update your emergency contact.</p>
      </div>
    </div>
    ${profileDisclosureHtml(
      "Membership Biodata",
      `
      <p class="subtle profile-disclosure-note">Review your membership details. Contact the Cooperative to change biodata other than emergency contact.</p>
      ${profileDemographicsGridHtml(p)}
    `
    )}
    ${profileDisclosureHtml(
      "Emergency Contact",
      `
      <p class="subtle profile-disclosure-note">Optional. Saved to your membership record and visible to Cooperative administrators.</p>
      <form id="myEmergencyContactForm" class="entry-form">
        <label>First Name
          <input type="text" name="emergencyFirstName" value="${escapeHtml(p.next_of_kin_first_name || "")}" />
        </label>
        <label>Last Name
          <input type="text" name="emergencyLastName" value="${escapeHtml(p.next_of_kin_last_name || "")}" />
        </label>
        <label>Email Address
          <input type="email" name="emergencyEmail" value="${escapeHtml(p.next_of_kin_email || "")}" />
        </label>
        <label>Phone Number
          <input type="tel" name="emergencyPhone" value="${escapeHtml(p.next_of_kin_phone || "")}" />
        </label>
        <label>Relationship (Optional)
          <input type="text" name="emergencyRelationship" value="${escapeHtml(p.next_of_kin_relationship || "")}" placeholder="e.g. Spouse, Parent" />
        </label>
        <button type="submit" class="btn primary">Save Emergency Contact</button>
      </form>
      <p id="myEmergencyContactStatus" class="status"></p>
    `,
      { extraClass: "profile-disclosure-emergency" }
    )}`;

  bindProfilePhotoImage($("#myProfilePhoto"), memberId);

  $("#myProfilePhotoForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#myProfilePhotoStatus");
    status.textContent = "Uploading…";
    status.className = "status";
    try {
      const fileInput = e.target.querySelector('input[type="file"]');
      const file = fileInput?.files?.[0];
      if (!file) throw new Error("Choose a photo first");
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/me/profile/photo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFormStatus(status, "Profile photo updated.", true);
      fileInput.value = "";
      await bindProfilePhotoImage($("#myProfilePhoto"), memberId);
    } catch (err) {
      setFormStatus(status, err.message, false);
    }
  });

  $("#myEmergencyContactForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#myEmergencyContactStatus");
    status.textContent = "Saving…";
    status.className = "status";
    try {
      const payload = formJson(e.target);
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFormStatus(status, "Emergency contact saved.", true);
      if (data.profile) renderMyProfileSection(data.profile);
    } catch (err) {
      setFormStatus(status, err.message, false);
    }
  });
}

function formatTxType(type) {
  const labels = {
    deposit: "Contribution",
    withdrawal: "Withdrawal",
    distribution: "Distribution",
    membership_fee: "Registration Fee",
    loan_disbursement: "Loan Disbursement",
    loan_repayment: "Loan Repayment",
    loan_overpayment: "Loan Overpayment",
    late_fee: "Late Fee",
  };
  return labels[type] || String(type || "").replace(/_/g, " ");
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DEPOSIT_LEDGER_TYPES = new Set([
  "deposit",
  "withdrawal",
  "distribution",
  "membership_fee",
]);

function withDepositRunningBalances(transactions) {
  const sorted = [...transactions]
    .filter((t) => DEPOSIT_LEDGER_TYPES.has(t.type))
    .sort((a, b) => {
      const byDate = String(a.transaction_date).localeCompare(String(b.transaction_date));
      return byDate !== 0 ? byDate : (Number(a.id) || 0) - (Number(b.id) || 0);
    });

  let balance = 0;
  const balanceById = new Map();
  for (const tx of sorted) {
    balance += Number(tx.amount) || 0;
    balanceById.set(Number(tx.id), balance);
  }

  return transactions.map((tx) => ({
    ...tx,
    balance_after: DEPOSIT_LEDGER_TYPES.has(tx.type)
      ? balanceById.get(Number(tx.id)) ?? Number(tx.balance_after) ?? 0
      : tx.balance_after,
  }));
}

function statementMonthsFromDates(dates) {
  const months = new Map();
  for (const dateValue of dates) {
    const match = String(dateValue || "").match(/^(\d{4})-(\d{2})/);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const slug = `${year}-${String(month).padStart(2, "0")}`;
    if (!months.has(slug)) {
      months.set(slug, {
        year,
        month,
        label: `${MONTH_LABELS[month - 1]} ${year}`,
      });
    }
  }
  return [...months.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

function schedulePeriodAmount(row) {
  const interest = Number(row.interest) || 0;
  const principal = Number(row.principal) || 0;
  const totalDue = Number(row.totalDue);
  if (totalDue > 0.005) return totalDue;
  return Math.round((interest + principal) * 100) / 100;
}

function loanTotalDue(lot) {
  if (lot?.scheduledTotalPayable != null && lot.scheduledTotalPayable > 0) {
    return lot.scheduledTotalPayable;
  }
  const scheduleSum = (lot?.schedule || []).reduce(
    (sum, row) => sum + schedulePeriodAmount(row),
    0
  );
  if (scheduleSum > 0.005) return scheduleSum;
  return Number(lot?.principal) || 0;
}

function sortRepaymentsChronological(repayments) {
  return [...(repayments || [])].sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    return byDate !== 0 ? byDate : (Number(a.transactionId) || 0) - (Number(b.transactionId) || 0);
  });
}

function loanRepaymentRowsWithBalance(lot) {
  let cumulative = 0;
  const rows = sortRepaymentsChronological(lot.repayments).map((payment) => {
    cumulative = Math.round((cumulative + (Number(payment.amount) || 0)) * 100) / 100;
    return {
      date: payment.date,
      amount: Number(payment.amount) || 0,
      balance:
        payment.balanceAfter != null
          ? payment.balanceAfter
          : principalOutstandingAfterCollectedClient(lot, cumulative),
      description: payment.description || "",
    };
  });
  return [...rows].reverse();
}

function principalOutstandingAfterCollectedClient(lot, collected) {
  const principal = Number(lot?.principal) || 0;
  const paid = Number(collected) || 0;
  if (paid >= principal - 0.005) return 0;
  if (lot.schedule?.length) {
    const { principalRepaid } = computeInterestFromScheduleClient(paid, lot.schedule);
    return Math.max(0, Math.round((principal - principalRepaid) * 100) / 100);
  }
  return Math.max(0, Math.round((principal - paid) * 100) / 100);
}

function computeInterestFromScheduleClient(collected, installments) {
  if (!installments?.length || collected <= 0.005) {
    return { principalRepaid: 0 };
  }
  let remaining = collected;
  let principalRepaid = 0;
  for (const period of installments) {
    const totalDue =
      period.totalDue ||
      Math.round(((period.interest || 0) + (period.principal || 0)) * 100) / 100;
    if (totalDue <= 0.005) continue;
    if (remaining >= totalDue - 0.005) {
      principalRepaid += period.principal || 0;
      remaining = Math.round((remaining - totalDue) * 100) / 100;
      continue;
    }
    if (remaining > 0.005) {
      const ratio = remaining / totalDue;
      principalRepaid += (period.principal || 0) * ratio;
      remaining = 0;
    }
    break;
  }
  return { principalRepaid: Math.round(principalRepaid * 100) / 100 };
}

function loanRepaymentTableHtml(lot) {
  const rows = loanRepaymentRowsWithBalance(lot);
  if (!rows.length) {
    return `
    <div class="table-wrap compact">
      <table>
        <thead><tr><th>Date</th><th>Amount</th><th>Balance</th><th>Description</th></tr></thead>
        <tbody><tr><td colspan="4" class="subtle">No Repayments</td></tr></tbody>
      </table>
    </div>`;
  }
  const body = rows
    .map(
      (row) => `
        <tr>
          <td>${formatDate(row.date)}</td>
          <td class="money">${fmt.format(row.amount)}</td>
          <td class="money">${fmt.format(row.balance)}</td>
          <td>${escapeHtml(row.description)}</td>
        </tr>`
    )
    .join("");
  return `
    <h5 class="loan-repayments-title">Actual Repayments</h5>
    <p class="subtle loan-repayments-hint">Most recent payment first. Balance is principal still owed after each payment.</p>
    <div class="table-wrap compact">
      <table>
        <thead><tr><th>Date</th><th>Amount</th><th>Balance</th><th>Description</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function buildLoanActivityRows(lot, newestFirst = true) {
  const principal = Number(lot.principal) || 0;
  const rows = [
    {
      date: lot.disbursementDate,
      type: "Loan Disbursement",
      amount: -principal,
      balance: principal,
      description: lot.disbursementDescription || "Loan disbursement",
    },
  ];
  for (const payment of sortRepaymentsChronological(lot.repayments)) {
    let cumulative = rows
      .filter((row) => row.type === "Repayment")
      .reduce((sum, row) => sum + row.amount, 0);
    cumulative = Math.round((cumulative + (Number(payment.amount) || 0)) * 100) / 100;
    const balance =
      payment.balanceAfter != null
        ? payment.balanceAfter
        : principalOutstandingAfterCollectedClient(lot, cumulative);
    rows.push({
      date: payment.date,
      type: "Repayment",
      amount: Number(payment.amount) || 0,
      balance,
      description: payment.description || "",
    });
  }
  return newestFirst ? [...rows].reverse() : rows;
}

function accountActivityTableRows(rows, { memberPortal = false, formatDates = false } = {}) {
  if (!rows.length) {
    return '<tr><td colspan="5" class="subtle">No Activity</td></tr>';
  }
  const descClass = memberPortal ? ' class="col-description"' : "";
  return rows
    .map(
      (row) => `
    <tr>
      <td class="col-date">${formatDates ? escapeHtml(formatDate(row.date)) : escapeHtml(row.date)}</td>
      <td class="col-type">${escapeHtml(row.type)}</td>
      <td class="money">${fmt.format(row.amount)}</td>
      <td class="money">${fmt.format(row.balance ?? 0)}</td>
      <td${descClass}>${escapeHtml(row.description || "")}</td>
    </tr>`
    )
    .join("");
}

function depositTxTableRows(transactions) {
  if (!transactions?.length) {
    return '<tr><td colspan="5" class="subtle">No Transactions</td></tr>';
  }
  return transactions
    .map(
      (t) => `
    <tr>
      <td>${formatDate(t.transaction_date)}</td>
      <td>${escapeHtml(formatTxType(t.type))}</td>
      <td class="money">${fmt.format(t.amount)}</td>
      <td class="money">${fmt.format(t.balance_after ?? 0)}</td>
      <td>${escapeHtml(t.description || "")}</td>
    </tr>`
    )
    .join("");
}

function txTableRows(transactions) {
  if (!transactions?.length) {
    return '<tr><td colspan="4" class="subtle">No Transactions</td></tr>';
  }
  return transactions
    .map(
      (t) => `
    <tr>
      <td>${formatDate(t.transaction_date)}</td>
      <td>${escapeHtml(formatTxType(t.type))}</td>
      <td class="money">${fmt.format(t.amount)}</td>
      <td>${escapeHtml(t.description || "")}</td>
    </tr>`
    )
    .join("");
}

function depositActivityPanelHtml(p) {
  const txCount = p.deposit_transactions?.length || 0;
  return `
    <h4 class="section-title">Contributions Account Activity</h4>
    <p class="subtle">Balance ${fmt.format(p.deposit_account_balance || 0)} · ${txCount} transaction${txCount === 1 ? "" : "s"} on record</p>
    <div class="table-wrap compact">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Description</th></tr></thead>
        <tbody>${depositTxTableRows(p.deposit_transactions)}</tbody>
      </table>
    </div>`;
}

function loanActivityPanelHtml(p, memberId) {
  const hasLots = p.loan_lots?.length > 0;
  return `
    <h4 class="section-title">Loan Account Activity</h4>
    <p class="subtle">Outstanding ${fmt.format(p.loan_account_balance || 0)} · ${loanAccountSubtitle(p)}</p>
    ${
      hasLots
        ? loanLotsSectionHtml(p.loan_lots, p.member_id || memberId)
        : `<div class="table-wrap compact">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th></tr></thead>
        <tbody>${txTableRows(p.loan_transactions)}</tbody>
      </table>
    </div>`
    }`;
}

function selectMemberAccountPanel(root, panel) {
  if (!root) return;
  root.querySelectorAll(".account-card[data-account-panel]").forEach((card) => {
    card.classList.toggle("selected", card.dataset.accountPanel === panel);
    card.setAttribute("aria-expanded", card.dataset.accountPanel === panel ? "true" : "false");
  });
  root.querySelectorAll("[data-account-panel-body]").forEach((body) => {
    body.classList.toggle("hidden", body.dataset.accountPanelBody !== panel);
  });
  const detail = root.querySelector("#memberAccountDetail");
  if (detail) detail.classList.remove("hidden");
}

function bindMemberAccountCards(root, memberId, initialPanel = "deposit") {
  root.querySelectorAll(".account-card[data-account-panel]").forEach((card) => {
    card.addEventListener("click", () => {
      selectMemberAccountPanel(root, card.dataset.accountPanel);
      root.querySelector("#memberAccountDetail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
  selectMemberAccountPanel(root, initialPanel);
  bindLoanStatementButtons(root);
}

async function downloadLoanStatement(memberId, loanNumber, button, options = {}) {
  const params = new URLSearchParams();
  if (options.year && options.month) {
    params.set("year", String(options.year));
    params.set("month", String(options.month));
  }
  const query = params.toString();
  const url = `/api/loans/ledger/${memberId}/${loanNumber}/statement${query ? `?${query}` : ""}`;
  if (button) {
    button.disabled = true;
    button.textContent = "Generating…";
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      let message = "Failed to generate statement";
      try {
        const data = await res.json();
        message = data.error || message;
      } catch (_) {}
      throw new Error(message);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const fileName = match?.[1] || `Loan ${loanNumber} Statement.pdf`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    const message =
      err.name === "AbortError"
        ? "Statement generation timed out. Please try again."
        : err.message || "Failed to generate statement";
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
    if (button) {
      button.disabled = false;
      button.textContent = "Statement";
    }
  }
}

function bindLoanStatementButtons(root) {
  root?.querySelectorAll(".loan-statement-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      downloadLoanStatement(btn.dataset.memberId, btn.dataset.loanNumber, btn).catch((err) => {
        alert(err.message);
      });
    });
  });
}

function loanAccountSubtitle(p) {
  const parts = [];
  if (p.active_loans) {
    parts.push(`${p.active_loans} Active Loan(s)`);
  } else {
    parts.push("No Active Loan");
  }
  if (p.paid_loans) {
    parts.push(`${p.paid_loans} Paid`);
  }
  if ((p.loan_overpayment_credit || 0) > 0) {
    parts.push(`${fmt.format(p.loan_overpayment_credit)} Prepaid Credit`);
  }
  return parts.join(" · ");
}

function loanScheduleHtml(lot) {
  if (!lot.schedule?.length) return "";
  let balance = loanTotalDue(lot);
  const rows = lot.schedule
    .map((row) => {
      const periodTotal = schedulePeriodAmount(row);
      balance = Math.max(0, Math.round((balance - periodTotal) * 100) / 100);
      return `
      <tr>
        <td>${row.period}</td>
        <td class="money">${fmt.format(row.interest || 0)}</td>
        <td class="money">${fmt.format(row.principal || 0)}</td>
        <td class="money">${fmt.format(balance)}</td>
      </tr>`;
    })
    .join("");
  const scheduleMeta = [];
  if (lot.scheduledMonthlyPayment != null) {
    scheduleMeta.push(`Agreed payment ${fmt.format(lot.scheduledMonthlyPayment)}`);
  }
  if (lot.scheduledTotalInterest != null) {
    scheduleMeta.push(`Total scheduled interest ${fmt.format(lot.scheduledTotalInterest)}`);
  }
  scheduleMeta.push(`Total payable ${fmt.format(loanTotalDue(lot))}`);
  return `
    <details class="profile-disclosure loan-schedule-disclosure">
      <summary>Agreed Loan Repayment Schedule</summary>
      <div class="profile-disclosure-body">
        <p class="subtle profile-disclosure-note">Informational Only : Actual Repayments Come From Bank Records. Balance drops by interest plus principal each period.</p>
        ${scheduleMeta.length ? `<p class="subtle">${scheduleMeta.join(" · ")}</p>` : ""}
        <div class="table-wrap compact">
          <table>
            <thead>
              <tr><th>#</th><th>Interest</th><th>Principal</th><th>Balance</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </details>`;
}

function loanLotSummaryLine(lot) {
  const isPaid = lot.status === "paid";
  return `Disbursed ${formatDate(lot.disbursementDate)} · Principal ${fmt.format(lot.principal)} · Repaid ${fmt.format(lot.collected)} · Interest earned ${fmt.format(lot.interestIncome || 0)}${lot.scheduledTotalInterest != null ? ` of ${fmt.format(lot.scheduledTotalInterest)} scheduled` : ""} · Outstanding ${fmt.format(lot.outstanding)}`;
}

function loanLotCardHtml(lot, memberId) {
  const isPaid = lot.status === "paid";
  const noteLine = lot.principalNote
    ? `<p class="subtle">${escapeHtml(lot.principalNote)}</p>`
    : "";
  return `
      <details class="loan-lot-card loan-lot-disclosure profile-disclosure"${isPaid ? "" : " open"}>
        <summary class="loan-lot-summary">
          <strong>Loan ${lot.loanNumber}</strong>
          <span class="badge ${isPaid ? "ok" : ""}">${isPaid ? "Paid" : "Active"}</span>
          <span class="loan-lot-summary-meta subtle">${isPaid ? "Paid in Full" : `Outstanding ${fmt.format(lot.outstanding)}`}</span>
        </summary>
        <div class="loan-lot-body">
          <div class="loan-lot-actions">
            <button type="button" class="btn small loan-statement-btn" data-member-id="${lot.memberId || memberId}" data-loan-number="${lot.loanNumber}">Generate Statement</button>
          </div>
          <p class="subtle">${loanLotSummaryLine(lot)}</p>
          ${noteLine}
          ${lot.disbursementDescription ? `<p class="subtle">Disbursement: ${escapeHtml(lot.disbursementDescription)}</p>` : ""}
          ${loanScheduleHtml(lot)}
          ${loanRepaymentTableHtml(lot)}
        </div>
      </details>`;
}

function loanLotsSectionHtml(lots, memberId) {
  if (!lots?.length) {
    return '<p class="subtle">No Loan Activity Recorded.</p>';
  }
  return lots.map((lot) => loanLotCardHtml(lot, memberId)).join("");
}

async function showProfile(memberId) {
  const requestId = ++profileRequestId;
  const el = $("#memberDetail");
  if (el) el.innerHTML = '<p class="subtle">Loading profile…</p>';

  const res = await fetch(`/api/members/${memberId}/profile`);
  if (requestId !== profileRequestId) return;
  const data = await res.json();
  if (!res.ok) {
    el.innerHTML = `<p class="status err">${escapeHtml(data.error)}</p>`;
    return;
  }

  const p = data.profile;
  const nokName = emergencyContactName(p);
  const hasBiodata = Boolean(p.id);

  el.innerHTML = `
    <div class="profile-card">
      <div class="profile-header">
        <div class="profile-photo-wrap">
          <img class="profile-photo" src="${PLACEHOLDER_PHOTO}" alt="" />
          <p class="photo-caption">${p.photo_path ? "Member Photo" : "No Photo on File"}</p>
          ${
            currentUser?.role === "admin"
              ? `
          <form id="adminProfilePhotoForm" class="profile-photo-upload">
            <label class="subtle profile-photo-file-label">Choose Photo
              <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif" />
            </label>
            <button type="submit" class="btn primary profile-photo-submit-btn">Upload Photo</button>
          </form>
          <p id="adminProfilePhotoStatus" class="status"></p>`
              : ""
          }
        </div>
        <div class="profile-summary">
          <h3>${escapeHtml(p.display_name || p.ledger_account_name)}</h3>
          <p class="subtle">Member #: <strong>${escapeHtml(p.member_number || ":")}</strong></p>
          <p class="subtle">Account Name: <strong>${escapeHtml(p.ledger_account_name)}</strong></p>
          ${currentUser?.role === "admin" ? `<button type="button" class="btn" data-edit-profile="${memberId}">Edit Profile</button>` : ""}
          ${hasBiodata ? "" : '<p class="status err">Membership Biodata Not on File : Use the Record Tab to Add or Update Profile.</p>'}
          <p><span class="badge ok">${escapeHtml(p.cooperative_account_status || "active")}</span></p>
        </div>
      </div>

      <div class="account-cards">
        <button type="button" class="account-card deposit" data-account-panel="deposit" aria-expanded="false">
          <h4>Contributions Account</h4>
          <p class="account-balance money">${fmt.format(p.deposit_account_balance || 0)}</p>
          <p class="subtle">Contributions, Withdrawals, Distributions, Registration Fee</p>
          <p class="account-card-hint">Click for Full History</p>
        </button>
        <button type="button" class="account-card loan" data-account-panel="loan" aria-expanded="false">
          <h4>Loan Account</h4>
          <p class="account-balance money">${fmt.format(p.loan_account_balance || 0)}</p>
          <p class="subtle">Outstanding Balance</p>
          <p class="subtle">${loanAccountSubtitle(p)}</p>
          <p class="account-card-hint">Click for Loans and Repayments</p>
        </button>
      </div>

      <div id="memberAccountDetail" class="account-detail-wrap hidden">
        <div data-account-panel-body="deposit">${depositActivityPanelHtml(p)}</div>
        <div data-account-panel-body="loan" class="hidden">${loanActivityPanelHtml(p, memberId)}</div>
      </div>

      ${hasBiodata ? `
      <div class="profile-grid">
        <section>
          <h4>Contact</h4>
          <dl>
            <dt>Email</dt><dd>${escapeHtml(p.email) || ":"}</dd>
            <dt>Phone</dt><dd>${escapeHtml(p.phone) || ":"}</dd>
            <dt>Gender</dt><dd>${escapeHtml(p.gender) || ":"}</dd>
            <dt>Date of Birth</dt><dd>${formatDate(p.date_of_birth)}</dd>
          </dl>
        </section>
        <section>
          <h4>Address</h4>
          <p>${addressBlock(p)}</p>
        </section>
        <section>
          <h4>Payments (Zelle/Bank)</h4>
          <dl>
            <dt>Method</dt><dd>${escapeHtml(p.preferred_payment_method) || ":"}</dd>
            <dt>Bank/Zelle Name</dt><dd>${escapeHtml(p.zelle_bank_name) || ":"}</dd>
            <dt>Fee Paid</dt><dd>${p.membership_fee_paid ? "Yes" : "No"}</dd>
            <dt>Joined</dt><dd>${p.joined_at || ":"}</dd>
          </dl>
        </section>
        <section>
          <h4>Emergency Contact</h4>
          <dl>
            <dt>Name</dt><dd>${escapeHtml(nokName) || ":"}</dd>
            <dt>Email</dt><dd>${escapeHtml(p.next_of_kin_email) || ":"}</dd>
            <dt>Phone</dt><dd>${escapeHtml(p.next_of_kin_phone) || ":"}</dd>
            <dt>Relationship</dt><dd>${escapeHtml(p.next_of_kin_relationship) || ":"}</dd>
          </dl>
        </section>
        <section>
          <h4>Application</h4>
          <dl>
            <dt>Signed</dt><dd>${formatDate(p.application_signed_at)}</dd>
            <dt>Signature</dt><dd>${escapeHtml(p.signature_name) || ":"}</dd>
          </dl>
        </section>
      </div>` : ""}
    </div>`;
  const initialPanel = pendingAccountPanel || "deposit";
  pendingAccountPanel = null;
  bindMemberAccountCards(el, memberId, initialPanel);
  bindProfilePhotoImage(el.querySelector(".profile-photo"), memberId);
  bindAdminProfilePhotoUpload(el, memberId);
  el.querySelector("[data-edit-profile]")?.addEventListener("click", () => {
    openMemberProfileEditor(memberId);
  });
  loadedProfileMemberId = memberId;
}

async function loadLoans() {
  const requestId = ++loansRequestId;
  const body = $("#loansBody");
  if (body) body.innerHTML = '<tr><td colspan="11" class="subtle">Loading loans…</td></tr>';
  try {
    const res = await fetch("/api/loans");
    if (requestId !== loansRequestId) return;
    const { loans } = await res.json();
  if (!loans.length) {
    body.innerHTML =
      '<tr><td colspan="11">No Loans Yet. Add Active Loans When Data Is Ready.</td></tr>';
    return;
  }
  body.innerHTML = loans
    .map((l) => {
      const isLedger = l.source === "bank_ledger";
      const loanLabel = isLedger ? `Loan ${l.loan_number}` : `#${l.id}`;
      const rowId = escapeHtml(String(l.id));
      const agreementsBtn =
        !isLedger && currentUser?.role === "admin"
          ? `<button type="button" class="btn small loan-agreements-btn" data-loan-id="${rowId}" data-borrower="${escapeHtml(l.borrower_name || "")}">Agreements</button>`
          : ":";
      return `
    <tr class="loan-row" data-loan-key="${rowId}" data-member-id="${l.borrower_id || ""}" data-loan-number="${l.loan_number || ""}" data-ledger="${isLedger ? "1" : "0"}">
      <td>${loanLabel}</td>
      <td>${escapeHtml(l.borrower_name)}</td>
      <td>${isLedger ? formatDate(l.start_date) : l.start_date || ":"}</td>
      <td class="money">${fmt.format(l.principal)}</td>
      <td class="money">${fmt.format(l.collected ?? 0)}</td>
      <td class="money">${fmt.format(l.interest_income ?? 0)}</td>
      <td class="money">${fmt.format(l.outstanding ?? 0)}</td>
      <td>${escapeHtml(l.status)}</td>
      <td>${isLedger ? l.repayment_count ?? 0 : l.schedule_imported ? "Scheduled" : ":"}</td>
      <td>${
        isLedger
          ? `<button type="button" class="btn small loan-statement-btn" data-member-id="${l.borrower_id}" data-loan-number="${l.loan_number}">Statement</button>`
          : ":"
      }</td>
      <td>${agreementsBtn}</td>
    </tr>
    <tr class="loan-detail-row hidden" data-detail-for="${rowId}">
      <td colspan="11" class="loan-detail-cell">Click the loan row to load disbursement and repayment details.</td>
    </tr>`;
    })
    .join("");

  body.querySelectorAll(".loan-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".loan-agreements-btn") || e.target.closest(".loan-statement-btn")) return;
      toggleLoanDetail(row);
    });
  });
  bindLoanStatementButtons(body);
  body.querySelectorAll(".loan-agreements-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openLoanAgreementsPanel(btn.dataset.loanId, btn.dataset.borrower);
    });
  });
  } catch (err) {
    if (requestId !== loansRequestId) return;
    if (body) body.innerHTML = `<tr><td colspan="11" class="status err">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function toggleLoanDetail(row) {
  const key = row.dataset.loanKey;
  const detailRow = document.querySelector(`tr[data-detail-for="${key}"]`);
  if (!detailRow) return;

  if (!detailRow.classList.contains("hidden")) {
    detailRow.classList.add("hidden");
    return;
  }

  cancelLoanDetailLoads();
  const requestId = ++loanDetailRequestId;
  hideLoanDetailRows();

  if (row.dataset.ledger !== "1") {
    detailRow.querySelector(".loan-detail-cell").innerHTML =
      '<p class="subtle">Use the Member Profile for Transaction History on Manually Entered Loans.</p>';
    detailRow.classList.remove("hidden");
    return;
  }

  const cell = detailRow.querySelector(".loan-detail-cell");
  cell.textContent = "Loading…";
  detailRow.classList.remove("hidden");

  try {
    const res = await fetch(
      `/api/loans/ledger/${row.dataset.memberId}/${row.dataset.loanNumber}`
    );
    if (requestId !== loanDetailRequestId) return;
    const { loan } = await res.json();
    if (requestId !== loanDetailRequestId) return;
    if (!res.ok) throw new Error(loan?.error || "Failed to load loan details");
    cell.innerHTML = loanLotCardHtml(loan, row.dataset.memberId).replace(
      'class="loan-lot-card loan-lot-disclosure profile-disclosure"',
      'class="loan-lot-card loan-lot-disclosure profile-disclosure inline"'
    );
    bindLoanStatementButtons(detailRow);
  } catch (err) {
    if (requestId !== loanDetailRequestId) return;
    cell.innerHTML = `<p class="status err">${escapeHtml(err.message)}</p>`;
  }
}

$("#refreshMembers").addEventListener("click", loadMembers);
$("#goRegisterMemberBtn")?.addEventListener("click", () => {
  switchTab("record");
  openRecordSection("recordSectionRegisterMember");
});
$("#refreshBooks")?.addEventListener("click", loadBooks);

function collapseMonthlyStatusReportSettings() {
  const panel = $("#monthlyStatusReportSettingsPanel");
  if (panel?.tagName === "DETAILS") panel.removeAttribute("open");
}

function collapseMonthlyStatusReportPanel() {
  const panel = $("#monthlyStatusReportPanel");
  if (panel?.tagName === "DETAILS") panel.removeAttribute("open");
}

function isMonthEndAutoPublishEnabled(settings) {
  return Boolean(settings?.autoGenerate && settings?.autoPublish);
}

function applyMonthlyStatusReportSettingsToForm(settings) {
  const autoGen = $("#monthlyStatusAutoGenerate");
  const autoPub = $("#monthlyStatusAutoPublish");
  const website = $("#monthlyStatusOrgWebsite");
  const timezone = $("#cooperativeTimezone");
  if (autoGen) autoGen.checked = Boolean(settings.autoGenerate);
  if (autoPub) autoPub.checked = Boolean(settings.autoPublish);
  if (website) website.value = settings.organizationWebsite || "";
  if (settings.cooperativeTimezone) {
    applyCooperativeTimezone(settings.cooperativeTimezone);
    populateTimezoneSelect(timezone, [], settings.cooperativeTimezone);
  }
  updateMonthEndAutoPublishButton(settings);
}

function updateMonthEndAutoPublishButton(settings) {
  const btn = $("#toggleMonthEndAutoPublish");
  if (!btn || !settings) return;
  const enabled = isMonthEndAutoPublishEnabled(settings);
  btn.textContent = enabled ? "Month-end auto-publish: ON" : "Month-end auto-publish: OFF";
  btn.classList.toggle("is-on", enabled);
  btn.classList.toggle("is-off", !enabled);
  btn.setAttribute("aria-pressed", enabled ? "true" : "false");
}

let expenseReportLabelCatalog = [];

function renderOperationalExpensesSummaryHtml(summary) {
  if (!summary?.groups?.length) {
    return '<p class="subtle">No operational expenses recorded.</p>';
  }
  const groupsHtml = summary.groups
    .map((group) => {
      const lineRows = group.lines
        .map(
          (line) => `
        <tr>
          <td>${escapeHtml(line.expenseDate)}</td>
          <td>${escapeHtml(line.description)}</td>
          <td class="money">${fmt.format(line.amount)}</td>
        </tr>`
        )
        .join("");
      const table = `<div class="table-wrap compact"><table class="operational-expense-detail-table">
        <thead><tr><th>Date</th><th>Description</th><th class="money">Amount</th></tr></thead>
        <tbody>${lineRows}</tbody>
      </table></div>`;

      if (!group.consolidated || group.lines.length <= 1) {
        const line = group.lines[0];
        const label = group.consolidated
          ? group.label
          : line?.description || group.label;
        return `<div class="operational-expense-row flat">
          <div class="operational-expense-row-head">
            <span>${escapeHtml(label)}</span>
            <span class="money">${fmt.format(group.amount)}</span>
          </div>
        </div>`;
      }

      return `<details class="profile-disclosure operational-expense-group">
        <summary class="operational-expense-group-summary">
          <span>${escapeHtml(group.label)}</span>
          <span class="money">${fmt.format(group.amount)}</span>
        </summary>
        <div class="profile-disclosure-body">${table}</div>
      </details>`;
    })
    .join("");

  return `${groupsHtml}
    <p class="operational-expense-total"><strong>Total Operational Expenses</strong> <span class="money">${fmt.format(summary.total)}</span></p>`;
}

async function loadOperationalExpensesPreview({ apiPath, bodyEl, totalEl, sectionEl, overviewEl }) {
  if (!bodyEl) return;
  try {
    const res = await fetch(apiPath);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load operational expenses");
    const summary = data.summary;
    if (!summary) {
      sectionEl?.classList.add("hidden");
      return;
    }
    sectionEl?.classList.remove("hidden");
    if (totalEl) totalEl.textContent = fmt.format(summary.total);
    bodyEl.innerHTML = renderOperationalExpensesSummaryHtml(summary);
    if (overviewEl) {
      if (data.performanceOverview) {
        overviewEl.textContent = data.performanceOverview;
        overviewEl.classList.remove("hidden");
      } else {
        overviewEl.textContent = "";
        overviewEl.classList.add("hidden");
      }
    }
  } catch (err) {
    if (sectionEl) sectionEl.classList.remove("hidden");
    bodyEl.innerHTML = `<p class="status err">${escapeHtml(err.message)}</p>`;
  }
}

function expenseReportLabelOptionsHtml(selectedId) {
  const options = ['<option value="">Select label…</option>'];
  for (const entry of expenseReportLabelCatalog) {
    const selected = Number(selectedId) === Number(entry.id) ? " selected" : "";
    options.push(`<option value="${entry.id}"${selected}>${escapeHtml(entry.label)}</option>`);
  }
  options.push('<option value="__other__">Other…</option>');
  return options.join("");
}

function renderExpenseReportLabelsTable(lines) {
  const body = $("#expenseReportLabelsBody");
  if (!body) return;
  if (!lines?.length) {
    body.innerHTML = "<tr><td colspan=\"4\">No expenses recorded.</td></tr>";
    return;
  }
  body.innerHTML = lines
    .map(
      (line) => `
    <tr data-expense-id="${line.id}">
      <td>${escapeHtml(line.expenseDate)}</td>
      <td>${escapeHtml(line.description)}</td>
      <td class="money">${fmt.format(line.amount)}</td>
      <td>
        <select class="expense-report-label-select" data-expense-id="${line.id}">
          ${expenseReportLabelOptionsHtml(line.reportLabelId)}
        </select>
        <input type="text" class="other-label-input hidden" placeholder="New report label" />
      </td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".expense-report-label-select").forEach((select) => {
    select.addEventListener("change", () => {
      const otherInput = select.parentElement?.querySelector(".other-label-input");
      if (!otherInput) return;
      if (select.value === "__other__") {
        otherInput.classList.remove("hidden");
        otherInput.focus();
      } else {
        otherInput.classList.add("hidden");
        otherInput.value = "";
      }
    });
  });
}

async function loadExpenseReportLabelsPanel() {
  const body = $("#expenseReportLabelsBody");
  if (!body || currentUser?.role !== "admin") return;
  try {
    const res = await fetch("/api/books/expense-report-labels");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load expense labels");
    expenseReportLabelCatalog = data.labels || [];
    renderExpenseReportLabelsTable(data.lines || []);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="status err">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function saveExpenseReportLabels() {
  const statusEl = $("#expenseReportLabelsStatus");
  const saveBtn = $("#saveExpenseReportLabels");
  const rows = $("#expenseReportLabelsBody")?.querySelectorAll("tr[data-expense-id]");
  if (!rows?.length) return;

  const assignments = [];
  for (const row of rows) {
    const expenseId = Number(row.dataset.expenseId);
    const select = row.querySelector(".expense-report-label-select");
    const otherInput = row.querySelector(".other-label-input");
    if (!select) continue;
    if (select.value === "__other__") {
      const label = otherInput?.value?.trim();
      if (!label) {
        if (statusEl) {
          statusEl.textContent = "Enter a new label for each expense set to Other.";
          statusEl.className = "status err";
        }
        return;
      }
      assignments.push({ expenseId, label });
    } else if (select.value) {
      assignments.push({ expenseId, reportLabelId: Number(select.value) });
    } else {
      assignments.push({ expenseId, reportLabelId: null });
    }
  }

  setButtonBusy(saveBtn, true, "Saving…");
  try {
    const res = await fetch("/api/books/expense-report-labels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save expense labels");
    expenseReportLabelCatalog = data.labels || [];
    renderExpenseReportLabelsTable(data.lines || []);
    if (statusEl) {
      statusEl.textContent = "Expense labels saved. Regenerate the report to refresh the PDF.";
      statusEl.className = "status ok";
    }
    loadOperationalExpensesPreview({
      apiPath: "/api/books/operational-expenses-summary",
      bodyEl: $("#operationalExpensesPreviewBody"),
      totalEl: $("#operationalExpensesPreviewTotal"),
      sectionEl: $("#operationalExpensesPreview"),
    });
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    }
  } finally {
    setButtonBusy(saveBtn, false);
  }
}

async function loadMonthlyStatusReportPanel() {
  const panel = $("#monthlyStatusReportPanel");
  if (!panel) return;
  const badge = $("#monthlyStatusReportBadge");
  const periodEl = $("#monthlyStatusReportPeriod");
  const statusEl = $("#monthlyStatusReportStatus");
  const downloadBtn = $("#downloadMonthlyStatusReport");
  const publishBtn = $("#publishMonthlyStatusReport");
  const unpublishBtn = $("#unpublishMonthlyStatusReport");
  const generateBtn = $("#generateMonthlyStatusReport");
  try {
    const [statusRes, settingsRes] = await Promise.all([
      fetch("/api/books/monthly-status-report/status"),
      currentUser?.role === "admin"
        ? fetch("/api/books/monthly-status-report/settings")
        : Promise.resolve(null),
    ]);
    const statusData = await statusRes.json();
    if (!statusRes.ok) throw new Error(statusData.error || "Failed to load report status");

    const { status } = statusData;
    if (periodEl) {
      periodEl.textContent = `${status.period.periodLabel} (as at ${status.period.labelUs})`;
    }

    if (badge) {
      if (status.published) {
        badge.textContent = "Published";
        badge.className = "badge ok";
      } else if (status.generated) {
        badge.textContent = "Draft";
        badge.className = "badge warn";
      } else {
        badge.textContent = "Not Generated";
        badge.className = "badge";
      }
    }

    if (downloadBtn) downloadBtn.disabled = !status.generated;
    if (publishBtn) publishBtn.disabled = !status.generated || status.published;
    if (unpublishBtn) unpublishBtn.disabled = !status.published;

    if (settingsRes?.ok) {
      const { settings } = await settingsRes.json();
      await ensureTimezoneOptions(settings.cooperativeTimezone);
      const settingsPanel = $("#monthlyStatusReportSettingsPanel");
      applyMonthlyStatusReportSettingsToForm(settings);
      if (settingsPanel && settings.organizationWebsite) {
        settingsPanel.removeAttribute("open");
      }
    }

    const overviewEl = $("#monthlyStatusPerformanceOverview");
    if (overviewEl) {
      if (status.performanceOverview) {
        overviewEl.textContent = status.performanceOverview;
        overviewEl.classList.remove("hidden");
      } else {
        overviewEl.textContent = "";
        overviewEl.classList.add("hidden");
      }
    }

    if (statusEl && status.generated) {
      const generatedLabel =
        status.generatedAtLabel ||
        formatInstantDate(status.generatedAt) ||
        "recently";
      const parts = [`Generated ${generatedLabel}`];
      if (status.published) {
        const publishedLabel =
          status.publishedAtLabel ||
          formatInstantDate(status.publishedAt) ||
          "to members";
        parts.push(`published ${publishedLabel}`);
      } else if (currentUser?.role === "admin") {
        parts.push("not yet published to members");
      }
      statusEl.textContent = parts.join(" · ");
      statusEl.className = "status ok";
    } else if (statusEl) {
      statusEl.textContent =
        currentUser?.role === "admin"
          ? "Generate the report manually or enable automatic generation at month end."
          : "The administrator has not generated this month's report yet.";
      statusEl.className = "status";
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    }
    if (downloadBtn) downloadBtn.disabled = true;
    if (publishBtn) publishBtn.disabled = true;
    if (unpublishBtn) unpublishBtn.disabled = true;
  }
  if (currentUser?.role === "admin") {
    loadExpenseReportLabelsPanel();
  }
  if (currentUser?.role === "admin" || currentUser?.role === "staff") {
    loadOperationalExpensesPreview({
      apiPath: "/api/books/operational-expenses-summary",
      bodyEl: $("#operationalExpensesPreviewBody"),
      totalEl: $("#operationalExpensesPreviewTotal"),
      sectionEl: $("#operationalExpensesPreview"),
    });
  }
}

async function downloadMonthlyStatusReportFile(button) {
  setButtonBusy(button, true, "Downloading…");
  try {
    const res = await fetch("/api/books/monthly-status-report/download");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to download report");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const fileName = match?.[1] || "Cooperative Status Report.pdf";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

async function generateMonthlyStatusReportNow(button) {
  setButtonBusy(button, true, "Generating…");
  const statusEl = $("#monthlyStatusReportStatus");
  try {
    const res = await fetch("/api/books/monthly-status-report/generate", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate report");
    if (statusEl) {
      statusEl.textContent = data.result?.published
        ? "Report generated and published to members."
        : "Report generated. Publish when ready for members to view.";
      statusEl.className = "status ok";
    }
    await loadMonthlyStatusReportPanel();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    } else {
      alert(err.message);
    }
  } finally {
    setButtonBusy(button, false);
  }
}

async function publishMonthlyStatusReportNow(button) {
  setButtonBusy(button, true, "Publishing…");
  const statusEl = $("#monthlyStatusReportStatus");
  try {
    const res = await fetch("/api/books/monthly-status-report/publish", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to publish report");
    if (statusEl) {
      statusEl.textContent = "Report published. Members can download it from My Account.";
      statusEl.className = "status ok";
    }
    await loadMonthlyStatusReportPanel();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    } else {
      alert(err.message);
    }
  } finally {
    setButtonBusy(button, false);
  }
}

async function unpublishMonthlyStatusReportNow(button) {
  if (
    !confirm(
      "Remove this report from the member portal? Members will not see it until you publish again."
    )
  ) {
    return;
  }
  setButtonBusy(button, true, "Unpublishing…");
  const statusEl = $("#monthlyStatusReportStatus");
  try {
    const res = await fetch("/api/books/monthly-status-report/unpublish", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to unpublish report");
    if (statusEl) {
      statusEl.textContent =
        "Report unpublished. Fix any issues, generate again if needed, then publish when ready.";
      statusEl.className = "status ok";
    }
    await loadMonthlyStatusReportPanel();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    } else {
      alert(err.message);
    }
  } finally {
    setButtonBusy(button, false);
  }
}

async function toggleMonthEndAutoPublish(button) {
  const statusEl = $("#monthlyStatusReportStatus");
  const autoGen = $("#monthlyStatusAutoGenerate");
  const autoPub = $("#monthlyStatusAutoPublish");
  const currentlyOn = Boolean(autoGen?.checked && autoPub?.checked);
  const nextEnabled = !currentlyOn;
  setButtonBusy(button, true, "Saving…");
  try {
    const res = await fetch("/api/books/monthly-status-report/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoGenerate: nextEnabled,
        autoPublish: nextEnabled,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update month-end auto-publish");
    applyMonthlyStatusReportSettingsToForm(data.settings);
    if (statusEl) {
      statusEl.textContent = nextEnabled
        ? "Month-end auto-publish is on. The report will be generated and published on the last day of each month."
        : "Month-end auto-publish is off. Publish reports manually when ready.";
      statusEl.className = "status ok";
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    }
  } finally {
    setButtonBusy(button, false);
  }
}

async function saveMonthlyStatusReportSettings() {
  const statusEl = $("#monthlyStatusReportStatus");
  const saveBtn = $("#saveMonthlyStatusSettings");
  setButtonBusy(saveBtn, true, "Saving…");
  try {
    const res = await fetch("/api/books/monthly-status-report/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoGenerate: $("#monthlyStatusAutoGenerate")?.checked || false,
        autoPublish: $("#monthlyStatusAutoPublish")?.checked || false,
        organizationWebsite: $("#monthlyStatusOrgWebsite")?.value?.trim() || "",
        cooperativeTimezone: $("#cooperativeTimezone")?.value || cooperativeTimezone,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save settings");
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.className = "status";
    }
    collapseMonthlyStatusReportSettings();
    applyMonthlyStatusReportSettingsToForm(data.settings);
    applyCooperativeTimezone(data.settings?.cooperativeTimezone);
    await loadMonthlyStatusReportPanel();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    }
  } finally {
    setButtonBusy(saveBtn, false);
  }
}

async function loadMyCooperativeReports() {
  const card = $("#myCooperativeReportsCard");
  const list = $("#myCooperativeReportsList");
  const badge = $("#myCooperativeReportsBadge");
  const overviewEl = $("#myPerformanceOverview");
  const overviewMetaEl = $("#myPerformanceOverviewMeta");
  if (!card || !list) return;
  try {
    const res = await fetch("/api/me/cooperative-status-reports");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const reports = data.reports || [];
    if (!reports.length) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");
    const latest = reports[0];
    if (badge) {
      badge.textContent =
        reports.length === 1
          ? latest.periodSlug
          : `${latest.periodSlug} · ${reports.length} reports`;
      badge.className = "badge ok";
    }
    if (overviewMetaEl) {
      overviewMetaEl.textContent = `Summary for latest published report (${latest.periodSlug}): as at ${formatDate(latest.asOfDate)}.`;
      overviewMetaEl.classList.remove("hidden");
    }
    if (overviewEl) {
      if (data.performanceOverview) {
        overviewEl.textContent = data.performanceOverview;
        overviewEl.classList.remove("hidden");
      } else {
        overviewEl.textContent = "";
        overviewEl.classList.add("hidden");
      }
    }
    list.innerHTML = reports
      .map(
        (report) => `
      <li class="cooperative-report-row">
        <button type="button" class="cooperative-report-open" data-period-slug="${escapeHtml(report.periodSlug)}">
          <span class="cooperative-report-open-eyebrow">View PDF Report</span>
          <span class="cooperative-report-open-title">Cooperative Performance · ${escapeHtml(report.periodSlug)}</span>
          <span class="cooperative-report-open-hint">As at ${escapeHtml(formatDate(report.asOfDate))} · Tap to open full report</span>
        </button>
      </li>`
      )
      .join("");
    list.querySelectorAll(".cooperative-report-open").forEach((btn) => {
      btn.addEventListener("click", () => {
        const report = reports.find((row) => row.periodSlug === btn.dataset.periodSlug);
        if (report) openCooperativeReportViewer(report);
      });
    });
  } catch {
    card.classList.add("hidden");
  }
}

let activeCooperativeReportView = null;
let activeCooperativeReportBlobUrl = null;

const PDF_JS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

function prefersMobilePdfCanvas() {
  return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdfjs="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.pdfjsLib));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = `${PDF_JS_CDN}/pdf.min.js`;
    script.dataset.pdfjs = "true";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDF_JS_CDN}/pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Could not load PDF viewer"));
    document.head.appendChild(script);
  });
}

async function renderCooperativeReportPdfCanvas(blob, container) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
  container.innerHTML = "";
  const width = Math.max(container.clientWidth || window.innerWidth, 280) - 16;
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = width / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    container.appendChild(canvas);
  }
}

function setCooperativeReportViewerMode(mode) {
  const frame = $("#cooperativeReportViewerFrame");
  const canvas = $("#cooperativeReportViewerCanvas");
  if (mode === "canvas") {
    frame?.classList.add("hidden");
    canvas?.classList.remove("hidden");
  } else {
    canvas?.classList.add("hidden");
    if (canvas) canvas.innerHTML = "";
    frame?.classList.remove("hidden");
  }
}

function initCooperativeReportViewer() {
  $("#cooperativeReportViewerBack")?.addEventListener("click", closeCooperativeReportViewer);
  $("#cooperativeReportViewerDownload")?.addEventListener("click", () => {
    downloadCooperativeReport(
      activeCooperativeReportView,
      $("#cooperativeReportViewerDownload")
    );
  });
}

async function openCooperativeReportViewer(report) {
  const viewer = $("#cooperativeReportViewer");
  const frame = $("#cooperativeReportViewerFrame");
  const canvasHost = $("#cooperativeReportViewerCanvas");
  const title = $("#cooperativeReportViewerTitle");
  if (!viewer || !frame || !report?.periodSlug) return;
  activeCooperativeReportView = report;
  if (title) {
    title.textContent = `Loading report · ${report.periodSlug}…`;
  }
  if (activeCooperativeReportBlobUrl) {
    URL.revokeObjectURL(activeCooperativeReportBlobUrl);
    activeCooperativeReportBlobUrl = null;
  }
  frame.src = "about:blank";
  if (canvasHost) canvasHost.innerHTML = "";
  viewer.classList.remove("hidden");
  document.body.classList.add("cooperative-report-viewer-open");
  const reportsCard = document.getElementById("myCooperativeReportsCard");
  if (reportsCard?.open) reportsCard.open = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    const res = await fetch(
      `/api/me/cooperative-status-reports/${encodeURIComponent(report.periodSlug)}/view`
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Could not load report");
    }
    const blob = await res.blob();
    activeCooperativeReportBlobUrl = URL.createObjectURL(blob);
    if (prefersMobilePdfCanvas() && canvasHost) {
      setCooperativeReportViewerMode("canvas");
      await renderCooperativeReportPdfCanvas(blob, canvasHost);
    } else {
      setCooperativeReportViewerMode("iframe");
      frame.src = `${activeCooperativeReportBlobUrl}#view=FitH`;
    }
    if (title) {
      title.textContent = `Cooperative Performance · ${report.periodSlug} · as at ${formatDate(report.asOfDate)}`;
    }
  } catch (err) {
    closeCooperativeReportViewer();
    alert(err.message);
  }
}

function closeCooperativeReportViewer() {
  const viewer = $("#cooperativeReportViewer");
  const frame = $("#cooperativeReportViewerFrame");
  const canvasHost = $("#cooperativeReportViewerCanvas");
  if (activeCooperativeReportBlobUrl) {
    URL.revokeObjectURL(activeCooperativeReportBlobUrl);
    activeCooperativeReportBlobUrl = null;
  }
  if (frame) frame.src = "about:blank";
  if (canvasHost) canvasHost.innerHTML = "";
  setCooperativeReportViewerMode("iframe");
  viewer?.classList.add("hidden");
  document.body.classList.remove("cooperative-report-viewer-open");
  activeCooperativeReportView = null;
}

async function downloadCooperativeReport(report, triggerBtn) {
  if (!report?.periodSlug) return;
  try {
    if (triggerBtn) setButtonBusy(triggerBtn, true, "Downloading…");
    const res = await fetch(
      `/api/me/cooperative-status-reports/${encodeURIComponent(report.periodSlug)}/file`
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Download failed");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const fileName = match?.[1] || report.fileName || "Cooperative Performance Report.pdf";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert(err.message);
  } finally {
    if (triggerBtn) setButtonBusy(triggerBtn, false);
  }
}

function meetingStatusLabel(status) {
  if (status === "announced") return "Announced";
  if (status === "cancelled") return "Cancelled";
  return "Draft";
}

function meetingStatusBadgeClass(meeting) {
  if (meeting.status === "cancelled") return "err";
  if (meeting.status === "announced" && meeting.upcoming) return "ok";
  if (meeting.status === "announced") return "";
  return "";
}

function resetCooperativeMeetingForm() {
  $("#cooperativeMeetingId").value = "";
  $("#cooperativeMeetingTitle").value = "";
  $("#cooperativeMeetingDate").value = "";
  $("#cooperativeMeetingTime").value = "";
  $("#cooperativeMeetingLocation").value = "";
  $("#cooperativeMeetingVirtualLink").value = "";
  $("#cooperativeMeetingAgenda").value = "";
  $("#cooperativeMeetingAdminNotes").value = "";
  $("#resetCooperativeMeetingForm")?.classList.add("hidden");
}

function fillCooperativeMeetingForm(meeting) {
  $("#cooperativeMeetingId").value = meeting.id;
  $("#cooperativeMeetingTitle").value = meeting.title || "";
  $("#cooperativeMeetingDate").value = meeting.meetingDate || "";
  $("#cooperativeMeetingTime").value = meeting.meetingTime || "";
  $("#cooperativeMeetingLocation").value = meeting.location || "";
  $("#cooperativeMeetingVirtualLink").value = meeting.virtualLink || "";
  $("#cooperativeMeetingAgenda").value = meeting.agenda || "";
  $("#cooperativeMeetingAdminNotes").value = meeting.adminNotes || "";
  $("#resetCooperativeMeetingForm")?.classList.remove("hidden");
  const schedulePanel = $("#cooperativeMeetingSchedulePanel");
  if (schedulePanel) {
    schedulePanel.open = true;
    schedulePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function readCooperativeMeetingFormPayload() {
  return {
    title: $("#cooperativeMeetingTitle")?.value?.trim(),
    meetingDate: $("#cooperativeMeetingDate")?.value,
    meetingTime: $("#cooperativeMeetingTime")?.value?.slice(0, 5),
    location: $("#cooperativeMeetingLocation")?.value?.trim(),
    virtualLink: $("#cooperativeMeetingVirtualLink")?.value?.trim(),
    agenda: $("#cooperativeMeetingAgenda")?.value?.trim(),
    adminNotes: $("#cooperativeMeetingAdminNotes")?.value?.trim(),
  };
}

function applyMeetingSettingsToForm(settings) {
  if ($("#meetingsAutoReminder")) {
    $("#meetingsAutoReminder").checked = settings?.autoReminder !== false;
  }
  if ($("#meetingsReminderHours") && settings?.reminderHours != null) {
    $("#meetingsReminderHours").value = settings.reminderHours;
  }
}

async function loadCooperativeMeetingsPanel() {
  const badge = $("#cooperativeMeetingsBadge");
  const list = $("#cooperativeMeetingsList");
  const statusEl = $("#cooperativeMeetingsStatus");
  if (!list) return;
  try {
    const res = await fetch("/api/books/meetings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load meetings");
    const meetings = data.meetings || [];
    applyMeetingSettingsToForm(data.settings);
    if (badge) {
      const upcoming = meetings.filter((m) => m.status === "announced" && m.upcoming).length;
      if (!meetings.length) {
        badge.textContent = "None scheduled";
        badge.className = "badge";
      } else if (upcoming) {
        badge.textContent = `${upcoming} upcoming`;
        badge.className = "badge ok";
      } else {
        badge.textContent = `${meetings.length} total`;
        badge.className = "badge";
      }
    }
    if (!meetings.length) {
      list.innerHTML = `<li class="hint">No meetings yet. Save a draft below, then announce it to members.</li>`;
      return;
    }
    list.innerHTML = meetings
      .map((meeting) => {
        const isAdmin = currentUser?.role === "admin";
        const actions = [];
        if (isAdmin && meeting.status === "draft") {
          actions.push(
            `<button type="button" class="btn linkish meeting-edit" data-id="${meeting.id}">Edit</button>`,
            `<button type="button" class="btn linkish meeting-announce" data-id="${meeting.id}">Announce to Members</button>`,
            `<button type="button" class="btn linkish meeting-delete" data-id="${meeting.id}">Delete</button>`
          );
        }
        if (isAdmin && meeting.status === "announced") {
          actions.push(
            `<button type="button" class="btn linkish meeting-edit" data-id="${meeting.id}">Edit Details</button>`,
            `<button type="button" class="btn linkish meeting-resend" data-id="${meeting.id}">Resend Email</button>`,
            `<button type="button" class="btn linkish meeting-cancel" data-id="${meeting.id}">Cancel Meeting</button>`
          );
        }
        const loc = meeting.location
          ? ` · ${escapeHtml(meeting.location)}`
          : meeting.virtualLink
            ? " · Online"
            : "";
        return `<li class="cooperative-meeting-item">
          <div class="cooperative-meeting-item-head">
            <strong>${escapeHtml(meeting.title)}</strong>
            <span class="badge ${meetingStatusBadgeClass(meeting)}">${escapeHtml(meetingStatusLabel(meeting.status))}</span>
          </div>
          <div class="subtle">${escapeHtml(meeting.meetingDateLabel)} at ${escapeHtml(meeting.meetingTimeLabel)} (${escapeHtml(meeting.timezoneLabel)})${loc}</div>
          ${meeting.agenda ? `<div class="cooperative-meeting-agenda">${escapeHtml(meeting.agenda)}</div>` : ""}
          ${actions.length ? `<div class="cooperative-meeting-actions">${actions.join(" · ")}</div>` : ""}
        </li>`;
      })
      .join("");

    list.querySelectorAll(".meeting-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const meeting = meetings.find((m) => String(m.id) === btn.dataset.id);
        if (meeting) fillCooperativeMeetingForm(meeting);
      });
    });
    list.querySelectorAll(".meeting-announce").forEach((btn) => {
      btn.addEventListener("click", () => announceCooperativeMeeting(btn));
    });
    list.querySelectorAll(".meeting-cancel").forEach((btn) => {
      btn.addEventListener("click", () => cancelCooperativeMeeting(btn));
    });
    list.querySelectorAll(".meeting-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteCooperativeMeeting(btn));
    });
    list.querySelectorAll(".meeting-resend").forEach((btn) => {
      btn.addEventListener("click", () => resendCooperativeMeetingEmail(btn));
    });
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.className = "status";
    }
  } catch (err) {
    if (list) list.innerHTML = `<li class="status err">${escapeHtml(err.message)}</li>`;
    if (badge) {
      badge.textContent = "Error";
      badge.className = "badge err";
    }
  }
}

async function saveCooperativeMeetingDraft(e) {
  e?.preventDefault();
  const statusEl = $("#cooperativeMeetingsStatus");
  const submitBtn = $("#saveCooperativeMeeting");
  const id = $("#cooperativeMeetingId")?.value;
  const payload = readCooperativeMeetingFormPayload();
  setButtonBusy(submitBtn, true, "Saving…");
  try {
    const res = await fetch(id ? `/api/books/meetings/${id}` : "/api/books/meetings", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    if (statusEl) {
      statusEl.textContent = id ? "Meeting updated." : "Draft saved.";
      statusEl.className = "status ok";
    }
    resetCooperativeMeetingForm();
    await loadCooperativeMeetingsPanel();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    }
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

async function announceCooperativeMeeting(button) {
  if (!confirm("Announce this meeting to all members on the portal and by email (if configured)?")) return;
  setButtonBusy(button, true, "Announcing…");
  try {
    const res = await fetch(`/api/books/meetings/${button.dataset.id}/announce`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Announce failed");
    resetCooperativeMeetingForm();
    await loadCooperativeMeetingsPanel();
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

async function cancelCooperativeMeeting(button) {
  if (!confirm("Cancel this meeting and notify members by email (if configured)?")) return;
  setButtonBusy(button, true, "Cancelling…");
  try {
    const res = await fetch(`/api/books/meetings/${button.dataset.id}/cancel`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Cancel failed");
    await loadCooperativeMeetingsPanel();
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

async function deleteCooperativeMeeting(button) {
  if (!confirm("Delete this draft meeting?")) return;
  setButtonBusy(button, true, "Deleting…");
  try {
    const res = await fetch(`/api/books/meetings/${button.dataset.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed");
    await loadCooperativeMeetingsPanel();
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

async function resendCooperativeMeetingEmail(button) {
  setButtonBusy(button, true, "Sending…");
  try {
    const res = await fetch(`/api/books/meetings/${button.dataset.id}/resend-announcement`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Email failed");
    const sent = data.emailResult?.recipientCount ?? 0;
    const failed = data.emailResult?.failedCount ?? 0;
    alert(
      failed
        ? `Announcement email sent to ${sent} member(s). ${failed} failed. Open Email Send Audit for details.`
        : `Announcement email sent to ${sent} member(s).`
    );
    await loadEmailSendAudit();
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

function formatEmailAuditWhen(iso) {
  if (!iso) return ":";
  try {
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (_) {
    return iso;
  }
}

function statusLabelForDelivery(status) {
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return status || ":";
}

async function loadEmailSendAudit() {
  const summaryEl = $("#emailSendAuditSummary");
  const statusEl = $("#emailSendAuditStatus");
  const body = $("#emailSendAuditBody");
  const recipientsBody = $("#emailSendAuditRecipientsBody");
  if (!body || currentUser?.role !== "admin") return;
  try {
    if (statusEl) {
      statusEl.textContent = "Loading audit…";
      statusEl.className = "status";
    }
    const res = await fetch("/api/books/email-audit?limit=50");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load email audit");
    const summary = data.summary || {};
    const batches = data.batches || [];
    if (summaryEl) {
      const configured = summary.emailConfigured ? "Configured" : "Not configured";
      const last = summary.lastBatchAt
        ? formatEmailAuditWhen(summary.lastBatchAt)
        : "None yet";
      summaryEl.textContent =
        `Email: ${configured}. Eligible recipients: ${summary.recipientCount ?? 0}. ` +
        `Send batches logged: ${summary.batchCount ?? 0}. Last batch: ${last}.`;
    }
    if (!batches.length) {
      body.innerHTML =
        `<tr><td colspan="6" class="hint">No email sends logged yet. After you announce a meeting, resend email, or publish a report, batches appear here.</td></tr>`;
    } else {
      body.innerHTML = batches
        .map((batch) => {
          const failed = Number(batch.detailFailedCount) || 0;
          const sent = batch.hasRecipientDetails
            ? Number(batch.detailSentCount) || 0
            : Number(batch.recipientCount) || 0;
          const subject = batch.subject || batch.triggerLabel || ":";
          const detailHint = batch.hasRecipientDetails
            ? ""
            : " (count only: sent before detailed audit)";
          return `<tr>
            <td>${escapeHtml(formatEmailAuditWhen(batch.sentAt))}</td>
            <td>${escapeHtml(batch.triggerLabel || batch.triggerType || ":")}</td>
            <td>${escapeHtml(subject)}${detailHint ? `<div class="subtle">${detailHint}</div>` : ""}</td>
            <td>${sent}</td>
            <td>${failed}</td>
            <td><button type="button" class="btn linkish email-audit-view" data-id="${batch.id}">View Recipients</button></td>
          </tr>`;
        })
        .join("");
      body.querySelectorAll(".email-audit-view").forEach((btn) => {
        btn.addEventListener("click", () => loadEmailSendAuditBatch(btn.dataset.id));
      });
    }
    if (recipientsBody) {
      const recipients = summary.recipients || [];
      recipientsBody.innerHTML = recipients.length
        ? recipients
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.memberName || ":")}</td><td>${escapeHtml(r.email || ":")}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="2" class="hint">No members currently have an email on file.</td></tr>`;
    }
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.className = "status";
    }
  } catch (err) {
    if (body) {
      body.innerHTML = `<tr><td colspan="6" class="status err">${escapeHtml(err.message)}</td></tr>`;
    }
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    }
  }
}

async function loadEmailSendAuditBatch(batchId) {
  const detail = $("#emailSendAuditDetail");
  const meta = $("#emailSendAuditDetailMeta");
  const body = $("#emailSendAuditDetailBody");
  if (!detail || !body) return;
  try {
    detail.classList.remove("hidden");
    if (meta) meta.textContent = "Loading recipients…";
    body.innerHTML = `<tr><td colspan="4" class="hint">Loading…</td></tr>`;
    const res = await fetch(`/api/books/email-audit/batches/${encodeURIComponent(batchId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load recipients");
    const batch = data.batch || {};
    const deliveries = data.deliveries || [];
    if (meta) {
      meta.textContent = deliveries.length
        ? `${batch.triggerLabel || "Send"} : ${formatEmailAuditWhen(batch.sentAt)} · ${deliveries.length} recipient row(s)`
        : `${batch.triggerLabel || "Send"} : ${formatEmailAuditWhen(batch.sentAt)} · No per-recipient rows (this send was logged before detailed audit). Count only: ${batch.recipientCount ?? 0}.`;
    }
    body.innerHTML = deliveries.length
      ? deliveries
          .map((row) => {
            const note =
              row.status === "failed"
                ? row.errorMessage || "Failed"
                : row.status === "skipped"
                  ? row.errorMessage || "Skipped"
                  : ":";
            return `<tr>
              <td>${escapeHtml(row.memberName || ":")}</td>
              <td>${escapeHtml(row.email || ":")}</td>
              <td>${escapeHtml(statusLabelForDelivery(row.status))}</td>
              <td>${escapeHtml(note)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="4" class="hint">No per-recipient details for this batch.</td></tr>`;
  } catch (err) {
    if (meta) meta.textContent = err.message;
    body.innerHTML = `<tr><td colspan="4" class="status err">${escapeHtml(err.message)}</td></tr>`;
  }
}

$("#refreshEmailSendAudit")?.addEventListener("click", loadEmailSendAudit);

async function saveMeetingSettings() {
  const statusEl = $("#cooperativeMeetingsStatus");
  const btn = $("#saveMeetingSettings");
  setButtonBusy(btn, true, "Saving…");
  try {
    const res = await fetch("/api/books/meetings/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoReminder: $("#meetingsAutoReminder")?.checked || false,
        reminderHours: Number($("#meetingsReminderHours")?.value || 24),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    applyMeetingSettingsToForm(data.settings);
    if (statusEl) {
      statusEl.textContent = "Reminder settings saved.";
      statusEl.className = "status ok";
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.className = "status err";
    }
  } finally {
    setButtonBusy(btn, false);
  }
}

async function loadMyMeetings() {
  const card = $("#myMeetingsCard");
  const list = $("#myMeetingsList");
  const badge = $("#myMeetingsBadge");
  if (!card || !list) return;
  try {
    const res = await fetch("/api/me/meetings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const meetings = (data.meetings || []).filter((m) => m.upcoming);
    if (!meetings.length) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");
    if (badge) {
      badge.textContent = meetings.length === 1 ? "1 upcoming" : `${meetings.length} upcoming`;
      badge.className = "badge ok";
    }
    list.innerHTML = meetings
      .map(
        (meeting) => `
      <li class="my-meeting-item">
        <strong>${escapeHtml(meeting.title)}</strong>
        <div class="subtle">${escapeHtml(meeting.meetingDateLabel)} at ${escapeHtml(meeting.meetingTimeLabel)} (${escapeHtml(meeting.timezoneLabel)})</div>
        ${meeting.location ? `<div>${escapeHtml(meeting.location)}</div>` : ""}
        ${meeting.virtualLink ? `<div><a href="${escapeHtml(meeting.virtualLink)}" target="_blank" rel="noopener noreferrer">Join online</a></div>` : ""}
        ${meeting.agenda ? `<div class="my-meeting-agenda">${escapeHtml(meeting.agenda)}</div>` : ""}
      </li>`
      )
      .join("");
  } catch {
    card.classList.add("hidden");
  }
}

$("#cooperativeMeetingForm")?.addEventListener("submit", saveCooperativeMeetingDraft);
$("#resetCooperativeMeetingForm")?.addEventListener("click", resetCooperativeMeetingForm);
$("#refreshCooperativeMeetings")?.addEventListener("click", loadCooperativeMeetingsPanel);
$("#saveMeetingSettings")?.addEventListener("click", saveMeetingSettings);

$("#downloadMonthlyStatusReport")?.addEventListener("click", (e) => {
  downloadMonthlyStatusReportFile(e.currentTarget);
});
$("#generateMonthlyStatusReport")?.addEventListener("click", (e) => {
  generateMonthlyStatusReportNow(e.currentTarget);
});
$("#publishMonthlyStatusReport")?.addEventListener("click", (e) => {
  publishMonthlyStatusReportNow(e.currentTarget);
});
$("#unpublishMonthlyStatusReport")?.addEventListener("click", (e) => {
  unpublishMonthlyStatusReportNow(e.currentTarget);
});
$("#toggleMonthEndAutoPublish")?.addEventListener("click", (e) => {
  toggleMonthEndAutoPublish(e.currentTarget);
});
$("#saveExpenseReportLabels")?.addEventListener("click", saveExpenseReportLabels);
$("#saveMonthlyStatusSettings")?.addEventListener("click", saveMonthlyStatusReportSettings);

$("#spreadsheetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#spreadsheetStatus");
  status.textContent = "Importing…";
  status.className = "status";
  const fd = new FormData(e.target);
  if (e.target.replace.checked) fd.set("replace", "true");
  try {
    const res = await fetch("/api/import/spreadsheet", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    status.textContent = `Imported ${data.memberCount} members, ${data.transactionCount} transactions.`;
    status.className = "status ok";
    loadMembers();
    loadBooks();
  } catch (err) {
    status.textContent = err.message;
    status.className = "status err";
  }
});

$("#wpformsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#wpformsStatus");
  status.textContent = "Importing profiles…";
  status.className = "status";
  const fd = new FormData(e.target);
  try {
    const res = await fetch("/api/import/wpforms-profiles", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    status.textContent = `Linked ${data.matchedCount} profiles (${data.unmatchedApplications?.length || 0} unmatched applications, ${data.membersWithoutApplication?.length || 0} accounts without applications).`;
    status.className = "status ok";
    loadMembers();
    loadBooks();
  } catch (err) {
    status.textContent = err.message;
    status.className = "status err";
  }
});

$("#scheduleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#scheduleStatus");
  const loanId = e.target.loanId.value;
  const fd = new FormData();
  fd.append("file", e.target.file.files[0]);
  try {
    const res = await fetch(`/api/loans/${loanId}/import-schedule`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    status.textContent = `Imported ${data.installmentsImported} installments.`;
    status.className = "status ok";
    loadLoans();
  } catch (err) {
    status.textContent = err.message;
    status.className = "status err";
  }
});

let bankAppendPreviewData = null;
const BANK_APPEND_LEDGER_TYPES = [
  { value: "deposit", label: "Member Deposit", memberRequired: true },
  { value: "withdrawal", label: "Member Withdrawal", memberRequired: true },
  { value: "loan_repayment", label: "Loan Repayment", memberRequired: true },
  { value: "loan_disbursement", label: "Loan Disbursement", memberRequired: true },
  { value: "distribution", label: "Distribution", memberRequired: true },
  { value: "expense", label: "Expenses", memberRequired: false },
  { value: "cd_purchase", label: "Purchase of Certificate of Deposit", memberRequired: false },
  { value: "cd_liquidation", label: "Liquidation of Certificate of Deposit", memberRequired: false },
  { value: "investment", label: "Investment", memberRequired: false },
];
let bankAccountsCache = [];
let importMemberNamesCache = [];
let statementFormatLabels = {
  auto: "Auto-detect",
  csv_date_description_amount: "Date, Description, Amount",
  csv_date_description_credit_debit: "Date, Description, Credit, Debit",
  csv_summary_then_transactions: "Summary Block Then Transactions",
  template_explicit: "PFM Import Template",
  ofx: "OFX/QFX",
  custom_map: "Custom Column Mapping",
};

function statementFormatLabel(code) {
  return statementFormatLabels[code] || code || "Auto-detect";
}

function toggleColumnMappingPanel(formatValue) {
  const panel = $("#bankColumnMappingPanel");
  const fmt = formatValue ?? $("#bankAccountFormat")?.value;
  if (panel) panel.classList.toggle("hidden", fmt !== "custom_map");
}

function readColumnMappingFromForm() {
  return {
    date: $("#mapColDate")?.value?.trim() || "Date",
    description: $("#mapColDescription")?.value?.trim() || "Description",
    amount: $("#mapColAmount")?.value?.trim() || "Amount",
    credit: $("#mapColCredit")?.value?.trim() || "",
    debit: $("#mapColDebit")?.value?.trim() || "",
    type: $("#mapColType")?.value?.trim() || "",
    member: $("#mapColMember")?.value?.trim() || "",
    reference: $("#mapColReference")?.value?.trim() || "",
  };
}

function fillColumnMappingForm(mapping) {
  const m = mapping || {};
  const set = (id, val) => {
    const el = $(id);
    if (el) el.value = val || "";
  };
  set("#mapColDate", m.date || "Date");
  set("#mapColDescription", m.description || "Description");
  set("#mapColAmount", m.amount || "Amount");
  set("#mapColCredit", m.credit);
  set("#mapColDebit", m.debit);
  set("#mapColType", m.type);
  set("#mapColMember", m.member);
  set("#mapColReference", m.reference);
}

function fillImportRulesForm(rules) {
  if (!rules) return;
  const contrib = $("#importRuleContributions");
  const loans = $("#importRuleLoans");
  if (contrib) contrib.value = (rules.contributionKeywords || []).join(", ");
  if (loans) loans.value = (rules.loanKeywords || []).join(", ");
}

function parseImportRulesFromForm() {
  const splitCsv = (raw) =>
    String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    contributionKeywords: splitCsv($("#importRuleContributions")?.value),
    loanKeywords: splitCsv($("#importRuleLoans")?.value),
  };
}

function paymentAliasRowHtml(alias = {}) {
  const memberName = alias.memberName || "";
  const bankPaymentNames = alias.bankPaymentNames || "";
  const memberOptions = importMemberNamesCache
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}"${name === memberName ? " selected" : ""}>${escapeHtml(name)}</option>`
    )
    .join("");
  return `<tr>
    <td>
      <select class="payment-alias-member">
        <option value="">Select member</option>
        ${memberOptions}
      </select>
    </td>
    <td>
      <input type="text" class="payment-alias-bank-name" value="${escapeHtml(bankPaymentNames)}" placeholder="e.g. SAHEED SALAMI" />
    </td>
    <td><button type="button" class="btn remove-payment-alias-row">Remove</button></td>
  </tr>`;
}

function renderPaymentAliasesTable(aliases) {
  const body = $("#paymentAliasesTableBody");
  if (!body) return;
  const rows = aliases?.length ? aliases : [{ memberName: "", bankPaymentNames: "" }];
  body.innerHTML = rows.map((alias) => paymentAliasRowHtml(alias)).join("");
}

function parsePaymentAliasesFromForm() {
  const body = $("#paymentAliasesTableBody");
  if (!body) return [];
  return [...body.querySelectorAll("tr")]
    .map((row) => ({
      memberName: row.querySelector(".payment-alias-member")?.value?.trim() || "",
      bankPaymentNames: row.querySelector(".payment-alias-bank-name")?.value?.trim() || "",
    }))
    .filter((entry) => entry.memberName && entry.bankPaymentNames);
}

function accountIsActive(account) {
  const today = new Date().toISOString().slice(0, 10);
  if (account.activeTo && account.activeTo < today) return false;
  if (account.activeFrom && account.activeFrom > today) return false;
  return true;
}

function accountOptionLabel(account) {
  const inst = account.institutionName ? ` (${account.institutionName})` : "";
  const status = accountIsActive(account) ? "" : " — inactive";
  return `${account.accountLabel}${inst}${status}`;
}

function fillBankAccountEditForm(account) {
  const inst = $("#bankAccountInstitution");
  const label = $("#bankAccountLabel");
  const currency = $("#bankAccountCurrency");
  const activeFrom = $("#bankAccountActiveFrom");
  const activeTo = $("#bankAccountActiveTo");
  const primary = $("#bankAccountPrimary");
  const format = $("#bankAccountFormat");
  if (!account) return;
  if (inst) {
    inst.value = account.institutionName || "";
    inst.dataset.accountId = String(account.id);
  }
  if (label) label.value = account.accountLabel || "";
  if (currency) currency.value = account.currency || "USD";
  if (format) format.value = account.statementFormat || "auto";
  fillColumnMappingForm(account.columnMapping);
  toggleColumnMappingPanel(account.statementFormat || "auto");
  if (activeFrom) activeFrom.value = account.activeFrom || "";
  if (activeTo) activeTo.value = account.activeTo || "";
  if (primary) primary.checked = !!account.isPrimary;
}

function renderBankAccountsTable(accounts) {
  const body = $("#bankAccountsTableBody");
  if (!body) return;
  if (!accounts.length) {
    body.innerHTML = `<tr><td colspan="6">No bank accounts yet. Use Add Bank Account below.</td></tr>`;
    return;
  }
  body.innerHTML = accounts
    .map((a) => {
      const active = accountIsActive(a);
      return `<tr>
        <td>${escapeHtml(a.accountLabel)}</td>
        <td>${escapeHtml(a.institutionName || ":")}</td>
        <td>${escapeHtml(a.currency || "")}</td>
        <td>${escapeHtml(statementFormatLabel(a.statementFormat))}</td>
        <td>${a.isPrimary ? "Yes" : ""}</td>
        <td>${active ? "Active" : "Inactive"}</td>
      </tr>`;
    })
    .join("");
}

function populateBankAccountSelects(accounts) {
  const appendSelect = $("#bankAppendAccountSelect");
  const editSelect = $("#bankAccountEditSelect");
  const activeAccounts = accounts.filter(accountIsActive);
  const appendOptions = (activeAccounts.length ? activeAccounts : accounts)
    .map((a) => `<option value="${a.id}">${escapeHtml(accountOptionLabel(a))}</option>`)
    .join("");
  if (appendSelect) {
    appendSelect.innerHTML = appendOptions || `<option value="">No accounts</option>`;
    const primary = activeAccounts.find((a) => a.isPrimary) || activeAccounts[0] || accounts[0];
    if (primary) appendSelect.value = String(primary.id);
  }
  if (editSelect) {
    editSelect.innerHTML = accounts
      .map((a) => `<option value="${a.id}">${escapeHtml(accountOptionLabel(a))}</option>`)
      .join("");
    const selectedId = $("#bankAccountInstitution")?.dataset?.accountId;
    const selected =
      accounts.find((a) => String(a.id) === String(selectedId)) ||
      accounts.find((a) => a.isPrimary) ||
      accounts[0];
    if (selected) {
      editSelect.value = String(selected.id);
      fillBankAccountEditForm(selected);
    }
  }
}

async function loadBankAccountsData() {
  const res = await fetch("/api/bank-accounts");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not load bank accounts");
  bankAccountsCache = data.accounts || [];
  renderBankAccountsTable(bankAccountsCache);
  populateBankAccountSelects(bankAccountsCache);
  return bankAccountsCache;
}

async function loadBankImportPanel() {
  await Promise.all([loadBankAccountsData(), loadBankImportSettings()]);
}

async function loadBankAppendAccounts() {
  try {
    await loadBankAccountsData();
  } catch (err) {
    const select = $("#bankAppendAccountSelect");
    if (select) select.innerHTML = `<option value="">Could not load accounts</option>`;
  }
}

async function loadBankImportSettings() {
  try {
    const [settingsRes, membersRes] = await Promise.all([
      fetch("/api/cooperative/import-settings"),
      fetch("/api/members"),
    ]);
    const data = await settingsRes.json();
    if (!settingsRes.ok) return;
    const membersData = membersRes.ok ? await membersRes.json() : { members: [] };
    importMemberNamesCache = (membersData.members || []).map((m) => m.name).filter(Boolean).sort();
    const df = $("#cooperativeDateFormat");
    if (df && data.dateFormat) df.value = data.dateFormat;
    if (data.statementFormats) {
      statementFormatLabels = Object.fromEntries(
        Object.entries(data.statementFormats).map(([k, v]) => [k, v.label || k])
      );
    }
    fillImportRulesForm(data.importRules);
    renderPaymentAliasesTable(data.paymentAliases);
    if (!bankAccountsCache.length) await loadBankAccountsData();
  } catch (_) {}
}

function updateApplyBankAppendButton() {
  const btn = $("#applyBankAppend");
  if (!btn) return;
  const ready = bankAppendPreviewData?.summary?.ready || 0;
  if (ready > 0) {
    btn.textContent = `Add New Transactions (${ready})`;
    btn.title = `Add ${ready} new transaction(s)`;
  } else {
    btn.textContent = "Add New Transactions";
    btn.title = "Preview the file first. PFM will preview automatically when you click if needed.";
  }
}

function bankAppendMemberRequired(ledgerType) {
  return BANK_APPEND_LEDGER_TYPES.find((t) => t.value === ledgerType)?.memberRequired ?? false;
}

function validateBankAppendRowClient(row) {
  const issues = [];
  if (!row.ledgerType) issues.push("Type is required.");
  if (bankAppendMemberRequired(row.ledgerType) && !row.member) {
    issues.push("Member is required for this transaction type.");
  }
  return issues;
}

function rebucketBankAppendPreviewClient() {
  if (!bankAppendPreviewData?.rows) return;
  let ready = 0;
  let needsReview = 0;
  let skipped = 0;
  for (const row of bankAppendPreviewData.rows) {
    if (row.bucket === "skipped") {
      skipped += 1;
      continue;
    }
    const issues = validateBankAppendRowClient(row);
    row.issues = issues;
    row.bucket = issues.length ? "needsReview" : "ready";
    if (row.bucket === "ready") ready += 1;
    else needsReview += 1;
  }
  const summary = bankAppendPreviewData.summary || {};
  const readyDelta = bankAppendPreviewData.rows
    .filter((r) => r.bucket === "ready")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const ledgerBefore = summary.balanceCheck?.ledgerBefore ?? null;
  const projectedLedger =
    ledgerBefore != null ? Math.round((ledgerBefore + readyDelta) * 100) / 100 : null;
  const statementEnding = summary.balanceCheck?.statementEnding ?? null;
  const openingAligned = summary.balanceCheck?.openingAligned;
  const periodCloseMismatch =
    statementEnding != null &&
    projectedLedger != null &&
    Math.abs(projectedLedger - statementEnding) > 0.02;
  bankAppendPreviewData.summary = {
    ...summary,
    ready,
    needsReview,
    skipped,
    balanceCheck: {
      ...summary.balanceCheck,
      projectedLedger,
      periodCloseMismatch,
      mismatch: openingAligned && periodCloseMismatch,
    },
  };
}

function bankAppendTypeSelectHtml(row) {
  const options = BANK_APPEND_LEDGER_TYPES.map(
    (t) =>
      `<option value="${escapeHtml(t.value)}"${t.value === row.ledgerType ? " selected" : ""}>${escapeHtml(t.label)}</option>`
  ).join("");
  return `<select class="bank-append-type" aria-label="Transaction type">${options}</select>`;
}

function bankAppendMemberSelectHtml(row) {
  const memberRequired = bankAppendMemberRequired(row.ledgerType);
  const memberOptions = importMemberNamesCache
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}"${name === row.member ? " selected" : ""}>${escapeHtml(name)}</option>`
    )
    .join("");
  const placeholder = memberRequired ? "Select member" : "None";
  return `<select class="bank-append-member" aria-label="Member"${memberRequired ? " required" : ""}>
    <option value="">${placeholder}</option>
    ${memberOptions}
  </select>`;
}

function collectBankAppendRowOverrides() {
  const overrides = {};
  for (const row of bankAppendPreviewData?.rows || []) {
    if (row.bucket === "skipped") continue;
    overrides[row.index] = {
      ledgerType: row.ledgerType,
      member: row.member || "",
    };
  }
  return overrides;
}

function resetBankAppendPreview() {
  bankAppendPreviewData = null;
  renderBankAppendPreview(null);
  updateApplyBankAppendButton();
}

function renderBankAppendPreview(preview) {
  const panel = $("#bankAppendPreview");
  if (!panel) return;
  bankAppendPreviewData = preview;
  const rows = preview?.rows || [];
  if (!rows.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    updateApplyBankAppendButton();
    return;
  }
  panel.classList.remove("hidden");
  const summary = preview.summary || {};
  const formatNote = summary.resolvedFormat
    ? `<p class="subtle">Detected format: ${escapeHtml(statementFormatLabel(summary.resolvedFormat))}</p>`
    : "";
  const bc = summary.balanceCheck;
  let balanceNote = "";
  if (bc?.statementEnding != null || bc?.statementBeginning != null) {
    const parts = [];
    if (bc.statementBeginning != null) {
      parts.push(`Statement beginning ${fmt.format(bc.statementBeginning)}`);
    }
    if (bc.ledgerBefore != null) {
      parts.push(`Ledger before import ${fmt.format(bc.ledgerBefore)}`);
    }
    if (bc.statementEnding != null) {
      parts.push(`Statement ending ${fmt.format(bc.statementEnding)}`);
    }
    if (bc.projectedLedger != null) {
      parts.push(`Projected after import ${fmt.format(bc.projectedLedger)}`);
    }
    let suffix = "";
    let tone = "subtle";
    if (bc.mismatch) {
      tone = "status warn";
      suffix = " · New rows do not tie to statement ending: review before applying";
    } else if (bc.openingAligned === false && bc.periodOpenGap != null) {
      suffix = ` · Ledger is ${fmt.format(Math.abs(bc.periodOpenGap))} ${bc.periodOpenGap > 0 ? "above" : "below"} statement beginning (pre-period gap, not from new rows above)`;
    } else if (bc.periodCloseMismatch === false && bc.statementEnding != null) {
      suffix = " · Statement ending matches projected ledger";
    }
    balanceNote = `<p class="${tone}">${parts.join(" · ")}${suffix}</p>`;
  }
  panel.innerHTML = `
    <strong>Preview</strong>
    <p class="subtle">Change <strong>Type</strong> or <strong>Member</strong> on <strong>New</strong> or <strong>Review</strong> rows before you add them. Rows already in the ledger (Skipped) cannot be changed here.</p>
    <p id="bankAppendPreviewCounts">${summary.ready || 0} ready to add · ${summary.skipped || 0} already in ledger · ${summary.needsReview || 0} need review</p>
    ${formatNote}
    ${balanceNote}
    <div class="table-wrap">
      <table class="data-table compact bank-append-preview-table">
        <thead>
          <tr><th>Status</th><th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Member</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const status =
                row.bucket === "ready"
                  ? "New"
                  : row.bucket === "skipped"
                    ? "Skipped"
                    : "Review";
              const issues = (row.issues || []).join("; ");
              const editable = row.bucket !== "skipped";
              const typeCell = editable
                ? bankAppendTypeSelectHtml(row)
                : escapeHtml(row.typeLabel || "");
              const memberCell = editable
                ? bankAppendMemberSelectHtml(row)
                : escapeHtml(row.member || "");
              return `<tr data-row-index="${row.index}">
                <td>${escapeHtml(status)}</td>
                <td>${escapeHtml(row.date || "")}</td>
                <td>${escapeHtml(String(row.description || "").slice(0, 80))}</td>
                <td>${escapeHtml(fmt.format(row.amount))}</td>
                <td>${typeCell}</td>
                <td>${memberCell}</td>
                <td class="muted">${escapeHtml(issues)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  updateApplyBankAppendButton();
}

async function downloadImportTemplate(kind, button) {
  setButtonBusy(button, true, "Preparing…");
  try {
    const ext = kind === "xlsx" ? "xlsx" : "csv";
    const res = await fetch(`/api/bank-import/template.${ext}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Download failed");
    }
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pfm-transaction-import-template.${ext}`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

async function previewBankAppendImport() {
  const form = $("#bankAppendForm");
  const status = $("#bankAppendStatus");
  const summary = $("#bankAppendSummary");
  const file = form?.statement?.files?.[0];
  if (!form || !file) {
    if (status) {
      status.textContent = "Choose a statement or template file first.";
      status.className = "status err";
    }
    return;
  }
  const btn = $("#previewBankAppend");
  setButtonBusy(btn, true, "Previewing…");
  if (status) {
    status.textContent = "Analyzing file…";
    status.className = "status";
  }
  if (summary) summary.textContent = "";
  try {
    await loadBankImportSettings();
    const fd = new FormData(form);
    const res = await fetch("/api/bank-import/append/preview", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Preview failed");
    renderBankAppendPreview(data.preview);
    const s = data.preview?.summary || {};
    if (status) {
      status.textContent = `Preview ready: ${s.ready || 0} new, ${s.skipped || 0} skipped, ${s.needsReview || 0} need review.`;
      status.className = s.needsReview ? "status warn" : "status ok";
    }
  } catch (err) {
    renderBankAppendPreview(null);
    if (status) {
      status.textContent = err.message;
      status.className = "status err";
    }
  } finally {
    setButtonBusy(btn, false);
  }
}

async function handleApplyBankAppendClick() {
  const form = $("#bankAppendForm");
  const status = $("#bankAppendStatus");
  const file = form?.statement?.files?.[0];
  if (!form || !file) {
    if (status) {
      status.textContent = "Choose a statement or template file first.";
      status.className = "status err";
    }
    return;
  }
  if (!bankAppendPreviewData) {
    if (status) {
      status.textContent = "Running preview first…";
      status.className = "status";
    }
    await previewBankAppendImport();
  }
  const summary = bankAppendPreviewData?.summary || {};
  const ready = summary.ready || 0;
  const skipped = summary.skipped || 0;
  const needsReview = summary.needsReview || 0;
  if (ready <= 0) {
    if (status) {
      if (needsReview > 0) {
        status.textContent = `${needsReview} row(s) need review. Set Type and Member in the preview table.`;
        status.className = "status warn";
      } else if (skipped > 0) {
        status.textContent = `No new transactions to add. ${skipped} row(s) already in the ledger.`;
        status.className = "status ok";
      } else {
        status.textContent = "No transactions found in this file.";
        status.className = "status warn";
      }
    }
    return;
  }
  await applyBankAppendImport(form);
}

async function applyBankAppendImport(form) {
  const status = $("#bankAppendStatus");
  const summary = $("#bankAppendSummary");
  const file = form?.statement?.files?.[0];
  if (!file) {
    if (status) {
      status.textContent = "Choose a statement or template file first.";
      status.className = "status err";
    }
    return;
  }
  const applyBtn = $("#applyBankAppend");
  setButtonBusy(applyBtn, true, "Importing…");
  if (status) {
    status.textContent = "Adding new transactions…";
    status.className = "status";
  }
  try {
    const fd = new FormData(form);
    const overrides = collectBankAppendRowOverrides();
    if (Object.keys(overrides).length) {
      fd.append("rowOverrides", JSON.stringify(overrides));
    }
    const res = await fetch("/api/bank-import/append/apply", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      if (data.preview) renderBankAppendPreview(data.preview);
      throw new Error(data.error || "Import failed");
    }
    const result = data.result || {};
    renderBankAppendPreview(result);
    updateApplyBankAppendButton();
    if (status) {
      status.textContent = result.message || "Import complete.";
      status.className = "status ok";
    }
    if (summary && result.ledgerEndingBalance != null) {
      summary.textContent = `Ledger checking balance after import: ${fmt.format(result.ledgerEndingBalance)}`;
    }
    if (activeTab === "books") loadBooks();
  } catch (err) {
    if (status) {
      status.textContent = err.message;
      status.className = "status err";
    }
  } finally {
    setButtonBusy(applyBtn, false);
  }
}

async function saveBankAccountSettings(e) {
  e.preventDefault();
  const status = $("#bankAccountSettingsStatus");
  const inst = $("#bankAccountInstitution");
  const label = $("#bankAccountLabel");
  const currency = $("#bankAccountCurrency");
  const activeFrom = $("#bankAccountActiveFrom");
  const activeTo = $("#bankAccountActiveTo");
  const primary = $("#bankAccountPrimary");
  const dateFormat = $("#cooperativeDateFormat");
  const editSelect = $("#bankAccountEditSelect");
  const accountFormat = $("#bankAccountFormat");
  const accountId = editSelect?.value || inst?.dataset?.accountId;
  if (status) {
    status.textContent = "Saving…";
    status.className = "status";
  }
  try {
    if (accountId) {
      const patch = {
        institutionName: inst?.value,
        accountLabel: label?.value,
        currency: currency?.value,
        statementFormat: accountFormat?.value || "auto",
        activeFrom: activeFrom?.value || null,
        activeTo: activeTo?.value || null,
        isPrimary: !!primary?.checked,
      };
      if (accountFormat?.value === "custom_map") {
        patch.columnMapping = readColumnMappingFromForm();
      }
      const res = await fetch(`/api/bank-accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save bank account");
    }
    const settingsRes = await fetch("/api/cooperative/import-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateFormat: dateFormat?.value,
        importRules: parseImportRulesFromForm(),
        paymentAliases: parsePaymentAliasesFromForm(),
      }),
    });
    const settingsData = await settingsRes.json();
    if (!settingsRes.ok) throw new Error(settingsData.error || "Could not save date format");
    fillImportRulesForm(settingsData.importRules);
    renderPaymentAliasesTable(settingsData.paymentAliases);
    await loadBankAccountsData();
    if (status) {
      status.textContent = "Account and settings saved.";
      status.className = "status ok";
    }
  } catch (err) {
    if (status) {
      status.textContent = err.message;
      status.className = "status err";
    }
  }
}

async function addBankAccount(e) {
  e.preventDefault();
  const status = $("#addBankAccountStatus");
  const label = $("#newBankAccountLabel")?.value?.trim();
  if (!label) {
    if (status) {
      status.textContent = "Account label is required.";
      status.className = "status err";
    }
    return;
  }
  if (status) {
    status.textContent = "Adding account…";
    status.className = "status";
  }
  try {
    const res = await fetch("/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountLabel: label,
        institutionName: $("#newBankAccountInstitution")?.value?.trim() || "",
        currency: $("#newBankAccountCurrency")?.value?.trim() || "USD",
        statementFormat: $("#newBankAccountFormat")?.value || "auto",
        activeFrom: $("#newBankAccountActiveFrom")?.value || null,
        isPrimary: !!$("#newBankAccountPrimary")?.checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not add bank account");
    $("#addBankAccountForm")?.reset();
    const currency = $("#newBankAccountCurrency");
    if (currency) currency.value = "USD";
    await loadBankAccountsData();
    if (data.account) fillBankAccountEditForm(data.account);
    if (status) {
      status.textContent = `Added ${data.account?.accountLabel || "bank account"}.`;
      status.className = "status ok";
    }
  } catch (err) {
    if (status) {
      status.textContent = err.message;
      status.className = "status err";
    }
  }
}

$("#bankAccountEditSelect")?.addEventListener("change", (e) => {
  const account = bankAccountsCache.find((a) => String(a.id) === String(e.target.value));
  fillBankAccountEditForm(account);
});
$("#bankAccountFormat")?.addEventListener("change", (e) => {
  toggleColumnMappingPanel(e.target.value);
});
$("#addPaymentAliasRow")?.addEventListener("click", () => {
  const body = $("#paymentAliasesTableBody");
  if (!body) return;
  body.insertAdjacentHTML("beforeend", paymentAliasRowHtml());
});
$("#paymentAliasesTableBody")?.addEventListener("click", (e) => {
  if (!e.target.classList.contains("remove-payment-alias-row")) return;
  const row = e.target.closest("tr");
  const body = $("#paymentAliasesTableBody");
  if (!row || !body) return;
  if (body.querySelectorAll("tr").length <= 1) {
    row.querySelector(".payment-alias-member").value = "";
    row.querySelector(".payment-alias-bank-name").value = "";
    return;
  }
  row.remove();
});
$("#addBankAccountForm")?.addEventListener("submit", addBankAccount);

$("#previewBankAppend")?.addEventListener("click", previewBankAppendImport);

$("#bankAppendPreview")?.addEventListener("change", (e) => {
  if (!bankAppendPreviewData) return;
  const tr = e.target.closest("tr[data-row-index]");
  if (!tr) return;
  const index = Number(tr.dataset.rowIndex);
  const row = bankAppendPreviewData.rows.find((r) => r.index === index);
  if (!row || row.bucket === "skipped") return;

  if (e.target.classList.contains("bank-append-type")) {
    row.ledgerType = e.target.value;
    row.typeLabel =
      BANK_APPEND_LEDGER_TYPES.find((t) => t.value === row.ledgerType)?.label || row.ledgerType;
    row.userOverride = true;
  }
  if (e.target.classList.contains("bank-append-member")) {
    row.member = e.target.value || null;
    row.userOverride = true;
  }

  rebucketBankAppendPreviewClient();
  renderBankAppendPreview(bankAppendPreviewData);
  const s = bankAppendPreviewData.summary || {};
  const status = $("#bankAppendStatus");
  if (status) {
    status.textContent = `Preview ready: ${s.ready || 0} new, ${s.skipped || 0} skipped, ${s.needsReview || 0} need review.`;
    status.className = s.needsReview ? "status warn" : "status ok";
  }
  updateApplyBankAppendButton();
});
$("#downloadImportTemplateCsv")?.addEventListener("click", (e) => {
  downloadImportTemplate("csv", e.currentTarget);
});
$("#downloadImportTemplateXlsx")?.addEventListener("click", (e) => {
  downloadImportTemplate("xlsx", e.currentTarget);
});
$("#bankAppendForm")?.addEventListener("submit", (e) => e.preventDefault());
$("#bankAppendForm")?.addEventListener("change", (e) => {
  if (e.target?.name !== "statement") return;
  resetBankAppendPreview();
});
$("#applyBankAppend")?.addEventListener("click", handleApplyBankAppendClick);
$("#bankAccountSettingsForm")?.addEventListener("submit", saveBankAccountSettings);

const REFERENCE_LEDGER_FILENAMES = {
  csv: "cooperative-bank-ledger-reference.csv",
  xlsx: "cooperative-bank-ledger-reference.xlsx",
};

function parseAttachmentFilename(res, fallback) {
  const disposition = res.headers.get("Content-Disposition") || "";
  const match =
    disposition.match(/filename\*=UTF-8''([^;]+)/i) ||
    disposition.match(/filename="([^"]+)"/i) ||
    disposition.match(/filename=([^;]+)/i);
  if (!match?.[1]) return fallback;
  try {
    return decodeURIComponent(match[1].trim().replace(/"/g, ""));
  } catch {
    return match[1].trim().replace(/"/g, "");
  }
}

async function saveDownloadBlob(blob, filename) {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const ext = filename.split(".").pop()?.toLowerCase() || "csv";
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: ext === "xlsx" ? "Excel workbook" : "CSV ledger",
            accept:
              ext === "xlsx"
                ? {
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                      [".xlsx"],
                  }
                : { "text/csv": [".csv"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function downloadBankLedgerReference(button, format = "csv") {
  setButtonBusy(button, true, "Preparing…");
  const fallback =
    format === "xlsx" ? REFERENCE_LEDGER_FILENAMES.xlsx : REFERENCE_LEDGER_FILENAMES.csv;
  try {
    const url =
      format === "xlsx"
        ? "/api/bank-ledger/reference/download.xlsx"
        : "/api/bank-ledger/reference/download";
    const res = await fetch(url);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Download failed");
    }
    const blob = await res.blob();
    const filename = parseAttachmentFilename(res, fallback);
    await saveDownloadBlob(blob, filename);
  } catch (err) {
    if (err?.name !== "AbortError") alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

async function sortBankLedgerUpload(button) {
  const form = $("#bankImportForm");
  if (!form) return;
  const statement = form.statement?.files?.[0];
  if (!statement) {
    alert("Choose your master ledger file first.");
    return;
  }
  setButtonBusy(button, true, "Sorting…");
  try {
    const fd = new FormData();
    fd.append("statement", statement);
    const res = await fetch("/api/bank-ledger/reference/sort-upload", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Sort failed");
    }
    const blob = await res.blob();
    const filename = parseAttachmentFilename(res, REFERENCE_LEDGER_FILENAMES.csv);
    await saveDownloadBlob(blob, filename);
    const status = $("#bankImportStatus");
    if (status) {
      status.textContent = `Saved ${filename}. Replace data\\${filename} on your PC, then run Full Ledger Refresh.`;
      status.className = "status ok";
    }
  } catch (err) {
    if (err?.name !== "AbortError") alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

$("#downloadBankLedgerReference")?.addEventListener("click", (e) => {
  downloadBankLedgerReference(e.currentTarget, "csv");
});

$("#downloadBankLedgerReferenceXlsx")?.addEventListener("click", (e) => {
  downloadBankLedgerReference(e.currentTarget, "xlsx");
});

$("#sortBankLedgerUpload")?.addEventListener("click", (e) => {
  sortBankLedgerUpload(e.currentTarget);
});

function clearBankImportConflicts() {
  const panel = $("#bankImportConflicts");
  if (panel) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
  }
}

function renderBankImportConflicts(conflicts) {
  const panel = $("#bankImportConflicts");
  if (!panel) return;
  const missing = conflicts?.missingFromImport || [];
  const warnings = conflicts?.importAudit?.warnings || [];
  if (!missing.length && !warnings.length) {
    clearBankImportConflicts();
    return;
  }
  panel.classList.remove("hidden");
  const warningHtml = warnings.length
    ? `
    <strong>Ledger warnings (${warnings.length})</strong>
    <p>Review these before importing. Proxy payments must credit the member named after <em>for …</em> in the Zelle text, not the payer.</p>
    <ul>
      ${warnings
        .map(
          (row) =>
            `<li>${escapeHtml(row.date || ":")} · ${escapeHtml(fmt.format(row.amount))}${row.assignedMember ? ` · ${escapeHtml(row.assignedMember)}` : ""} · ${escapeHtml(row.message)}${row.description ? ` <span class="muted">(${escapeHtml(String(row.description).slice(0, 72))})</span>` : ""}</li>`
        )
        .join("")}
    </ul>`
    : "";
  const missingHtml = missing.length
    ? `
    <strong>Manual entries not in this file (${missing.length})</strong>
    <p>These were entered in Peer Finance Manager but are missing from the file you selected. Importing without them will remove them from Cooperative Books.</p>
    <ul>
      ${missing
        .map(
          (row) =>
            `<li>${escapeHtml(row.dateLabel || row.date)} · ${escapeHtml(row.narrative || row.type)} · ${escapeHtml(fmt.format(row.amount))}${row.memberName ? ` · ${escapeHtml(row.memberName)}` : ""}${row.description ? ` · ${escapeHtml(row.description)}` : ""}</li>`
        )
        .join("")}
    </ul>
    <div class="panel-head-actions">
      <button type="button" class="btn primary" id="downloadMissingManualRows">Download missing rows CSV</button>
    </div>
    <p>Open the missing-rows file, copy its transaction rows into <strong>cooperative-bank-ledger-reference.csv</strong> or <strong>cooperative-bank-ledger-reference.xlsx</strong> (same names as <strong>data\</strong> on your PC), then import that file or click <strong>Sort &amp; Download cooperative-bank-ledger-reference.csv</strong>. After import, use the matching download buttons to replace your local copy from live Cooperative Books.</p>`
    : "";
  panel.innerHTML = warningHtml + missingHtml;
}

async function downloadMissingManualRows(button) {
  const form = $("#bankImportForm");
  if (!form) return;
  const statement = form.statement?.files?.[0];
  if (!statement) {
    alert("Choose your master ledger file first.");
    return;
  }
  setButtonBusy(button, true, "Preparing…");
  try {
    const fd = new FormData();
    fd.append("statement", statement);
    const res = await fetch("/api/bank-import/missing-rows/download", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Download failed");
    }
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cooperative-bank-ledger-missing-manual-rows.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

$("#bankImportConflicts")?.addEventListener("click", (e) => {
  if (e.target?.id === "downloadMissingManualRows") {
    downloadMissingManualRows(e.currentTarget);
  }
});

async function checkBankImportConflicts(form) {
  const statement = form.statement?.files?.[0];
  if (!statement) {
    clearBankImportConflicts();
    return null;
  }
  const fd = new FormData();
  fd.append("statement", statement);
  const res = await fetch("/api/bank-import/check-conflicts", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not check import conflicts");
  renderBankImportConflicts(data.conflicts);
  return data.conflicts;
}

async function runBankImport(form, { acknowledgeManualLoss = false } = {}) {
  const status = $("#bankImportStatus");
  const summary = $("#bankImportSummary");
  const fd = new FormData(form);
  const statement = form.statement?.files?.[0];
  if (!statement) {
    status.textContent = "Choose your master ledger file.";
    status.className = "status err";
    return;
  }
  if (acknowledgeManualLoss) {
    fd.set("acknowledgeManualLoss", "true");
  }
  if (status) {
    status.textContent = "Importing bank ledger…";
    status.className = "status";
  }
  if (summary) summary.textContent = "";
  const submitBtn = form.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true, "Importing…");
  try {
    const res = await fetch("/api/bank-import/run", { method: "POST", body: fd });
    const data = await res.json();
    if (res.status === 409 && data.conflicts?.hasConflicts) {
      renderBankImportConflicts(data.conflicts);
      const count = data.conflicts.missingFromImport.length;
      const proceed = confirm(
        `${count} manual transaction${count === 1 ? "" : "s"} in Peer Finance Manager ${count === 1 ? "is" : "are"} not in this file and will be removed.\n\nImport anyway?`
      );
      if (proceed) {
        await runBankImport(form, { acknowledgeManualLoss: true });
      } else if (status) {
        status.textContent =
          "Import cancelled. Download the reference CSV or add the missing manual rows first.";
        status.className = "status err";
      }
      return;
    }
    if (!res.ok) throw new Error(data.error || "Bank import failed");
    clearBankImportConflicts();
    const r = data.result || {};
    if (status) {
      status.textContent =
        "Bank ledger updated. Download sorted reference CSV to replace your local file.";
      status.className = "status ok";
    }
    if (summary) {
      summary.textContent = [
        `${r.totalBankRows || 0} bank rows processed`,
        r.ledgerEndingBalance != null
          ? `Ledger ending balance ${Number(r.ledgerEndingBalance).toFixed(2)} through ${r.ledgerEndingAsOf || ":"}`
          : null,
        `${r.deposits || 0} deposits`,
        `${r.loanRepayments || 0} loan repayments`,
        `${r.expenses || 0} expenses`,
        r.skippedNoMember ? `${r.skippedNoMember} skipped (member not matched)` : null,
        r.cdBalance != null ? `CD balance set to ${Number(r.cdBalance).toFixed(2)}` : null,
        r.ledgerEndingBalance != null && Math.abs(r.ledgerEndingBalance - 15471.49) > 0.01
          ? "Warning: expected BoA checking balance is 15,471.49 : verify you uploaded cooperative-bank-ledger-reference.xlsx from AssurCoop/data (453 rows)."
          : null,
        data.conflicts?.importAudit?.warningCount
          ? `Warning: ${data.conflicts.importAudit.warningCount} ledger issue(s) were flagged : expand the panel above and fix the file before relying on member balances.`
          : null,
        "Use Download sorted reference to pull a date-ordered copy matching live books.",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    form.reset();
    loadBankImportPanel();
    if (activeTab === "books") loadBooks();
  } catch (err) {
    if (status) {
      status.textContent = err.message;
      status.className = "status err";
    }
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

$("#bankImportForm")?.addEventListener("change", async (e) => {
  if (e.target?.name !== "statement") return;
  const form = e.target.form;
  if (!form) return;
  try {
    await checkBankImportConflicts(form);
  } catch (err) {
    const status = $("#bankImportStatus");
    if (status) {
      status.textContent = err.message;
      status.className = "status err";
    }
  }
});

$("#bankImportForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await runBankImport(e.target);
});

let selectedStatementFile = null;
let selectedStatementSheet = null;

async function loadStatementFiles() {
  const list = $("#statementFileList");
  const distSelect = $("#statementDistSelect");
  try {
    const res = await fetch("/api/statements/files");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    list.innerHTML = "";
    if (!data.files?.length) {
      list.innerHTML =
        '<li class="empty-item">No Excel Workbooks Found. Place Assurance Status .xlsx Files in the Cooperative Folder.</li>';
      return;
    }

    data.files.forEach((f) => {
      const li = document.createElement("li");
      li.dataset.file = f;
      li.innerHTML = `<span class="badge">Excel</span><span>${escapeHtml(f)}</span>`;
      li.addEventListener("click", () => selectStatementFile(f));
      list.appendChild(li);
    });

    distSelect.innerHTML =
      '<option value="">None : Use Distribution Column in Workbook Only</option>';
    (data.distributionFiles || []).forEach((rel) => {
      const opt = document.createElement("option");
      opt.value = rel;
      opt.textContent = rel.split(/[/\\]/).pop();
      distSelect.appendChild(opt);
    });
  } catch (err) {
    list.innerHTML = `<li class="empty-item">Error: ${escapeHtml(err.message)}</li>`;
  }
}

async function selectStatementFile(filename) {
  const requestId = ++statementInspectRequestId;
  selectedStatementFile = filename;
  selectedStatementSheet = null;
  $("#statementFileList").querySelectorAll("li").forEach((li) => {
    li.classList.toggle("selected", li.dataset.file === filename);
  });

  const info = $("#statementSelectedInfo");
  info.classList.remove("hidden");
  info.textContent = "Inspecting Workbook…";

  try {
    const res = await fetch("/api/statements/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    if (requestId !== statementInspectRequestId) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    selectedStatementSheet = data.suggestedSheet;
    info.innerHTML = `<strong>${escapeHtml(filename)}</strong><br />Sheet: ${escapeHtml(selectedStatementSheet)} · ${data.memberCount || 0} Members`;
    $("#generateStatementsBtn").disabled = !selectedStatementSheet;
  } catch (err) {
    if (requestId !== statementInspectRequestId) return;
    info.textContent = err.message;
    $("#generateStatementsBtn").disabled = true;
  }
}

$("#refreshStatementFiles")?.addEventListener("click", loadStatementFiles);

$("#statementDistSelect")?.addEventListener("change", () => {
  if ($("#statementDistSelect").value) {
    $("#statementDistFile").value = "";
    $("#statementDistFileName").textContent = "";
  }
});

$("#statementDistFile")?.addEventListener("change", () => {
  const input = $("#statementDistFile");
  if (input.files.length) {
    $("#statementDistFileName").textContent = input.files[0].name;
    $("#statementDistSelect").value = "";
  } else {
    $("#statementDistFileName").textContent = "";
  }
});

$("#generateStatementsBtn")?.addEventListener("click", async () => {
  if (!selectedStatementFile || !selectedStatementSheet) return;

  const btn = $("#generateStatementsBtn");
  const status = $("#statementStatus");
  const wrap = $("#statementProgressWrap");
  const fill = $("#statementProgressFill");
  const text = $("#statementProgressText");
  const member = $("#statementProgressMember");

  btn.disabled = true;
  status.textContent = "";
  status.className = "status";
  wrap.classList.remove("hidden");
  fill.style.width = "0%";
  text.textContent = "Starting…";
  member.textContent = "";

  try {
    let distributionFilename = "";
    const distFile = $("#statementDistFile");
    if (distFile.files.length) {
      const fd = new FormData();
      fd.append("file", distFile.files[0]);
      const up = await fetch("/api/statements/upload-distribution", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData.error);
      distributionFilename = upData.path;
    } else {
      distributionFilename = $("#statementDistSelect").value || "";
    }

    const res = await fetch("/api/statements/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: selectedStatementFile,
        sheetName: selectedStatementSheet,
        distributionFilename,
      }),
    });
    const { jobId } = await res.json();
    if (!res.ok || !jobId) throw new Error("Failed to start generation");

    const poll = async () => {
      const s = await fetch(`/api/statements/generate/status/${jobId}`);
      const data = await s.json();
      if (data.done) {
        wrap.classList.add("hidden");
        if (data.success) {
          status.textContent = `Done : ${data.count} PDFs saved to ${data.outputDir}`;
          status.className = "status ok";
        } else {
          status.textContent = data.error || "Generation failed";
          status.className = "status err";
        }
        btn.disabled = false;
        return;
      }
      const pct = data.total ? Math.round((data.current / data.total) * 100) : 0;
      fill.style.width = `${pct}%`;
      text.textContent = data.total
        ? `${pct}% (${data.current} of ${data.total})`
        : "Starting…";
      member.textContent = data.member || "";
      setTimeout(poll, 400);
    };
    poll();
  } catch (err) {
    wrap.classList.add("hidden");
    status.textContent = err.message;
    status.className = "status err";
    btn.disabled = false;
  }
});

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: cooperativeTimezone });
}

let cachedMembers = [];
const memberPickerInstances = new Set();

function memberDisplayName(m) {
  return m.display_name || m.name;
}

function memberDobLabel(m) {
  if (!m.date_of_birth) return "DOB not on file";
  return formatDate(m.date_of_birth);
}

function memberSearchHaystack(m) {
  const dob = m.date_of_birth || "";
  const dobFormatted = dob ? formatDate(dob) : "";
  return [m.name, m.display_name, dob, dobFormatted]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterMembersForPicker(query) {
  const q = query.trim().toLowerCase();
  if (!q) return cachedMembers.slice(0, 40);
  return cachedMembers
    .filter((m) => memberSearchHaystack(m).includes(q))
    .slice(0, 40);
}

function closeAllMemberPickers(except) {
  memberPickerInstances.forEach((picker) => {
    if (picker !== except) picker.closeList();
  });
}

function setupMemberPicker(root) {
  const hidden = root.querySelector('input[type="hidden"]');
  const input = root.querySelector(".member-picker-input");
  const list = root.querySelector(".member-picker-list");
  if (!hidden || !input || !list) return;

  const picker = {
    root,
    hidden,
    input,
    list,
    selectedMember: null,
    closeList() {
      list.classList.add("hidden");
      list.innerHTML = "";
    },
    renderList(matches) {
      list.innerHTML = "";
      if (!matches.length) {
        list.innerHTML = '<li class="member-picker-empty">No matching members</li>';
        list.classList.remove("hidden");
        return;
      }
      matches.forEach((m) => {
        const li = document.createElement("li");
        li.role = "option";
        li.dataset.memberId = String(m.id);
        li.innerHTML = `${escapeHtml(memberDisplayName(m))}<span class="member-picker-meta">${escapeHtml(memberDobLabel(m))}</span>`;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          picker.selectMember(m);
        });
        list.appendChild(li);
      });
      list.classList.remove("hidden");
    },
    selectMember(member) {
      picker.selectedMember = member;
      hidden.value = String(member.id);
      input.value = memberDisplayName(member);
      picker.closeList();
      const form = root.closest("form");
      if (form?.id === "updateProfileForm") {
        loadProfileIntoUpdateForm(member.id);
      }
    },
    clearSelection() {
      picker.selectedMember = null;
      hidden.value = "";
    },
  };

  input.addEventListener("focus", () => {
    closeAllMemberPickers(picker);
    picker.renderList(filterMembersForPicker(input.value));
  });

  input.addEventListener("input", () => {
    if (
      picker.selectedMember &&
      input.value !== memberDisplayName(picker.selectedMember)
    ) {
      picker.clearSelection();
    }
    picker.renderList(filterMembersForPicker(input.value));
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") picker.closeList();
  });

  memberPickerInstances.add(picker);
}

function initMemberPickers() {
  document.querySelectorAll(".member-picker").forEach((root) => {
    if (root.dataset.pickerReady === "1") return;
    setupMemberPicker(root);
    root.dataset.pickerReady = "1";
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".member-picker")) {
    closeAllMemberPickers();
  }
});

async function loadProfileIntoUpdateForm(memberId) {
  const requestId = ++profileFormRequestId;
  const form = $("#updateProfileForm");
  if (!form) return;
  const status = $("#updateProfileStatus");
  if (status) {
    status.textContent = "Loading profile…";
    status.className = "status";
  }
  try {
    const res = await fetch(`/api/members/${memberId}/profile`);
    if (requestId !== profileFormRequestId) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load profile");
    const p = data.profile;
    const set = (name, value) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.value = value ?? "";
    };
    set("memberId", memberId);
    set("name", p.ledger_account_name);
    set("firstName", p.first_name);
    set("middleName", p.middle_name);
    set("lastName", p.last_name);
    set("gender", p.gender);
    set("dateOfBirth", p.date_of_birth);
    set("email", p.email);
    set("phone", p.phone);
    set("addressLine1", p.address_line1);
    set("addressLine2", p.address_line2);
    set("city", p.city);
    set("state", p.state);
    set("postalCode", p.postal_code);
    set("country", p.country);
    set("zelleBankName", p.zelle_bank_name);
    set("nextOfKinFirstName", p.next_of_kin_first_name);
    set("nextOfKinLastName", p.next_of_kin_last_name);
    set("nextOfKinEmail", p.next_of_kin_email);
    set("nextOfKinPhone", p.next_of_kin_phone);
    set("nextOfKinRelationship", p.next_of_kin_relationship);
    set("joinedAt", p.joined_at);
    const picker = form.querySelector(".member-picker");
    const pickerInput = picker?.querySelector(".member-picker-input");
    if (pickerInput) {
      pickerInput.value = p.display_name || p.ledger_account_name || "";
    }
    if (status) {
      status.textContent = "";
      status.className = "status";
    }
  } catch (err) {
    if (requestId !== profileFormRequestId) return;
    setFormStatus(status, err.message, false);
  }
}

function openRecordSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section?.tagName === "DETAILS") section.open = true;
}

function initRecordSectionCollapseButtons() {
  document.querySelectorAll("details.record-section").forEach((section) => {
    const body = section.querySelector(":scope > .profile-disclosure-body");
    if (!body || body.querySelector(".record-section-collapse")) return;
    const summary = section.querySelector("summary.record-section-summary");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn record-section-collapse";
    btn.textContent = "Collapse Section";
    btn.addEventListener("click", () => {
      section.open = false;
      summary?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    body.appendChild(btn);
  });
}

function openMemberProfileEditor(memberId) {
  switchTab("record", { skipRecordLoad: true });
  loadRecordTabData().then(() => {
    loadProfileIntoUpdateForm(memberId);
    openRecordSection("recordSectionUpdateProfile");
    document.getElementById("updateProfileForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function loadCheckingBalanceForm() {
  const summaryEl = $("#checkingBalanceCurrent");
  const form = $("#checkingBalanceForm");
  if (!form) return;
  try {
    const res = await fetch("/api/settings/checking-balance");
    const { checkingBalance } = await res.json();
    if (!res.ok) throw new Error(checkingBalance?.error || "Failed to load bank balance");

    const balanceInput = form.querySelector('[name="balance"]');
    const asOfInput = form.querySelector('[name="asOfDate"]');
    if (balanceInput && checkingBalance.balance != null) {
      balanceInput.value = Number(checkingBalance.balance).toFixed(2);
    }
    if (asOfInput) {
      asOfInput.value = checkingBalance.asOf || todayIso();
    }

    if (summaryEl) {
      const parts = [];
      if (checkingBalance.balance != null) {
        parts.push(
          `Statement ${fmt.format(checkingBalance.balance)} as of ${checkingBalance.asOf ? formatDate(checkingBalance.asOf) : ":"}`
        );
      } else {
        parts.push("No bank statement balance on file yet.");
      }
      if (checkingBalance.ledgerBalance != null) {
        parts.push(
          `Ledger ${fmt.format(checkingBalance.ledgerBalance)} through ${checkingBalance.ledgerAsOf ? formatDate(checkingBalance.ledgerAsOf) : ":"}`
        );
        if (checkingBalance.balance != null) {
          const diff = checkingBalance.balance - checkingBalance.ledgerBalance;
          if (Math.abs(diff) >= 0.01) {
            parts.push(`Difference ${fmt.format(diff)}`);
          }
        }
      }
      summaryEl.textContent = parts.join(" · ");
      summaryEl.className = "subtle";
    }
  } catch (err) {
    if (summaryEl) {
      summaryEl.textContent = err.message;
      summaryEl.className = "subtle status err";
    }
  }
}

async function loadCdBalanceForm() {
  const summaryEl = $("#cdBalanceCurrent");
  const form = $("#cdBalanceForm");
  if (!form) return;
  try {
    const res = await fetch("/api/settings/cd-balance");
    const { cdBalance } = await res.json();
    if (!res.ok) throw new Error(cdBalance?.error || "Failed to load CD balance");

    const balanceInput = form.querySelector('[name="balance"]');
    const asOfInput = form.querySelector('[name="asOfDate"]');
    if (balanceInput && cdBalance.balance != null) {
      balanceInput.value = Number(cdBalance.balance).toFixed(2);
    }
    if (asOfInput) {
      asOfInput.value = cdBalance.asOf || todayIso();
    }

    if (summaryEl) {
      if (cdBalance.balance == null) {
        summaryEl.textContent =
          "No CD balance on file yet. Enter the balance from your bank statement.";
      } else {
        summaryEl.textContent = [
          `Last updated ${cdBalance.asOf ? formatDate(cdBalance.asOf) : ":"}`,
          `Balance ${fmt.format(cdBalance.balance)}`,
          `Term start ${fmt.format(cdBalance.termMetrics?.termStartBalance || 0)}`,
          `Earned this term ${fmt.format(cdBalance.termMetrics?.termInterestEarned ?? cdBalance.accruedInterest ?? 0)}`,
          `Expected to maturity ${fmt.format(cdBalance.termMetrics?.futureInterest ?? 0)}`,
        ].join(" · ");
      }
    }
  } catch (err) {
    if (summaryEl) {
      summaryEl.textContent = err.message;
      summaryEl.className = "subtle status err";
    }
  }
}

async function loadRecordTabData() {
  const requestId = ++recordTabRequestId;
  const summaryEl = $("#cdBalanceCurrent");
  if (summaryEl) summaryEl.textContent = "Loading current CD balance…";
  try {
    const [membersRes, categoriesRes, loansRes] = await Promise.all([
      fetch("/api/members?profiles=true"),
      fetch("/api/expense-categories"),
      fetch("/api/loans?status=active"),
    ]);
    if (requestId !== recordTabRequestId) return;
    const { members } = await membersRes.json();
    const { categories } = await categoriesRes.json();
    const { loans } = await loansRes.json();
    cachedMembers = members || [];
    initMemberPickers();

    const loanSelect = $("#repaymentLoanSelect");
    if (loanSelect) {
      loanSelect.innerHTML = '<option value="">Select Loan</option>';
      (loans || []).forEach((l) => {
        const opt = document.createElement("option");
        opt.value = l.id;
        opt.textContent = `#${l.id} : ${l.borrower_name} (${fmt.format(l.principal)})`;
        loanSelect.appendChild(opt);
      });
    }

    const catSelect = $("#expenseCategorySelect");
    if (catSelect) {
      catSelect.innerHTML = "";
      (categories || []).forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        catSelect.appendChild(opt);
      });
    }

    document.querySelectorAll('input[type="date"][name="transactionDate"], input[type="date"][name="startDate"], input[type="date"][name="paymentDate"], input[type="date"][name="expenseDate"], input[type="date"][name="asOfDate"], input[type="date"][name="creditedDate"]').forEach((input) => {
      if (!input.value) input.value = todayIso();
    });

    await Promise.all([loadExpenses(), loadDistributions(), loadCheckingBalanceForm(), loadCdBalanceForm()]);
    if (requestId !== recordTabRequestId) return;
  } catch (err) {
    if (requestId !== recordTabRequestId) return;
    $("#expensesBody").innerHTML = `<tr><td colspan="4" class="status err">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadExpenses() {
  const body = $("#expensesBody");
  if (!body) return;
  try {
    const res = await fetch("/api/expenses?limit=25");
    const { expenses } = await res.json();
    if (!expenses?.length) {
      body.innerHTML = '<tr><td colspan="4" class="subtle">No Expenses Recorded Yet</td></tr>';
      return;
    }
    body.innerHTML = expenses
      .map(
        (e) => `
      <tr>
        <td>${escapeHtml(e.expense_date)}</td>
        <td>${escapeHtml(e.category)}</td>
        <td>${escapeHtml(e.description)}</td>
        <td class="money">${fmt.format(e.amount)}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="status err">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadDistributions() {
  const body = $("#distributionsBody");
  if (!body) return;
  try {
    const res = await fetch("/api/distributions/recent?limit=25");
    const { distributions } = await res.json();
    if (!distributions?.length) {
      body.innerHTML = '<tr><td colspan="4" class="subtle">No Distributions Recorded Yet</td></tr>';
      return;
    }
    body.innerHTML = distributions
      .map(
        (d) => `
      <tr>
        <td>${escapeHtml(d.transaction_date)}</td>
        <td>${escapeHtml(d.display_name || d.member_name)}</td>
        <td>${escapeHtml(d.description || ":")}</td>
        <td class="money">${fmt.format(d.amount)}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="status err">${escapeHtml(err.message)}</td></tr>`;
  }
}

function setFormStatus(el, message, ok) {
  if (!el) return;
  el.textContent = coopCopy(message);
  el.className = ok ? "status ok" : "status err";
}

function formJson(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(data)) {
    if (["memberId", "borrowerId", "guarantor1Id", "guarantor2Id", "loanId", "termMonths"].includes(key)) {
      data[key] = Number(data[key]);
    }
    if (["amount", "principal", "annualRate", "balance", "membershipFeeAmount"].includes(key) && data[key] !== "") {
      data[key] = Number(data[key]);
    }
  }
  return data;
}

$("#registerMemberForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#registerMemberStatus");
  status.textContent = "Registering…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    payload.recordMembershipFee = Boolean(e.target.recordMembershipFee?.checked);
    if (!payload.recordMembershipFee) {
      delete payload.membershipFeeDate;
    }
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(status, `Registered ${payload.name}.`, true);
    e.target.reset();
    if (e.target.recordMembershipFee) e.target.recordMembershipFee.checked = true;
    loadMembers();
    loadRecordTabData();
    loadBooks();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#updateProfileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#updateProfileStatus");
  status.textContent = "Saving…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const memberId = payload.memberId;
    delete payload.memberId;
    const res = await fetch(`/api/members/${memberId}/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(status, "Profile saved.", true);
    loadMembers();
    loadUsers();
    if (selectedMemberId === memberId) showProfile(memberId);
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#membershipFeeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#membershipFeeStatus");
  status.textContent = "Recording…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const res = await fetch("/api/transactions/membership-fee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(
      status,
      `Registration fee of ${fmt.format(Math.abs(data.amount))} recorded.`,
      true
    );
    e.target.amount.value = "100";
    loadMembers();
    loadBooks();
    if (selectedMemberId === payload.memberId) showProfile(payload.memberId);
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#depositForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#depositStatus");
  status.textContent = "Saving…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const res = await fetch("/api/transactions/member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(status, `Recorded ${payload.type} of ${fmt.format(Math.abs(data.amount))}.`, true);
    e.target.amount.value = "";
    e.target.description.value = "";
    e.target.reference.value = "";
    loadMembers();
    loadBooks();
    if (selectedMemberId === payload.memberId) showProfile(payload.memberId);
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#distributionForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#distributionStatus");
  status.textContent = "Saving…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const res = await fetch("/api/distributions/member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(
      status,
      `Distribution of ${fmt.format(Math.abs(data.amount))} credited.`,
      true
    );
    e.target.amount.value = "";
    e.target.reference.value = "";
    loadMembers();
    loadBooks();
    loadDistributions();
    if (selectedMemberId === payload.memberId) showProfile(payload.memberId);
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#distributionBulkForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#distributionBulkStatus");
  status.textContent = "Importing…";
  status.className = "status";
  try {
    const fd = new FormData(e.target);
    const res = await fetch("/api/distributions/import", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    let message = `Credited ${data.credited} member${data.credited === 1 ? "" : "s"}.`;
    if (data.unmatched?.length) {
      message += ` Unmatched: ${data.unmatched.join(", ")}.`;
    }
    setFormStatus(status, message, true);
    e.target.reset();
    document.querySelectorAll('#distributionBulkForm input[type="date"]').forEach((input) => {
      if (!input.value) input.value = todayIso();
    });
    loadMembers();
    loadBooks();
    loadDistributions();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#newLoanForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#newLoanStatus");
  status.textContent = "Creating Loan…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(status, `Loan #${data.loanId} created.`, true);
    e.target.principal.value = "";
    e.target.notes.value = "";
    loadLoans();
    loadBooks();
    loadRecordTabData();
    loadMembers();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#repaymentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#repaymentStatus");
  status.textContent = "Recording…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const loanId = payload.loanId;
    delete payload.loanId;
    const res = await fetch(`/api/loans/${loanId}/repayments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(status, `Repayment of ${fmt.format(payload.amount)} recorded.`, true);
    e.target.amount.value = "";
    e.target.description.value = "";
    loadLoans();
    loadBooks();
    loadMembers();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#checkingBalanceForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#checkingBalanceStatus");
  status.textContent = "Saving…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const res = await fetch("/api/settings/checking-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const saved = data.checkingBalance;
    setFormStatus(
      status,
      `Bank balance updated to ${fmt.format(saved.balance)} as of ${formatDate(saved.asOf)}.`,
      true
    );
    await loadCheckingBalanceForm();
    loadBooks();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#cdBalanceForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#cdBalanceStatus");
  status.textContent = "Saving…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const res = await fetch("/api/settings/cd-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const saved = data.cdBalance;
    setFormStatus(
      status,
      `CD balance updated to ${fmt.format(saved.balance)} as of ${formatDate(saved.asOf)} · accrued interest ${fmt.format(saved.accruedInterest)}.`,
      true
    );
    await loadCdBalanceForm();
    loadBooks();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#expenseForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#expenseStatus");
  status.textContent = "Saving…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(status, `Expense recorded (${payload.category}).`, true);
    e.target.description.value = "";
    e.target.amount.value = "";
    loadExpenses();
    loadBooks();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

async function handleLoginSubmit(e) {
  e.preventDefault();
  const portal = e.target.dataset.portal || getPortalFromPath();
  const status = document.querySelector(`[data-login-status="${portal}"]`);
  if (status) {
    status.textContent = "Signing in…";
    status.className = "status";
  }
  if (portal === "platform") {
    try {
      const formData = Object.fromEntries(new FormData(e.target).entries());
      const res = await nativeFetch("/api/platform/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.identifier, password: formData.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      platformToken = data.token;
      localStorage.setItem(PLATFORM_SESSION_KEY, platformToken);
      platformUser = data.user;
      showPlatformApp();
      await loadPlatformOrganizations();
      if (status) setFormStatus(status, "", true);
    } catch (err) {
      if (status) setFormStatus(status, err.message, false);
    }
    return;
  }
  try {
    const formData = Object.fromEntries(new FormData(e.target).entries());
    rememberOrgSlug(formData.organizationSlug);
    const res = await nativeFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, portal }),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error(
        res.status >= 500
          ? "Server is waking up or unavailable. Wait 30 seconds and try again."
          : "Login failed : server returned an unexpected response."
      );
    }
    if (!res.ok) throw new Error(data.error || "Login failed");
    sessionToken = data.token;
    localStorage.setItem(SESSION_KEY, sessionToken);
    currentUser = data.user;
    applyCooperativeTimezone(data.cooperativeTimezone);
    if (data.mustChangePassword || currentUser.mustChangePassword) {
      showChangePassword();
      if (status) status.textContent = "";
      return;
    }
    showApp();
    applyRoleUi();
    bootstrapApp();
    if (status) setFormStatus(status, "", true);
  } catch (err) {
    if (status) setFormStatus(status, err.message, false);
  }
}

document.querySelectorAll(".login-form").forEach((form) => {
  form.addEventListener("submit", handleLoginSubmit);
});

document.querySelectorAll(".org-slug-input").forEach((input) => {
  input.addEventListener("change", () => refreshOrganizationPreview(input.value));
  input.addEventListener("blur", () => refreshOrganizationPreview(input.value));
});

$("#registerOrganizationForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#registerStatus");
  status.textContent = "Creating Cooperative…";
  status.className = "status";
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const res = await nativeFetch("/api/auth/register-organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    rememberOrgSlug(data.organization.slug);
    let msg = `Created ${data.organization.name}. Sign in at /admin with organization code "${data.organization.slug}".`;
    if (data.flexxforms?.provisioned) {
      msg += " FlexxForms workspace is ready under Manage Forms & Documents.";
    } else if (data.flexxforms?.provisionError || data.flexxforms?.message) {
      msg += ` ${data.flexxforms.message || "FlexxForms setup failed: use Retry FlexxForms Setup in Manage Forms & Documents."}`;
    }
    setFormStatus(status, msg, true);
    e.target.reset();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#changePasswordForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#changePasswordStatus");
  status.textContent = "Saving…";
  status.className = "status";
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    if (payload.newPassword !== payload.confirmPassword) {
      throw new Error("New passwords do not match");
    }
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentUser = data.user;
    showApp();
    applyRoleUi();
    bootstrapApp();
    setFormStatus(status, "Password Updated.", true);
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#logoutBtn")?.addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (_) {}
  sessionToken = "";
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  showLoginForPortal(getPortalFromPath());
});

$("#provisionMembersBtn")?.addEventListener("click", async () => {
  const status = $("#provisionMembersStatus");
  if (
    !confirm(
      "Create member portal logins for all members without accounts? Temporary passwords will be generated."
    )
  ) {
    return;
  }
  status.textContent = "Generating credentials…";
  status.className = "status";
  try {
    const res = await fetch("/api/users/provision-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const created = data.created?.length || 0;
    const skipped = data.skipped?.length || 0;
    let message = `Created ${created} account(s)`;
    if (skipped) message += `, skipped ${skipped}`;
    if (data.exportFileName) {
      message += `. Saved to data/exports/${data.exportFileName}`;
    }
    if (created && data.created) {
      const preview = data.created
        .slice(0, 5)
        .map((row) => `${row.memberName}: ${row.username} / ${row.tempPassword}`)
        .join("; ");
      message += `. ${preview}${created > 5 ? "…" : ""}`;
    }
    setFormStatus(status, message, true);
    loadUsers();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#downloadCredentialsBtn")?.addEventListener("click", async () => {
  const status = $("#provisionMembersStatus");
  try {
    const res = await fetch("/api/users/member-credentials-export");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Download failed");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const fileName = match?.[1] || "member-credentials.csv";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
    if (status) setFormStatus(status, `Downloaded ${fileName}`, true);
  } catch (err) {
    if (status) setFormStatus(status, err.message, false);
    else alert(err.message);
  }
});

$("#createUserForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#createUserStatus");
  status.textContent = "Creating account…";
  status.className = "status";
  try {
    const payload = formJson(e.target);
    if (payload.role !== "member") {
      delete payload.memberId;
      delete payload.username;
    } else if (!payload.username) {
      throw new Error("Member accounts require a username");
    }
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFormStatus(status, `Account created for ${payload.email}.`, true);
    e.target.reset();
    loadUsers();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#refreshUsers")?.addEventListener("click", () => loadUsers());
$("#refreshMyAccount")?.addEventListener("click", () => loadMyAccount());

$("#toggleMyAccountDescriptions")?.addEventListener("click", (e) => {
  const panel = $("#panel-my-account");
  const btn = e.currentTarget;
  if (!panel || !btn) return;
  const expanded = panel.classList.toggle("show-descriptions");
  btn.setAttribute("aria-pressed", expanded ? "true" : "false");
  btn.textContent = expanded ? "Hide Descriptions" : "Show Descriptions";
});
$("#downloadMyDepositStatement")?.addEventListener("click", async () => {
  try {
    const monthSelect = $("#myDepositStatementMonth");
    const value = monthSelect?.value || "";
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) {
      alert("Select a statement month first.");
      return;
    }
    const res = await fetch(`/api/me/deposit-statement?year=${year}&month=${month}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Download failed");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contributions-statement-${year}-${String(month).padStart(2, "0")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  }
});

$("#platformLogoutBtn")?.addEventListener("click", async () => {
  try {
    await fetch("/api/platform/auth/logout", { method: "POST" });
  } catch (_) {}
  platformToken = "";
  platformUser = null;
  localStorage.removeItem(PLATFORM_SESSION_KEY);
  showLoginForPortal("platform");
});

$("#refreshPlatformOrgs")?.addEventListener("click", loadPlatformOrganizations);

$("#platformOrgsBody")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-platform-action]");
  if (!btn) return;
  platformOrgAction(btn.dataset.platformAction, btn.dataset.slug);
});

$("#platformCheckPaymentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = $("#platformCheckPaymentStatus");
  if (statusEl) {
    statusEl.textContent = "Recording check payment…";
    statusEl.className = "status";
  }
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const slug = payload.slug;
    const res = await fetch(`/api/platform/organizations/${encodeURIComponent(slug)}/check-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to record payment");
    if (statusEl) setFormStatus(statusEl, `Check recorded for ${slug}. Subscription is active.`, true);
    e.target.reset();
    await loadPlatformOrganizations();
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
});

$("#payMonthlyStripe")?.addEventListener("click", () => startStripeCheckout("monthly"));
$("#payQuarterlyStripe")?.addEventListener("click", () => startStripeCheckout("quarterly"));
$("#payAnnualStripe")?.addEventListener("click", () => startStripeCheckout("annual"));
$("#openStripePortal")?.addEventListener("click", openStripeBillingPortal);
$("#requestCheckPayment")?.addEventListener("click", requestTenantCheckPayment);
$("#refreshPlatformSubscription")?.addEventListener("click", loadPlatformSubscriptionPanel);

function syncPublicPagesExternalFields() {
  const aboutUrl = $("#publicAboutExternalUrl")?.value?.trim() || "";
  const bylawsUrl = $("#publicBylawsExternalUrl")?.value?.trim() || "";
  $("#publicAboutContentFields")?.classList.toggle("is-disabled", Boolean(aboutUrl));
  $("#publicBylawsContentFields")?.classList.toggle("is-disabled", Boolean(bylawsUrl));
}

function renderPublicPagesAdmin(data) {
  const linksEl = $("#publicPagesLinks");
  const aboutPlainText = $("#publicAboutPlainText");
  const aboutExternalUrl = $("#publicAboutExternalUrl");
  const aboutPublished = $("#publicAboutPublished");
  const bylawsPlainText = $("#publicBylawsPlainText");
  const bylawsExternalUrl = $("#publicBylawsExternalUrl");
  const bylawsPublished = $("#publicBylawsPublished");
  const bylawsStatus = $("#publicBylawsFileStatus");
  const imagesList = $("#publicAboutImagesList");
  if (!data) return;
  if (linksEl) {
    const applyLink = data.publicApplyUrl
      ? ` · <a href="${escapeHtml(data.publicApplyUrl)}" target="_blank" rel="noopener">Apply</a>`
      : "";
    linksEl.innerHTML = `Public links: <a href="${escapeHtml(data.publicAboutUrl)}" target="_blank" rel="noopener">About</a> · <a href="${escapeHtml(data.publicBylawsUrl)}" target="_blank" rel="noopener">Bylaws</a>${applyLink}`;
  }
  if (aboutExternalUrl && document.activeElement !== aboutExternalUrl) {
    aboutExternalUrl.value = data.aboutExternalUrl || "";
  }
  if (bylawsExternalUrl && document.activeElement !== bylawsExternalUrl) {
    bylawsExternalUrl.value = data.bylawsExternalUrl || "";
  }
  if (aboutPlainText && document.activeElement !== aboutPlainText) {
    aboutPlainText.value = data.aboutPlainText || "";
  }
  if (bylawsPlainText && document.activeElement !== bylawsPlainText) {
    bylawsPlainText.value = data.bylawsPlainText || "";
  }
  if (aboutPublished) aboutPublished.checked = !!data.aboutPublished;
  if (bylawsPublished) bylawsPublished.checked = !!data.bylawsPublished;
  if (bylawsStatus) {
    if (data.bylawsOnDisk) {
      bylawsStatus.textContent = `Optional PDF on file: ${data.bylawsFilename}. Plain text above is used for the public page when saved.`;
    } else {
      bylawsStatus.textContent = "Optional PDF: not uploaded yet.";
    }
  }
  if (imagesList) {
    if (!data.images?.length) {
      imagesList.innerHTML = '<li class="subtle">No images uploaded yet.</li>';
    } else {
      imagesList.innerHTML = data.images
        .map(
          (img) => `<li>
            <img src="${escapeHtml(img.url)}" alt="" class="public-admin-thumb" />
            <span>${escapeHtml(img.filename)}</span>
            <button type="button" class="btn btn-small" data-delete-public-image="${escapeHtml(img.filename)}">Remove</button>
          </li>`
        )
        .join("");
    }
  }
  syncPublicPagesExternalFields();
}

async function loadPublicPagesPanel() {
  if (currentUser?.role !== "admin") return;
  const statusEl = $("#publicPagesStatus");
  try {
    const res = await fetch("/api/books/public-pages");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load public pages");
    renderPublicPagesAdmin(data);
    if (statusEl) statusEl.textContent = "";
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function savePublicAboutPage() {
  const statusEl = $("#publicPagesStatus");
  try {
    const res = await fetch("/api/books/public-pages/about", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plainText: $("#publicAboutPlainText")?.value || "",
        externalUrl: $("#publicAboutExternalUrl")?.value?.trim() || "",
        published: $("#publicAboutPublished")?.checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save About page");
    renderPublicPagesAdmin(data);
    if (statusEl) setFormStatus(statusEl, "About page saved.", true);
    if (currentUser?.organizationSlug) refreshPublicOrgLinks(currentUser.organizationSlug);
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function savePublicBylawsSettings() {
  const statusEl = $("#publicPagesStatus");
  try {
    const res = await fetch("/api/books/public-pages/bylaws", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plainText: $("#publicBylawsPlainText")?.value || "",
        externalUrl: $("#publicBylawsExternalUrl")?.value?.trim() || "",
        published: $("#publicBylawsPublished")?.checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save bylaws page");
    renderPublicPagesAdmin(data);
    if (statusEl) setFormStatus(statusEl, "Bylaws page saved.", true);
    if (currentUser?.organizationSlug) refreshPublicOrgLinks(currentUser.organizationSlug);
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function uploadPublicBylaws(file) {
  const statusEl = $("#publicPagesStatus");
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/books/public-pages/bylaws", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    renderPublicPagesAdmin(data);
    if (statusEl) setFormStatus(statusEl, "Bylaws PDF uploaded.", true);
    if (currentUser?.organizationSlug) refreshPublicOrgLinks(currentUser.organizationSlug);
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function uploadPublicAboutImage(file) {
  const statusEl = $("#publicPagesStatus");
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/books/public-pages/about/images", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    renderPublicPagesAdmin(data);
    if (statusEl) setFormStatus(statusEl, "Image uploaded.", true);
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

async function deletePublicAboutImage(filename) {
  const statusEl = $("#publicPagesStatus");
  try {
    const res = await fetch(
      `/api/books/public-pages/about/images/${encodeURIComponent(filename)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed");
    renderPublicPagesAdmin(data);
    if (statusEl) setFormStatus(statusEl, "Image removed.", true);
  } catch (err) {
    if (statusEl) setFormStatus(statusEl, err.message, false);
  }
}

function setPublicPageStatus(message, ok = false) {
  const statusEl = $("#publicPageStatus");
  if (!statusEl) return;
  statusEl.classList.remove("hidden");
  setFormStatus(statusEl, message, ok);
}

function setPublicPageBranding(organizationName, pageLabel) {
  const orgName = String(organizationName || "").trim();
  const orgEl = $("#publicOrgName");
  if (orgEl) orgName ? (orgEl.textContent = orgName) : (orgEl.textContent = "");
  const pageTitle = $("#publicPageTitle");
  if (pageTitle && pageLabel) pageTitle.textContent = pageLabel;
  document.title = orgName ? `${orgName} : ${pageLabel}` : pageLabel;
}

async function loadPublicAboutPage(slug) {
  const article = $("#publicAboutArticle");
  const bylawsSection = $("#publicBylawsSection");
  article?.classList.remove("hidden");
  bylawsSection?.classList.add("hidden");
  try {
    const res = await nativeFetch(`/api/public/organizations/${encodeURIComponent(slug)}/about`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "About page not available");
    if (data.externalUrl) {
      window.location.replace(data.externalUrl);
      return;
    }
    setPublicPageBranding(data.organization?.name || slug, "About Us");
    if (article) article.innerHTML = data.html || "";
    $("#publicPageStatus")?.classList.add("hidden");
  } catch (err) {
    if (article) article.innerHTML = "";
    setPublicPageStatus(err.message, false);
  }
}

async function loadPublicBylawsPage(slug) {
  const article = $("#publicAboutArticle");
  const bylawsSection = $("#publicBylawsSection");
  const frame = $("#publicBylawsFrame");
  const download = $("#publicBylawsDownload");
  const aboutLink = $("#publicBylawsAboutLink");
  article?.classList.add("hidden");
  bylawsSection?.classList.remove("hidden");
  try {
    const res = await nativeFetch(`/api/public/organizations/${encodeURIComponent(slug)}/bylaws`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Bylaws not available");
    if (data.externalUrl) {
      window.location.replace(data.externalUrl);
      return;
    }
    setPublicPageBranding(data.organization?.name || slug, "Bylaws");
    if (data.mode === "html") {
      article?.classList.remove("hidden");
      bylawsSection?.classList.add("hidden");
      if (article) article.innerHTML = data.html || "";
      if (frame) frame.removeAttribute("src");
    } else {
      article?.classList.add("hidden");
      bylawsSection?.classList.remove("hidden");
      const docUrl = data.downloadUrl;
      if (frame && docUrl) frame.src = docUrl;
      if (download && docUrl) download.href = docUrl;
    }
    if (aboutLink) aboutLink.href = `/c/${encodeURIComponent(slug)}/about`;
    $("#publicPageStatus")?.classList.add("hidden");
  } catch (err) {
    if (frame) frame.removeAttribute("src");
    setPublicPageStatus(err.message, false);
  }
}

function wirePublicHeaderNav(slug, activePage) {
  const aboutHref = `/c/${encodeURIComponent(slug)}/about`;
  const bylawsHref = `/c/${encodeURIComponent(slug)}/bylaws`;
  const aboutNav = $("#publicNavAbout");
  const bylawsNav = $("#publicNavBylaws");
  if (aboutNav) {
    aboutNav.href = aboutHref;
    aboutNav.classList.toggle("active", activePage === "about");
  }
  if (bylawsNav) {
    bylawsNav.href = bylawsHref;
    bylawsNav.classList.toggle("active", activePage === "bylaws");
  }
}

async function bootstrapPublicApp() {
  const info = getPublicPageInfo();
  if (!info) return;
  showPublicShell();
  wirePublicHeaderNav(info.slug, info.page);
  if (info.page === "bylaws") await loadPublicBylawsPage(info.slug);
  else await loadPublicAboutPage(info.slug);
}

$("#savePublicAbout")?.addEventListener("click", savePublicAboutPage);
$("#savePublicBylawsSettings")?.addEventListener("click", savePublicBylawsSettings);
$("#publicAboutExternalUrl")?.addEventListener("input", syncPublicPagesExternalFields);
$("#publicBylawsExternalUrl")?.addEventListener("input", syncPublicPagesExternalFields);
$("#publicBylawsUpload")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  uploadPublicBylaws(file);
  e.target.value = "";
});
$("#publicAboutImageUpload")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  uploadPublicAboutImage(file);
  e.target.value = "";
});
$("#publicAboutImagesList")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-delete-public-image]");
  if (!btn) return;
  deletePublicAboutImage(btn.dataset.deletePublicImage);
});

document.querySelectorAll(".org-slug-input").forEach((input) => {
  input.addEventListener("input", () => refreshPublicOrgLinks(input.value));
});

let activeLoanAgreementsId = null;

let flexxFormsProvisioned = false;

const FLEXXFORMS_FORM_ASSIGN_TARGETS = [
  { inputId: "ffMembershipFormId", label: "Membership Application" },
  { inputId: "ffLoanFormId", label: "Loan Application" },
];

const FLEXXFORMS_DOCUMENT_ASSIGN_TARGETS = [
  { inputId: "ffGuarantorMasterDocId", label: "Guarantor Master Document" },
  { inputId: "ffBorrowerMasterDocId", label: "Borrower Master Document" },
];

const FLEXXFORMS_ASSIGN_TARGETS = [
  ...FLEXXFORMS_FORM_ASSIGN_TARGETS,
  ...FLEXXFORMS_DOCUMENT_ASSIGN_TARGETS,
];

function getFlexxFormsFieldValues() {
  return Object.fromEntries(
    FLEXXFORMS_ASSIGN_TARGETS.map(({ inputId }) => [inputId, String($("#" + inputId)?.value || "").trim()])
  );
}

function refreshFlexxFormsAssignButtons() {
  const values = getFlexxFormsFieldValues();
  document.querySelectorAll(".flexxforms-assign-btn").forEach((btn) => {
    const inputId = btn.dataset.inputId;
    const formId = btn.dataset.formId;
    const linked = Boolean(formId && values[inputId] === formId);
    btn.classList.toggle("is-linked", linked);
    btn.textContent = linked ? `${btn.dataset.label} · Linked` : btn.dataset.label;
  });
}

function assignFlexxFormToField(inputId, formId, label, statusEl) {
  const input = $("#" + inputId);
  if (!input) return;
  input.value = formId;
  input.classList.add("is-assigned");
  window.setTimeout(() => input.classList.remove("is-assigned"), 1600);
  refreshFlexxFormsAssignButtons();
  if (statusEl) {
    setFormStatus(statusEl, `Assigned to ${label}. Click Save Form & Document Ids when you are done.`, true);
  }
}

function renderFlexxFormsCatalogItem(item, typeLabel, assignTargets) {
  const id = item.id || item.formId || item.form_id || item.templateId || "";
  const name = item.name || item.title || item.slug || "Untitled";
  const assignButtons = assignTargets
    .map(
      ({ inputId, label }) =>
        `<button type="button" class="btn small flexxforms-assign-btn" data-input-id="${escapeHtml(inputId)}" data-form-id="${escapeHtml(id)}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`
    )
    .join("");
  return `<article class="flexxforms-catalog-item">
    <div class="flexxforms-catalog-item-main">
      <strong class="flexxforms-catalog-item-title">${escapeHtml(name)}</strong>
      <span class="badge">${escapeHtml(typeLabel)}</span>
      <code class="flexxforms-catalog-item-id">${escapeHtml(id)}</code>
    </div>
    <div class="flexxforms-catalog-item-actions">
      <span class="hint">Assign to</span>
      ${assignButtons}
    </div>
  </article>`;
}

function renderFlexxFormsCatalog(forms, templates, statusEl) {
  const section = $("#flexxformsCatalogSection");
  const picker = $("#flexxformsFormsPicker");
  if (!section || !picker) return;

  const formItems = Array.isArray(forms) ? forms : [];
  const templateItems = Array.isArray(templates) ? templates : [];
  section.classList.remove("hidden");

  if (!formItems.length && !templateItems.length) {
    picker.innerHTML =
      '<p class="flexxforms-catalog-empty hint">Nothing published in FlexxForms yet. Publish a form or master document in FlexxForms, then load again.</p>';
    return;
  }

  const chunks = [];
  if (formItems.length) {
    chunks.push('<p class="subtle flexxforms-catalog-group-title">Application Forms</p>');
    chunks.push(
      formItems
        .map((f) => renderFlexxFormsCatalogItem(f, "Form", FLEXXFORMS_FORM_ASSIGN_TARGETS))
        .join("")
    );
  }
  if (templateItems.length) {
    chunks.push('<p class="subtle flexxforms-catalog-group-title">Master Documents</p>');
    chunks.push(
      templateItems
        .map((t) => renderFlexxFormsCatalogItem(t, "Master Document", FLEXXFORMS_DOCUMENT_ASSIGN_TARGETS))
        .join("")
    );
  } else if (formItems.length) {
    chunks.push(
      '<p class="flexxforms-catalog-empty hint">No master documents yet. In FlexxForms, create guarantor and borrower templates, mark them Master document, publish, then load again.</p>'
    );
  }

  picker.innerHTML = chunks.join("");
  picker.querySelectorAll(".flexxforms-assign-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      assignFlexxFormToField(btn.dataset.inputId, btn.dataset.formId, btn.dataset.label, statusEl);
    });
  });
  refreshFlexxFormsAssignButtons();
}

async function loadFlexxFormsSettings() {
  const panel = $("#flexxformsFormsPanel");
  if (!panel || currentUser?.role !== "admin") return;
  const badge = $("#flexxformsFormsBadge");
  const status = $("#flexxformsFormsStatus");
  try {
    const res = await fetch("/api/flexxforms/settings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load FlexxForms settings");
    const s = data.settings || {};
    flexxFormsProvisioned = Boolean(s.provisioned);
    const loadFormsBtn = $("#refreshFlexxFormsForms");
    if (loadFormsBtn) {
      loadFormsBtn.disabled = !flexxFormsProvisioned;
      loadFormsBtn.title = flexxFormsProvisioned
        ? ""
        : "Run Retry FlexxForms Setup first and wait for the Ready badge.";
    }
    if (badge) {
      badge.textContent = s.provisioned ? "Ready" : "Setup needed";
      badge.className = s.provisioned ? "badge ok" : "badge";
    }
    const emailLine = $("#flexxformsAdminEmailLine");
    if (emailLine) {
      emailLine.textContent = s.adminEmail
        ? `FlexxForms admin email: ${s.adminEmail}`
        : "FlexxForms admin email: not set yet";
    }
    const applyLine = $("#flexxformsPublicApplyLine");
    if (applyLine) {
      if (s.publicApplyUrl) {
        applyLine.innerHTML = `Public membership application link: <a href="${escapeHtml(s.publicApplyUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.publicApplyUrl)}</a>`;
        applyLine.classList.remove("hidden");
      } else {
        applyLine.classList.add("hidden");
        applyLine.textContent = "";
      }
    }
    const tempLine = $("#flexxformsTempPasswordLine");
    if (tempLine) {
      if (s.tempPassword) {
        tempLine.textContent = `Temporary FlexxForms password (shown once): ${s.tempPassword}`;
        tempLine.classList.remove("hidden");
      } else {
        tempLine.classList.add("hidden");
        tempLine.textContent = s.provisioned
          ? "Use the password from your FlexxForms registration email, or reset it in FlexxForms."
          : "";
        if (s.provisioned) tempLine.classList.remove("hidden");
      }
    }
    const errEl = $("#flexxformsProvisionError");
    if (errEl) {
      if (s.provisionError) {
        errEl.textContent = `FlexxForms setup failed: ${s.provisionError}. Use Retry FlexxForms Setup.`;
        errEl.classList.remove("hidden");
      } else {
        errEl.classList.add("hidden");
        errEl.textContent = "";
      }
    }
    $("#ffMembershipFormId").value = s.membershipFormId || "";
    $("#ffLoanFormId").value = s.loanFormId || "";
    $("#ffGuarantorMasterDocId").value = s.guarantorMasterDocId || "";
    $("#ffBorrowerMasterDocId").value = s.borrowerMasterDocId || "";
    refreshFlexxFormsAssignButtons();
    await loadFlexxFormsApplications();
  } catch (err) {
    if (badge) badge.textContent = "Error";
    if (status) setFormStatus(status, err.message, false);
  }
}

async function loadFlexxFormsApplications() {
  const list = $("#flexxformsApplicationsList");
  if (!list) return;
  try {
    const res = await fetch("/api/flexxforms/applications");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load applications");
    const apps = data.applications || [];
    if (!apps.length) {
      list.innerHTML = '<p class="hint">None yet. Share the public membership link and submissions will appear here automatically.</p>';
      return;
    }
    list.innerHTML = apps
      .map((a) => {
        const readiness = a.readiness || {};
        const feeLabel = readiness.membershipFeePaid ? "Paid" : "Not recorded";
        const depositLabel = readiness.initialContributionMet
          ? `Met ($${Number(readiness.depositTotal || 0).toFixed(2)})`
          : `$${Number(readiness.depositTotal || 0).toFixed(2)} of $${Number(readiness.initialContributionRequired || 0).toFixed(2)}`;
        const canApprove = a.status === "awaiting_approval" && readiness.canApprove;
        const approveBtn = canApprove
          ? `<button type="button" class="btn primary small ff-approve-application" data-id="${a.id}">Approve Member</button>`
          : "";
        const reprocessBtn =
          a.status !== "approved"
            ? `<button type="button" class="btn small ff-reprocess-application" data-id="${a.id}">Reprocess Data</button>`
            : "";
        const deleteBtn =
          a.status !== "approved"
            ? `<button type="button" class="btn linkish small ff-delete-application" data-id="${a.id}">Delete</button>`
            : "";
        const viewBtn = a.memberId
          ? `<button type="button" class="btn small ff-view-application-member" data-member-id="${a.memberId}">View Profile</button>`
          : "";
        return `<article class="flexxforms-application-card">
          <div class="flexxforms-application-head">
            <strong>${escapeHtml(a.applicantName || "Applicant")}</strong>
            <span class="badge">${escapeHtml(formatFlexxFormsApplicationStatus(a.status))}</span>
          </div>
          <p class="hint">${escapeHtml(a.applicantEmail || "No email on submission")}${a.createdAt ? ` · ${escapeHtml(a.createdAt)}` : ""}</p>
          ${
            a.memberId
              ? `<ul class="flexxforms-application-checklist">
                  <li>Membership fee ($${Number(readiness.membershipFeeRequired || 0).toFixed(0)}): <strong>${feeLabel}</strong></li>
                  <li>Initial contribution: <strong>${depositLabel}</strong></li>
                </ul>`
              : `<p class="status err">${escapeHtml(a.processingError || "Profile not created yet")}</p>`
          }
          <div class="flexxforms-application-actions">${approveBtn}${reprocessBtn}${viewBtn}${deleteBtn}</div>
        </article>`;
      })
      .join("");
    list.querySelectorAll(".ff-approve-application").forEach((btn) => {
      btn.addEventListener("click", () => approveFlexxFormsApplication(btn.dataset.id));
    });
    list.querySelectorAll(".ff-reprocess-application").forEach((btn) => {
      btn.addEventListener("click", () => reprocessFlexxFormsApplication(btn.dataset.id));
    });
    list.querySelectorAll(".ff-delete-application").forEach((btn) => {
      btn.addEventListener("click", () => deleteFlexxFormsApplication(btn.dataset.id));
    });
    list.querySelectorAll(".ff-view-application-member").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.memberId) openMemberProfileEditor(Number(btn.dataset.memberId));
      });
    });
  } catch {
    list.innerHTML = '<p class="hint">Unable to load applications</p>';
  }
}

async function deleteFlexxFormsApplication(applicationId) {
  const status = $("#flexxformsFormsStatus");
  if (!applicationId) return;
  if (
    !window.confirm(
      "Delete this membership application?\n\nThis removes the FlexxForms submission from Membership Applications. If the linked profile is still pending approval with no ledger activity, the prospective member profile is deleted too."
    )
  ) {
    return;
  }
  try {
    const res = await fetch(`/api/flexxforms/applications/${applicationId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed");
    const message = data.memberRemoved
      ? "Application and prospective member profile deleted."
      : data.applicationOnly
        ? "Application deleted. Linked member profile was kept."
        : "Application deleted.";
    setFormStatus(status, message, true);
    await loadFlexxFormsApplications();
    if (typeof loadMembers === "function") await loadMembers();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
}

async function reprocessFlexxFormsApplication(applicationId) {
  const status = $("#flexxformsFormsStatus");
  if (!applicationId) return;
  if (
    !window.confirm(
      "Re-read the stored FlexxForms submission and refresh this applicant profile? Use this if fields were imported incorrectly."
    )
  ) {
    return;
  }
  try {
    const res = await fetch(`/api/flexxforms/applications/${applicationId}/reprocess`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Reprocess failed");
    let message = "Application data refreshed from submission.";
    if (data.fetchedFromApi) {
      message += " Full answers loaded from FlexxForms API.";
    } else if (data.diagnosis?.hasFlexxFormsAnswers) {
      message += ` Parsed from FlexxForms answers[] (${data.diagnosis.answerLabels?.length || 0} fields).`;
    } else if (data.diagnosis?.labelKeys?.length) {
      message += ` Parsed ${data.diagnosis.populatedFieldCount || 0} core fields from ${data.diagnosis.labelKeys.length} labels.`;
    } else {
      message +=
        " Warning: stored webhook has no field labels. Ask FlexxForms to include full answers in form.submitted webhooks.";
    }
    if (data.diagnosis?.applicantName) {
      message += ` Applicant: ${data.diagnosis.applicantName}.`;
    }
    setFormStatus(status, message, true);
    await loadFlexxFormsApplications();
    if (typeof loadMembers === "function") await loadMembers();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
}

async function approveFlexxFormsApplication(applicationId) {
  const status = $("#flexxformsFormsStatus");
  if (!applicationId) return;
  if (
    !window.confirm(
      "Approve this applicant as an active member? Membership fee and initial contribution must already be recorded."
    )
  ) {
    return;
  }
  try {
    const res = await fetch(`/api/flexxforms/applications/${applicationId}/approve`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Approval failed");
    setFormStatus(status, "Member approved and account activated.", true);
    await loadFlexxFormsApplications();
    if (typeof loadMembers === "function") await loadMembers();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
}

$("#flexxformsSettingsForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#flexxformsFormsStatus");
  try {
    const res = await fetch("/api/flexxforms/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membershipFormId: $("#ffMembershipFormId")?.value,
        loanFormId: $("#ffLoanFormId")?.value,
        guarantorMasterDocId: $("#ffGuarantorMasterDocId")?.value,
        borrowerMasterDocId: $("#ffBorrowerMasterDocId")?.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    setFormStatus(status, "Form and document ids saved.", true);
    await loadFlexxFormsSettings();
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

$("#retryFlexxFormsProvision")?.addEventListener("click", async () => {
  const status = $("#flexxformsFormsStatus");
  setFormStatus(status, "Retrying FlexxForms setup…", true);
  try {
    const res = await fetch("/api/flexxforms/retry-provision", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Retry failed");
    setFormStatus(status, "FlexxForms workspace is ready.", true);
    await loadFlexxFormsSettings();
  } catch (err) {
    setFormStatus(status, err.message, false);
    await loadFlexxFormsSettings();
  }
});

$("#refreshFlexxFormsForms")?.addEventListener("click", async () => {
  const section = $("#flexxformsCatalogSection");
  const picker = $("#flexxformsFormsPicker");
  const status = $("#flexxformsFormsStatus");
  if (!flexxFormsProvisioned) {
    setFormStatus(
      status,
      "FlexxForms workspace is not connected yet. Click Retry FlexxForms Setup first.",
      false
    );
    return;
  }
  section?.classList.remove("hidden");
  if (picker) {
    picker.innerHTML = '<p class="flexxforms-catalog-loading hint">Loading forms and documents from FlexxForms…</p>';
  }
  try {
    const res = await fetch("/api/flexxforms/forms");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list FlexxForms catalog");
    const forms = Array.isArray(data.forms) ? data.forms : [];
    const templates = Array.isArray(data.templates) ? data.templates : [];
    renderFlexxFormsCatalog(forms, templates, status);
    const total = forms.length + templates.length;
    if (total) {
      setFormStatus(
        status,
        `Loaded ${forms.length} form(s) and ${templates.length} master document(s). Assign each item, then Save Form & Document Ids.`,
        true
      );
    } else {
      setFormStatus(status, "Nothing published in FlexxForms yet.", false);
    }
  } catch (err) {
    section?.classList.add("hidden");
    if (picker) picker.innerHTML = "";
    setFormStatus(status, err.message, false);
  }
});

async function loadMyLoanApplyEmbed() {
  const card = $("#myLoanApplyCard");
  const hint = $("#myLoanApplyHint");
  const host = $("#myLoanApplyEmbed");
  if (!card || currentUser?.role !== "member") return;
  try {
    const res = await fetch("/api/flexxforms/config");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load forms");
    const formId = data.config?.loanFormId;
    const embedUrl = data.config?.loanEmbedUrl;
    card.classList.remove("hidden");
    if (!formId && !embedUrl) {
      if (hint) {
        hint.textContent =
          "Ask your administrator to publish a loan form in Manage Forms & Documents.";
      }
      host?.classList.add("hidden");
      return;
    }
    if (hint) hint.textContent = "Complete the loan application below. Powered by FlexxForms.";
    if (host && window.mountFlexxFormsEmbed) {
      await window.mountFlexxFormsEmbed(host, {
        formId,
        embedUrl,
        formTitle: "Loan application",
      });
    }
  } catch {
    card.classList.add("hidden");
  }
}

async function openLoanAgreementsPanel(loanId, borrowerName) {
  activeLoanAgreementsId = loanId;
  const panel = $("#loanAgreementsPanel");
  const meta = $("#loanAgreementsMeta");
  const embeds = $("#loanAgreementsEmbeds");
  const status = $("#loanAgreementsStatus");
  if (!panel) return;
  panel.classList.remove("hidden");
  if (meta) meta.textContent = `Loan #${loanId}${borrowerName ? ` · ${borrowerName}` : ""}`;
  if (embeds) embeds.innerHTML = "";
  if (status) status.textContent = "";
  try {
    const res = await fetch(`/api/loans/${encodeURIComponent(loanId)}/flexxforms-documents`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load agreements");
    renderLoanAgreementEmbeds(data.documents);
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
}

function renderLoanAgreementEmbeds(docs) {
  const embeds = $("#loanAgreementsEmbeds");
  if (!embeds) return;
  if (!docs) {
    embeds.innerHTML = "";
    return;
  }
  const blocks = [];
  if (docs.guarantorEmbedUrl || docs.guarantorSignUrl) {
    const url = docs.guarantorEmbedUrl || docs.guarantorSignUrl;
    blocks.push(
      `<div><p class="subtle">Guarantor agreement (${escapeHtml(docs.guarantorDocStatus || "pending")})</p>
       <iframe class="loan-agreement-frame" title="Guarantor agreement" src="${escapeHtml(url)}"></iframe></div>`
    );
  }
  if (docs.borrowerEmbedUrl || docs.borrowerSignUrl) {
    const url = docs.borrowerEmbedUrl || docs.borrowerSignUrl;
    blocks.push(
      `<div><p class="subtle">Borrower agreement (${escapeHtml(docs.borrowerDocStatus || "pending")})</p>
       <iframe class="loan-agreement-frame" title="Borrower agreement" src="${escapeHtml(url)}"></iframe></div>`
    );
  }
  embeds.innerHTML = blocks.join("") || '<p class="subtle">No agreements created yet.</p>';
}

async function createLoanAgreement(purpose) {
  const status = $("#loanAgreementsStatus");
  if (!activeLoanAgreementsId) {
    setFormStatus(status, "Select a loan first.", false);
    return;
  }
  try {
    const res = await fetch(
      `/api/loans/${encodeURIComponent(activeLoanAgreementsId)}/flexxforms-documents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create agreement");
    setFormStatus(status, `${purpose} agreement created.`, true);
    renderLoanAgreementEmbeds(data.documents);
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
}

$("#createGuarantorAgreementBtn")?.addEventListener("click", () => createLoanAgreement("guarantor"));
$("#createBorrowerAgreementBtn")?.addEventListener("click", () => createLoanAgreement("borrower"));

function openMembershipApplyScreen(slug) {
  hideAllScreens();
  $("#membershipApplyScreen")?.classList.remove("hidden");
  const slugInput = $("#membershipApplyOrgSlug");
  const preset = slug || localStorage.getItem(ORG_SLUG_KEY) || DEFAULT_ORG_SLUG || "";
  if (slugInput && preset) slugInput.value = preset;
  if (preset) $("#loadMembershipApplyBtn")?.click();
}

$("#closeMembershipApplyBtn")?.addEventListener("click", () => {
  showLoginForPortal("member");
});

$("#loadMembershipApplyBtn")?.addEventListener("click", async () => {
  const status = $("#membershipApplyStatus");
  const success = $("#membershipApplySuccess");
  const hint = $("#membershipApplyHint");
  const host = $("#membershipApplyEmbed");
  const slug = ($("#membershipApplyOrgSlug")?.value || "").trim();
  if (!slug) {
    setFormStatus(status, "Organization code is required.", false);
    return;
  }
  try {
    const res = await nativeFetch(
      `/api/public/organizations/${encodeURIComponent(slug)}/flexxforms`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unable to load application form");
    const formId = data.membershipFormId;
    const embedUrl = data.membershipEmbedUrl;
    if (!formId && !embedUrl) {
      if (hint) {
        hint.textContent =
          "Ask your administrator to publish a membership form in Manage Forms & Documents.";
      }
      host?.classList.add("hidden");
      setFormStatus(status, "Membership form is not published yet.", false);
      return;
    }
    rememberOrgSlug(slug);
    if (hint) {
      hint.textContent = `${data.organizationName || "Cooperative"} membership application. Powered by FlexxForms.`;
    }
    if (success) {
      success.textContent = "";
      success.classList.add("hidden");
    }
    if (host && window.mountFlexxFormsEmbed) {
      await window.mountFlexxFormsEmbed(host, {
        formId,
        embedUrl,
        formTitle: "Membership application",
        onSubmitting: () => {
          setFormStatus(status, "Submitting your application…", true);
        },
        onError: (data) => {
          const msg =
            data?.message || data?.error || "Please fix the highlighted fields and try again.";
          setFormStatus(status, msg, false);
        },
        onCompleted: () => {
          setFormStatus(status, "", true);
          if (success) {
            success.textContent =
              "Thank you! Your application was received. Our administrators will review it after your membership fee and initial contribution are confirmed.";
            success.classList.remove("hidden");
          }
          host.classList.add("hidden");
          host.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      });
    }
    setFormStatus(status, "", true);
  } catch (err) {
    setFormStatus(status, err.message, false);
  }
});

applyAppBranding();
fillOrgSlugInputs();
initRecordSectionCollapseButtons();
initCooperativeReportViewer();
const applyOrgFromUrl = new URLSearchParams(window.location.search).get("apply");
if (applyOrgFromUrl && getPortalFromPath() !== "platform" && !isPublicPagePath()) {
  window.location.replace(
    `/c/${encodeURIComponent(applyOrgFromUrl.trim().toLowerCase())}/apply`
  );
} else if (getPortalFromPath() === "platform") {
  bootstrapPlatformApp();
} else if (isPublicPagePath()) {
  bootstrapPublicApp();
} else {
  bootstrapApp();
}