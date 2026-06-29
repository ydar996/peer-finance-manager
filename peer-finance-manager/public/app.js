const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const PLACEHOLDER_PHOTO = "/placeholder-avatar.svg";
const SESSION_KEY = "pfm_session";
const ORG_SLUG_KEY = "pfm_org_slug";
const DEFAULT_ORG_SLUG = "assurance";
let sessionToken = localStorage.getItem(SESSION_KEY) || "";
let currentUser = null;

let activeTab = null;
let selectedMemberId = null;
let pendingAccountPanel = null;
let loadedProfileMemberId = null;
let membersListRequestId = 0;
let membersListCache = [];
let memberSearchQuery = "";
let profileRequestId = 0;
let bookDetailRequestId = 0;
let booksRequestId = 0;
let loansRequestId = 0;
let loanDetailRequestId = 0;
let myAccountRequestId = 0;
let recordTabRequestId = 0;
let profileFormRequestId = 0;
let statementInspectRequestId = 0;

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
    sessionToken &&
    path.startsWith("/api/") &&
    !path.startsWith("/api/auth/login")
  ) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${sessionToken}`);
    return nativeFetch(url, { ...options, headers });
  }
  return nativeFetch(url, options);
};

function getPortalFromPath() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/register") return "register";
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

async function refreshOrganizationPreview(slug) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) {
    applyOrganizationBranding(null);
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
  $("#registerScreen")?.classList.add("hidden");
  $("#changePasswordScreen")?.classList.add("hidden");
  $("#appShell")?.classList.add("hidden");
}

function showLoginForPortal(portal = getPortalFromPath(), message = "") {
  if (portal === "register") {
    hideAllScreens();
    $("#registerScreen")?.classList.remove("hidden");
    return;
  }
  hideAllScreens();
  const screenId =
    portal === "admin"
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

async function loadMyAccount() {
  const requestId = ++myAccountRequestId;
  const summary = $("#myAccountSummary");
  const depositBody = $("#myDepositBody");
  const loanLots = $("#myLoanLots");
  const refreshBtn = $("#refreshMyAccount");
  if (summary) summary.innerHTML = '<p class="subtle">Loading account…</p>';
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
    summary.innerHTML = `
      <div class="book-card accent">
        <p class="book-label">Contributions Account Balance</p>
        <p class="book-amount money">${fmt.format(data.depositBalance || 0)}</p>
      </div>
      <div class="book-card">
        <p class="book-label">Loan Outstanding</p>
        <p class="book-amount money">${fmt.format(data.loanSummary?.outstanding || 0)}</p>
      </div>`;

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
    if (summary) summary.innerHTML = `<p class="status err">${escapeHtml(err.message)}</p>`;
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

function formatDate(value) {
  if (!value) return ":";
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
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

function closeBookDetail() {
  bookDetailRequestId += 1;
  $("#booksDetail")?.classList.add("hidden");
  $("#booksSummary")?.classList.remove("hidden");
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
    body.innerHTML = `<tr><td>Loading…</td></tr>`;

    const res = await fetch(`/api/books/detail/${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (requestId !== bookDetailRequestId) return;
    if (!res.ok) throw new Error(data.error || "Failed to load details");

    const detail = data.detail;
    $("#booksDetailTitle").textContent = detail.title;

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

    $("#booksDetailHead").innerHTML = `<tr>${detail.columns
      .map((col) => `<th>${escapeHtml(col.label)}</th>`)
      .join("")}</tr>`;

    if (!detail.rows.length) {
      body.innerHTML = `<tr><td colspan="${detail.columns.length}">No Records</td></tr>`;
      return;
    }

    body.innerHTML = detail.rows
      .map((row) => {
        const memberAttr = row.memberId
          ? ` class="detail-member-row" data-member-id="${row.memberId}"`
          : "";
        const cells = detail.columns
          .map((col) => {
            const cls = col.format === "money" ? ' class="money"' : "";
            return `<td${cls}>${formatDetailCell(row[col.key], col.format)}</td>`;
          })
          .join("");
        return `<tr${memberAttr}>${cells}</tr>`;
      })
      .join("");

    body.querySelectorAll(".detail-member-row").forEach((row) => {
      row.addEventListener("click", () => {
        navigateToMemberFromBooks(Number(row.dataset.memberId), "deposit");
      });
    });
  } catch (err) {
    if (requestId !== bookDetailRequestId) return;
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
    const { books } = await res.json();
    if (!res.ok) throw new Error(books?.error || "Failed to load books");
    grid.innerHTML = [
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
    loadMonthlyStatusReportPanel();
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
      <td><span class="member-number">${escapeHtml(m.member_number || "—")}</span></td>
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
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
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
      <p class="subtle profile-disclosure-note">Review your membership details. Contact the cooperative to change biodata other than emergency contact.</p>
      ${profileDemographicsGridHtml(p)}
    `
    )}
    ${profileDisclosureHtml(
      "Emergency Contact",
      `
      <p class="subtle profile-disclosure-note">Optional. Saved to your membership record and visible to cooperative administrators.</p>
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
          <p class="subtle">Member #: <strong>${escapeHtml(p.member_number || "—")}</strong></p>
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
  if (body) body.innerHTML = '<tr><td colspan="10" class="subtle">Loading loans…</td></tr>';
  try {
    const res = await fetch("/api/loans");
    if (requestId !== loansRequestId) return;
    const { loans } = await res.json();
  if (!loans.length) {
    body.innerHTML =
      '<tr><td colspan="10">No Loans Yet. Add Active Loans When Data Is Ready.</td></tr>';
    return;
  }
  body.innerHTML = loans
    .map((l) => {
      const isLedger = l.source === "bank_ledger";
      const loanLabel = isLedger ? `Loan ${l.loan_number}` : `#${l.id}`;
      const rowId = escapeHtml(String(l.id));
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
    </tr>
    <tr class="loan-detail-row hidden" data-detail-for="${rowId}">
      <td colspan="10" class="loan-detail-cell">Click the loan row to load disbursement and repayment details.</td>
    </tr>`;
    })
    .join("");

  body.querySelectorAll(".loan-row").forEach((row) => {
    row.addEventListener("click", () => toggleLoanDetail(row));
  });
  bindLoanStatementButtons(body);
  } catch (err) {
    if (requestId !== loansRequestId) return;
    if (body) body.innerHTML = `<tr><td colspan="10" class="status err">${escapeHtml(err.message)}</td></tr>`;
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
$("#goRegisterMemberBtn")?.addEventListener("click", () => switchTab("record"));
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
  if (autoGen) autoGen.checked = Boolean(settings.autoGenerate);
  if (autoPub) autoPub.checked = Boolean(settings.autoPublish);
  if (website) website.value = settings.organizationWebsite || "";
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
      const parts = [`Generated ${formatDate(status.generatedAt?.slice(0, 10)) || "recently"}`];
      if (status.published) {
        parts.push(`published ${formatDate(status.publishedAt?.slice(0, 10)) || "to members"}`);
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
    list.innerHTML = reports
      .map(
        (report) => `
      <li>
        <button type="button" class="btn linkish cooperative-report-download" data-period-slug="${escapeHtml(report.periodSlug)}">
          Cooperative Status · ${escapeHtml(report.periodSlug)} · as at ${escapeHtml(formatDate(report.asOfDate))}
        </button>
      </li>`
      )
      .join("");
    list.querySelectorAll(".cooperative-report-download").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          setButtonBusy(btn, true, "Downloading…");
          const res = await fetch(
            `/api/me/cooperative-status-reports/${encodeURIComponent(btn.dataset.periodSlug)}/file`
          );
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Download failed");
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
          setButtonBusy(btn, false);
        }
      });
    });
    loadOperationalExpensesPreview({
      apiPath: "/api/me/operational-expenses-summary",
      bodyEl: $("#myOperationalExpensesBody"),
      totalEl: $("#myOperationalExpensesTotal"),
      sectionEl: $("#myOperationalExpensesSection"),
      overviewEl: $("#myPerformanceOverview"),
    });
  } catch {
    card.classList.add("hidden");
  }
}

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

async function loadBankImportPanel() {
  const cdInput = $("#bankImportCdBalance");
  if (!cdInput) return;
  try {
    const res = await fetch("/api/settings/cd-balance");
    const data = await res.json();
    if (!res.ok) return;
    if (data.cdBalance?.balance != null && !cdInput.value) {
      cdInput.placeholder = Number(data.cdBalance.balance).toFixed(2);
    }
  } catch (_) {
    /* optional prefill */
  }
}

async function downloadBankLedgerReference(button) {
  setButtonBusy(button, true, "Preparing…");
  try {
    const res = await fetch("/api/bank-ledger/reference/download");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Download failed");
    }
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cooperative-bank-ledger-reference.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

async function sortBankLedgerUpload(button) {
  const form = $("#bankImportForm");
  if (!form) return;
  const workbook = form.workbook?.files?.[0];
  const statement = form.statement?.files?.[0];
  if (!workbook && !statement) {
    alert("Choose your master ledger file first.");
    return;
  }
  setButtonBusy(button, true, "Sorting…");
  try {
    const fd = new FormData();
    if (workbook) fd.append("workbook", workbook);
    if (statement) fd.append("statement", statement);
    const res = await fetch("/api/bank-ledger/reference/sort-upload", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Sort failed");
    }
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cooperative-bank-ledger-reference.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    const status = $("#bankImportStatus");
    if (status) {
      status.textContent =
        "Sorted file downloaded. Replace your local cooperative-bank-ledger-reference.csv with this file.";
      status.className = "status ok";
    }
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonBusy(button, false);
  }
}

$("#downloadBankLedgerReference")?.addEventListener("click", (e) => {
  downloadBankLedgerReference(e.currentTarget);
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
  if (!missing.length) {
    clearBankImportConflicts();
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <strong>Manual entries not in this file (${missing.length})</strong>
    <p>These were entered in Peer Finance Manager but are missing from the CSV/workbook you selected. Importing without them will remove them from Cooperative Books.</p>
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
    <p>Open the missing-rows file, copy its transaction rows into <strong>cooperative-bank-ledger-reference.csv</strong>, then either import that file or click <strong>Sort selected file &amp; download</strong> to get a date-ordered file. After import, click <strong>Download sorted reference CSV</strong> to replace your local copy from live Cooperative Books.</p>
  `;
}

async function downloadMissingManualRows(button) {
  const form = $("#bankImportForm");
  if (!form) return;
  const workbook = form.workbook?.files?.[0];
  const statement = form.statement?.files?.[0];
  if (!workbook && !statement) {
    alert("Choose your master ledger file first.");
    return;
  }
  setButtonBusy(button, true, "Preparing…");
  try {
    const fd = new FormData();
    if (workbook) fd.append("workbook", workbook);
    if (statement) fd.append("statement", statement);
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
  const workbook = form.workbook?.files?.[0];
  const statement = form.statement?.files?.[0];
  if (!workbook && !statement) {
    clearBankImportConflicts();
    return null;
  }
  const fd = new FormData();
  if (workbook) fd.append("workbook", workbook);
  if (statement) fd.append("statement", statement);
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
  const workbook = form.workbook?.files?.[0];
  const statement = form.statement?.files?.[0];
  if (!workbook && !statement) {
    status.textContent = "Choose your master ledger file (cooperative-bank-ledger-reference.csv).";
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
        `${r.deposits || 0} deposits`,
        `${r.loanRepayments || 0} loan repayments`,
        `${r.expenses || 0} expenses`,
        r.skippedNoMember ? `${r.skippedNoMember} skipped (member not matched)` : null,
        r.cdBalance != null ? `CD balance set to ${Number(r.cdBalance).toFixed(2)}` : null,
        "Use Download sorted reference CSV for a date-ordered file matching live books.",
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
  if (!e.target?.name || !["workbook", "statement"].includes(e.target.name)) return;
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
  return new Date().toISOString().slice(0, 10);
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

function openMemberProfileEditor(memberId) {
  switchTab("record", { skipRecordLoad: true });
  loadRecordTabData().then(() => loadProfileIntoUpdateForm(memberId));
  document.getElementById("updateProfileForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

    await Promise.all([loadExpenses(), loadDistributions(), loadCdBalanceForm()]);
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
  el.textContent = message;
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
  status.textContent = "Creating cooperative…";
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
    setFormStatus(
      status,
      `Created ${data.organization.name}. Sign in at /admin with organization code "${data.organization.slug}".`,
      true
    );
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

bootstrapApp();