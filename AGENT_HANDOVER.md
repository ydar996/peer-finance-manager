# Agent Handover — Peer Finance Manager (AssurCoop)

This document gives the next developer or AI agent enough context to continue work without re-discovering the project from scratch.

**Last updated:** November 21, 2026 (member Share Capital accounts; member/bank-account import templates; app-wide spacing pass; bank-account safe delete)  
**Organization:** Assurance Investment and Cooperative Inc. (slug: `assurance`)  
**Workspace:** `C:\Users\ydara\Documents\AssurCoop`  
**Production:** https://peer-finance-manager.netlify.app (UI) + https://peer-finance-manager.onrender.com (API)  
**GitHub:** `ydar996/peer-finance-manager`  
**Production HEAD (code):** `c3cf0ec` (one-tap repayment-plan save) — prior: inbox buttons `6b0236d`, disbursement notice + plan files `3fddd9d`

---

## 0. IMMUTABLE AGENT INSTRUCTIONS (always follow)

> **Self-instructing rule for every agent, now and forever:**  
> **Read this section first. Document every change immediately in the same turn. The user must never have to ask you to update documentation.**

**Every change we make — and every outstanding task we discover, start, complete, or reprioritize — MUST be documented immediately and continuously for the next agent. Not at the end of a session. Not "when the user asks." Not only on commit.**

Documentation is the handoff contract between sessions. If it is stale, the next agent will guess or re-read chat transcripts and waste the user's time.

**Cursor enforces this via:** `.cursor/rules/continuous-documentation.mdc` (`alwaysApply: true`) — agents must follow it on every task without being reminded.

### Continuous documentation rule (non-negotiable)

1. **Read this file first** at the start of every session — before relying on chat history or agent transcripts. **Before any bank-ledger or reconcile advice**, read **§1A Assurance bank ledger** (golden state, corruption history, do-not-regress list) and **§1B Bank ledger product mode** (all-tenant append contract).
2. **Document as you go** — in the same session, **in the same turn** when the change lands (before your reply to the user):
   - **§ Changelog** — append a dated bullet the moment you implement a feature, fix, or behavior change.
   - **§ Outstanding tasks** — add, update, mark ✅, or remove tasks the moment their status changes.
   - **Other docs** — update per the checklist below whenever those areas are affected.
3. **Never wait for the user** to say "update the docs," "sync documentation," or "update the handover." That request should never be needed.
4. **Before ending any session** that touched code or config: verify changelog and outstanding tasks match the final state (including uncommitted local changes).
5. **If the user commits without you:** on the next session, reconcile `git log` against this file and backfill any gaps immediately.

**Failure to keep docs current is a session failure — treat it like leaving broken code.**

### Per-change checklist (do this every time)

| Step | Action | When |
|------|--------|------|
| 1 | Read `AGENT_HANDOVER.md` §0 + changelog + tasks | Start of every session |
| 2 | Implement code/config change | During work |
| 3 | Update `AGENT_HANDOVER.md` changelog + tasks | **Same turn** as step 2 |
| 4 | Update other docs from table below | **Same turn** if affected |
| 5 | Verify docs match final repo state | Before session ends |

### Required documentation updates (checklist)

| When you change… | Update these files (immediately) |
|------------------|----------------------------------|
| Any feature, bug fix, or behavior | **AGENT_HANDOVER.md** — § Changelog + § Outstanding tasks |
| User-visible screens, login, or workflows | **USER-GUIDE.md** |
| Deploy, cloud, Git push, or data upload | **UPDATE-AND-PUBLISH.md** and/or **DEPLOY-TODAY.md** |
| Architecture, ports, stack, folder layout | **README.md** — Architecture + Project layout |
| UI labels/buttons (Title Case rules) | `.cursor/rules/ui-copy-standards.mdc` and **UI-COPY-STANDARDS.md** if conventions change |
| Data backup / restore on production | **USER-GUIDE.md** §25, **UPLOAD-DATA-TO-PRODUCTION.md** |
| Port numbers | **Ports in Use by Applications.md** (project copy + Desktop master) |

### Changelog rule

Append a dated bullet under **§ Changelog** in this file **as soon as the change is made**:

```
- **YYYY-MM-DD** — What changed, why, and any production/deploy notes.
```

### Outstanding tasks rule

- **Add** new tasks the moment they are discovered — do not wait.
- **Mark completed** items ✅ or remove them the moment they are done.
- **Reprioritize** when scope or urgency changes.
- Keep **High / Medium / Low** sections current; fix duplicate numbering when editing.

### Production safety rules

1. **Never commit** `data/`, `*.db`, credentials CSV, or `.env` — they are gitignored.
2. **Never set** `PFM_COOP_ROOT` on Render — breaks module loading (use `PFM_DATA_DIR` only).
3. **Code deploy** = `git push` → Netlify + Render auto-deploy. **Data deploy** = **Admin → Maintenance** (backup/restore) or **Admin → Import** (ledger). Never instruct Coop admins to use SFTP or file-copy tools.
4. **Do not git commit** unless the user explicitly asks.
5. After cloud-affecting changes, note whether user must **re-upload data** or only **git push**.
6. **No em dashes** in user-facing app copy — use colons (`:`). See `.cursor/rules/ui-copy-standards.mdc`.

### FlexxForms messages to partner (mandatory)

When the user asks for a message to send **FlexxForms engineers** (or any FlexxForms follow-up you draft for them):

1. Put the **entire** copy-paste message in **exactly one** fenced code block (plain ` ``` `). No splitting across multiple blocks or mixing prose with the message body.
2. The user must be able to **one-click copy** the full text and paste into email/Slack.
3. Frame issues as **platform / multi-tenant** requirements for **all** Cooperatives PFM provisions, not only Assurance. Each org has its own `membership_form_id`, `loan_form_id`, and document ids in the registry DB; many are not fully configured yet.
4. Keep the canonical template in **§ FlexxForms integration** below current; customize incident details only inside the single code block you give the user.
5. **Wait for user retest after deploy** before drafting an escalation. Sequence: deploy → user hard-refreshes and tries again → diagnose (UI, admin applications list, webhook if needed) → then write the note with concrete facts. Do not pre-write partner notes before the user has retested.

### Document map (keep all current)

| Document | Audience | Purpose |
|----------|----------|---------|
| [USER-GUIDE.md](./USER-GUIDE.md) | All users (members, staff, admins) | Complete simple-language guide: every tab, workflow, glossary |
| [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) | Yinka | How to change code and publish safely |
| [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md) | Coop admins | Browser-only data ops: **Admin → Maintenance** / Import |
| [SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md](./SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md) | Owners / lay admins | Plain-language scale and architecture review |
| [UI-COPY-STANDARDS.md](./UI-COPY-STANDARDS.md) | Agents/devs | No em dashes, Title Case, wording rules |
| [.cursor/rules/continuous-documentation.mdc](./.cursor/rules/continuous-documentation.mdc) | Agents (auto) | **Always applied** — doc updates same turn as every change |
| [DEPLOY-TODAY.md](./DEPLOY-TODAY.md) | Yinka | First-time cloud setup (already done) |
| [README.md](./README.md) | Developers | Technical overview |
| **AGENT_HANDOVER.md** | Agents | Background, architecture, tasks, changelog |

---

## Machine transfer snapshot (2026-08-09)

Use this when cloning or continuing on another PC. **Read §0, then §1A/§1B before any ledger work.**

### Git / deploy state

| Item | Value |
|------|--------|
| Branch | `main` (tracks `origin/main`) |
| Latest code on GitHub | `9c10243` (login placeholder `acme`); prior: brochure `13c1a24`, SPA CSS `03d1541`, country profiles `ae04579`, CD terms `efd3006`, machine-transfer docs `382e588`, expense labels `d399bb4`, SaaS **$29.99** `4c31805` |
| Working tree | SPA asset-path fix + private `/platform`. Scratch file `tmp-live-app.js` deleted 2026-08-21. |
| Code deploy path | `git push` → Netlify (UI) + Render (API) auto-deploy |
| Data deploy path | Live **Admin → Maintenance** (backup/restore) or **Import** (ledger). Never SFTP/WinSCP for routine ops |

### SaaS pricing (live in code)

| Plan | Price |
|------|-------|
| Monthly | **$29.99** |
| Quarterly | **$89.07** (1% off) |
| Annual | **$345.48** (4% off) |

Source of truth: `peer-finance-manager/lib/platform-billing-constants.js`. Stripe checkout uses dynamic `price_data` (no fixed Stripe Price IDs). Docs: `USER-GUIDE.md` §20, `STRIPE-SETUP.md`, `STRIPE-PAYMENTS-GUIDE.md`, marketing `product.html`.

### Assurance ops status (verified 2026-08-21 on production API)

| Item | Value |
|------|--------|
| Org slug | `assurance` |
| Subscription | **Active annual** (check). Recorded 2026-08-21. Period ends **2027-08-22**. |
| Grace until | Cleared by active paid status (old grace date may still show in the registry until overwritten). |
| Access | Full access as an active subscriber. Do not change Assurance country. |
| Platform | Operator-only URL `/platform` (never linked from public UI) shows Assurance as Active / Annual |

### What moves with Git vs what does not

| Moves via `git clone` / `git pull` | Does **not** move with Git (local/cloud only) |
|------------------------------------|-----------------------------------------------|
| All app code, `AGENT_HANDOVER.md`, USER-GUIDE, Stripe docs, Cursor rules | `data/` (local SQLite, org DBs, uploads) |
| | `.env` / Render env vars (Stripe, SMTP, `PLATFORM_ADMIN_PASSWORD`, `PFM_DATA_DIR`) |
| | Production Render disk under `PFM_DATA_DIR` |
| | Untracked scratch dumps (none currently; `tmp-live-app.js` was deleted 2026-08-21) |

### New machine setup checklist

1. Install **Node.js 18+** and Chrome/Edge (PDF via Puppeteer).
2. `git clone https://github.com/ydar996/peer-finance-manager.git` (or pull if folder already copied).
3. `npm install` from repo root (and under `peer-finance-manager` if that is how this clone is structured; follow root `package.json` scripts).
4. Copy or recreate local `.env` if you develop against local secrets (never commit).
5. Optional local data: restore from an **Admin → Maintenance → Download Database Backup** taken on the old machine, or work against production Admin only.
6. Local run: `npm start` → http://localhost:3457/admin
7. Read this file §0 + changelog + outstanding tasks before coding.
8. Confirm live pricing/labels after hard-refresh: product page, Admin → Subscription, Monthly Status Report → Operational Expense Labels.

### Recent product work already shipped (do not re-implement)

- Expense report label presets + Add New Label (`d399bb4`)
- SaaS fee **$29.99** / 1% quarterly / 4% annual (`4c31805`)
- Apply embed signature gap fix (`a71d895`)
- Membership alerts, bylaws cleanup, Messages rich UI, loan applications pipeline, membership status types, Maintenance tab, bank append product mode (see changelog)
- Manual status report as-of today + CD term form (`efd3006`)

**Shipped** `ae04579`: Country profiles (US default, Nigeria opt-in), `country-catalog.js` banks/states searchable dropdowns, Nigeria DD/MM/YYYY. Leave Assurance on United States.

---

## Changelog

- **2026-11-24** - **New docs: FEATURES-US.md and FEATURES-NG.md.**
  Plain-language, layman-readable inventory of every feature in the app,
  one edition per country profile. US edition: USD, MM/DD/YYYY,
  "Zelle/Bank" rails, US bank catalog, USD pricing ($29.99/$89.07/$345.48).
  Nigeria edition: NGN, DD/MM/YYYY, "Bank Transfer" rails, "LGA" district
  label, NG bank catalog, NGN pricing (₦40,343/₦119,818/₦464,744) and
  ₦50,000 membership defaults. Content is identical in structure; only
  country-specific details differ. Update both together when features
  change; USER-GUIDE.md remains the how-to companion.

- **2026-11-24** - **Security pass round 2: forced-reset fix, session
  revocation, seed credentials, CSV injection, rate-limit pruning.**
  - **Platform admin password no longer force-reset on boot**
    (`lib/platform-auth-service.js` `ensurePlatformAdminUser`). Previously
    every startup overwrote `password_hash` with
    `PLATFORM_ADMIN_PASSWORD || "12345678"`, so any password change made
    through the app was silently reverted on each deploy, and without the
    env var the super-admin password was permanently the repo default.
    Now: the hash is only rotated when `PLATFORM_ADMIN_PASSWORD` is
    explicitly set AND differs from the stored hash (operator recovery
    path); on rotation all `platform_sessions` for that user are revoked.
    Without the env var, existing users are untouched; a fresh production
    install gets a random password logged once to console (dev keeps the
    "12345678" convenience default). `DEFAULT_PLATFORM_ADMIN_PASSWORD`
    constant removed.
  - **Session revocation on credential change** (`lib/auth-service.js`):
    `changePassword`, `setPasswordFromSetupToken`, and
    `resetMemberPortalPassword` now `DELETE FROM sessions WHERE user_id AND
    organization_slug` in the registry DB, so a stolen session token dies
    the moment the password rotates (was: valid up to 7 days).
  - **Org admin seed credential env override**: `ensureAssuranceAdminUser`
    new-user insert now uses `ASSURANCE_ADMIN_PASSWORD` env when set
    (falls back to the historical default with a `[security]` console
    warning in production). Existing users are untouched as before.
  - **CSV formula injection guards**: `csvEscape`
    (`lib/cooperative-bank-ledger-csv.js`) and the member-credentials
    export (`writeMemberCredentialsExport` in `lib/auth-service.js`) now
    prefix `'` on cells beginning with `=`, `+`, `-`, `@` (or leading
    tab/space), so member-supplied names/descriptions cannot execute
    spreadsheet formulas when an export is opened in Excel. XLSX exports
    are unaffected (string cells are not evaluated as formulas).
  - **Stale credential exports cleaned**: writing a new
    `member-credentials-*.csv` now deletes prior ones, so plaintext temp
    passwords do not accumulate on the server disk.
  - **Rate-limit table pruning** (`lib/rate-limit.js`): `sweep()` now also
    deletes `rate_limit_hits` rows older than 24h; persisted buckets no
    longer grow unbounded.
  - Verified: login -> change-password kills both live sessions (401);
    boot no longer resets the platform password; all four edited files
    pass `node --check`.
  - Audit found clean: Stripe + FlexxForms webhooks verify signatures and
    fail closed; all file-download endpoints are behind auth + ownership
    checks; no hardcoded API keys/secrets in code.
  - Remaining accepted residuals: MFA still off by owner choice;
    `pkg` devDependency vuln (no published fix); `api-flood` limiter
    in-memory by design; member-credentials CSV keeps only the latest
    file (admin channel by design).

- **2026-11-24** - **Security pass: session cookies, encrypted backups,
  persistent rate limits, set-password links, dependency audit.**
  - **Sessions:** `pfm_session` / `pfm_platform` HttpOnly SameSite=Lax
    cookies (Secure on HTTPS, 7-day Max-Age) set on login/mfa-verify/platform
    login and cleared on logout (`lib/session-cookie.js`). Browser JS no
    longer persists tokens: `sessionToken`/`platformToken` are in-memory
    Bearer fallbacks only; `/api/auth/me` is always probed on boot so
    cookie sessions survive restarts. Bearer / `x-session-token` /
    `x-platform-token` headers remain supported for programmatic clients.
    New CSRF guard in `server.js`: mutating requests carrying a session
    cookie from a foreign Origin get 403 (Bearer-authed requests unaffected).
  - **Encrypted backups:** `POST /api/admin/data-backup/encrypted`
    `{passphrase}` returns `*.db.enc` (PFMENC1 | salt | iv | tag | AES-256-GCM,
    key = scrypt(passphrase); `lib/backup-crypto.js`). Restore + preview
    accept a `passphrase` form field and auto-detect encrypted uploads;
    plain `.db` restores unchanged (`resolveUploadForRestore` in
    `admin-data-service.js`). Maintenance tab: primary button downloads
    encrypted, "Download Unencrypted" kept as secondary.
  - **Rate limits:** `rateLimit(scope, {persist: true})` writes hits to
    `rate_limit_hits` in the registry DB, so login/register-org/org-lookup/
    mfa-verify/password-setup throttles survive restarts; falls back to
    in-memory if the store is unavailable. `api-flood` stays memory-only.
  - **Set-password links:** member welcome/reset emails no longer carry
    plaintext temp passwords. `password_setup_tokens` (SHA-256 at rest,
    single-use, 24h) in `lib/password-setup-service.js`; public
    `POST /api/auth/set-password` (rate-limited) and `/set-password` SPA
    screen (index.html, app.js, server + netlify redirect). Templates
    `member_welcome_login`/`member_password_reset` now use `{{setupUrl}}`;
    `renderAutomatedEmail` aliases legacy `{{tempPassword}}` slots in saved
    overrides to `{{setupUrl}}`. `resetMemberPortalPassword` still returns
    `tempPassword`/`copyText` for manual handoff (unchanged).
  - **Dependencies:** `npm audit` 18 vulns → 1. Upgraded nodemailer 9→10
    (cross-tenant SMTP credential disclosure fix), puppeteer 24→25
    (extract-zip/proxy-agent/zod chain; PDF output verified), xlsx →
    SheetJS CDN 0.20.3 (npm registry version is frozen at vulnerable
    0.18.5; tarball dep noted — a cdn.sheetjs.com outage would fail a
    build, not the running app), `qs` forced to ^6.16.2 via package.json
    `overrides`. Residual: `pkg` devDep moderate (no fix exists).
    Added `.github/dependabot.yml` + `.github/workflows/npm-audit.yml`
    (weekly + on dep changes, `--omit=dev --audit-level=high`).
- **2026-11-24** - **Master member-email switch (default OFF), after 37
  member emails fired at Twilight.** `member_email_delivery_log` showed two
  `deposit_credit_alert` batches (15 + 22 members, Nov 23 23:47/23:52)
  triggered by `notifyImportedMemberDeposits` firing unconditionally after
  every bank import; rebuilds reissue transaction ids so the
  `deposit_credit_alert_log` dedupe cannot stop repeats. New
  `lib/member-email-gate.js` reads cooperative setting
  `member_email_notifications_enabled` (unset = OFF, opt-in). Gate applied
  at every member-facing send: deposit credit alerts (`deposit-credit-alert.js`),
  loan due notices (`loan-due-notice.js`), loan approval/terms/disbursement
  notices (`loan-application-notify.js`), meeting announced/cancelled/reminder
  emails (`meeting-notification-service.js` `sendMemberBroadcastEmail`),
  report-published + month-end member reminders
  (`report-notification-service.js` `sendReportReminderEmails`; the admin
  preview send stays ungated), `inbox_new_message` portal email to members
  (`messaging-service.js`), membership applicant emails +
  deposits-verified corrections (`membership-application-notify.js`),
  member portal welcome emails (`auth-service.js` `emailMemberTempPassword`
  purpose `welcome`; purpose `reset` still sends: it is
  member/admin-requested and `copyText` stays available), and annual dues
  reminders (`annual-dues-reminder-service.js`: the master gate overrides
  even `manual: true`). When off, the email is skipped and portal notices
  still post; audit rows record reason `member_email_disabled`. Admin
  endpoints `GET/PUT /api/cooperative/member-email-notifications`; toggle
  "Email Members Automatically" at the top of the Automated Messages tab
  (`index.html`, `app.js`). Admin-facing email is unaffected (org
  registration welcome, admin inbox/report notices).
- **2026-11-24** - **Deposits YTD card note uses full-year totals, drops
  empty years.** The note compared against same-period YTD of prior years,
  so Twilight's 2025 deposits (all made Nov 25+, after the Nov-24 cutoff)
  read "vs 2025 ₦0.00 (new)" and an empty 2024 was also listed. The card
  now compares full prior-year totals (member-scoped) and only names years
  that actually have deposits: "vs 2025 Total ₦2,900,000" — or "No member
  contributions recorded before YYYY" when none exist. `pctChange` /
  `formatPctChangeLabel` removed (dead code).
- **2026-11-24** - **Coherence audit: every detail column foots to its
  total.** Ran a column-vs-footer check across all 23 book detail views on
  the Twilight DB and fixed the three that could not foot: (1) Investments
  rows now display signed "position contribution" (placements positive,
  returns in parentheses) so the column sums exactly to Net Position —
  previously all rows showed ABS while the footer was net. (2) Bank Ledger
  Rows no longer lists `membership_fee` legs — they are member-account
  entries (visible/editable on member profiles), not bank cash — so the
  displayed column sums to the Combined Bank Ledger Balance. (3)
  `sumDepositsBetween` (Deposits This Month/YTD cards) now joins `members`
  like the detail does, so non-member `deposit`-typed rows can no longer
  inflate the card above its own detail. All views verified footing to
  footer; net-income's mid-table "Total Income" subtotal is a presentation
  row (not an addend) and is the only non-footing row by design.
- **2026-11-24** - **Net Income detail reads as an income statement; flat
  views no longer drop fields.** `openBookDetail` built the table view as
  `{columns, rows, emptyMessage}` only, silently discarding `footer` (the
  new Total rows) and `hasControls` (the Category/Split controls) for every
  flat detail view; it now spreads the whole detail object. Net Income rows
  are now structured as an income statement: income lines, a bold "Total
  Income" subtotal (`row.emphasize` renders a `detail-subtotal` row), then
  "Less: Cooperative Expenses", with the Net Income footer beneath. All
  negative money cells in detail tables now render in accounting
  parentheses — `(₦2,639,568.24)` instead of a faint minus — via
  `formatDetailCell`.
- **2026-11-24** - **Status report: capped investment label, "Bank Accounts"
  line.** `investmentSectionLabel` joined every investment row's raw bank
  narration into the balance-sheet label — a page-long blob for the 45-row
  Twilight ledger. Labels now dedupe; orgs with up to four distinct
  investment names keep the joined label, larger ledgers read
  "Investments (N Entries)". The report's cash line is relabeled
  "Bank Accounts" (it is all imported bank ledgers, same as the renamed
  books card) in the balance sheet, bank-balances table, and render
  fallbacks.
- **2026-11-24** - **Total rows on every book detail + topbar brand pill
  removed.** All book detail tables now render a `<tfoot>` Total row driven
  by a per-view `footer` object (per-column sums where meaningful: loans
  totals principal/repaid/interest/outstanding; reconcile totals only the
  account balances, not drift rows; bank-ledger "Net Total" excludes
  membership_fee legs which are member-account legs, not bank cash; the
  checking/CD balance views show "Current Balance"/"All imported bank
  ledgers" rather than a meaningless column sum). Removed the duplicated
  "Peer Finance Manager" brand pill from the in-app topbar (sidebar already
  carries the brand); login/portal `.org-brand` instances untouched.
  Also fixed: the Investments detail `summary` still used the pre-fix
  ABS-sum (₦89M) while the card used net math; it now uses the same
  signed net-position math (`summary` = net, footer labeled "Net
  Position"). Found while auditing card-vs-detail consistency: the Oct-7
  ₦4,052,707.18 "MATURED TIME DEPOSIT" credit was typed `deposit`
  (keyword fall-through — every other FD settle row is `investment`),
  inflating "Deposits This Year" by ₦4.05M vs the member-joined detail.
  Reclassified to `investment` in the corrected Twilight DB (8th
  adjustment): Deposits YTD card = detail = ₦7,850,676, Investments
  ₦40,248,328.13. NOTE: the live org needs the same one-row reclassify
  in-app (Bank Ledger Rows → Oct-7 ₦4,052,707.18 → Category: Investment)
  or a re-upload of the refreshed `peerfinance-corrected-2026-11-24.db`.
- **2026-11-24** - **Bank Accounts card: per-account breakdown, honest label.**
  The card formerly titled "Checking Account" showed the combined ending
  balance of *every* imported bank ledger (Providus Operations + Share
  Capital + Savings + Fixed Deposit for Twilight: ₦6,230,405.01), which read
  as a checking-only figure and confused owners. The card is now titled
  "Bank Accounts" and its detail lists a Ledger Balance row per account
  (label + institution) plus an "All Accounts" combined row, so the total is
  self-documenting. Accounts with no ledger rows (e.g. Twilight's GTBank
  Operating) are omitted. The figure is intentionally all-bank cash: the
  status report uses the same number as "Checking Account" in Total Assets
  (`resolveCheckingBalanceForReport`), which remains unchanged.
- **2026-11-24** - **Bank Ledger Rows view + three latent adjustment-rebuild
  bugs fixed.** New **Bank Ledger Rows** button on Cooperative Books opens a
  full ledger of every bank transaction (member and non-member rows) with
  Category reclassify and Split controls, so non-member rows (e.g. the
  Sterling credits, the ₦2.5M UBA NOM placement) are editable for the first
  time; member rows were already editable on member profiles. Category
  controls also added to the Cooperative Investments, Cooperative Expenses,
  and Other Cooperative Income detail views. Bugs found by replaying a
  reclassify on the live Twilight backup: (1) the rebuild deleted only
  primary-account rows while reloading all accounts' rows, so every
  reclassify/split would have duplicated every Share Capital, Savings, and
  Fixed Deposit row; rebuild now clears all `bank_import` rows via
  `deleteScope: 'all'` while statement imports keep the primary-only delete.
  (2) The rebuild stream dropped `bank_account_id`, `investment_account_id`,
  and `member_id`; reinserted rows now preserve account attribution and
  curated investment-account links. (3) Expense reclassifies never matched
  because the stream strips the "Category: " description prefix while keys
  were stored against the raw description; `bankTxLedgerKey` now keys on the
  stored description (`originalDescription`) carried through the stream, and
  emitted reclassify legs preserve the parent's cash-direction sign instead
  of storing absolute values (a reclassified debit stays a debit). A fourth
  related fix: the rebuild stream carried export-normalized descriptions, so
  rows were permanently re-written on every rebuild (`ACCOUNT TRANSFERS MOB:`
  prefixes stripped, expense categories re-derived). The stream now carries
  stored descriptions verbatim, expense inserts honor an existing
  "Category: " prefix instead of re-deriving it, and adjustment keys stay
  stable across rebuilds. Verified end-to-end on a copy of the live
  Twilight backup: all seven corrections produce the workbook-exact figures
  (contributions 3,900,608; fees 6,850,068; other income 40,782.38; share
  capital 38,326,843; expenses 2,639,568.24; investments 44,301,035.31).
- **2026-11-24** - **Cooperative Investments card now shows net positions, not
  turnover.** The card previously summed `ABS(amount)` over every `investment`
  row, so FD rollovers were counted on each cycle and internal transfers between
  the Cooperative's own accounts were counted twice (once per side). On the
  Twilight ledger this read ₦89.09M against ~₦42M actually placed. The card now
  reports net placements minus returns: bank-import and curated-account rows use
  signed flow semantics (`recordInvestment` placements are negative, returns
  positive), while legacy unlinked position-marker rows (e.g. the Assurance
  spreadsheet "Investment in ..." rows) keep absolute value. Negative results
  clamp to zero. The card note now says "N Investment Entries" when it is
  counting narrations rather than curated accounts. Verified against the live
  Twilight backup: net external placements −₦42,035,000 (workbook GL 1220
  clearing: ₦42,035,006) and the card computes ₦41,801,035.31, i.e. external
  placements less returned yield (+₦98,816.25 capitalised interest + ₦135,148.44
  internal-FD residual). Regression coverage added to
  `scripts/test-investment-account-display.js` (net math, clamp, manual +
  legacy-marker mixing).
- **2026-11-24** - **Other Cooperative Income type + workbook-verified ledger
  corrections.** New transaction type `other_income` (non-member cooperative
  income: payment surpluses, refunds, misc credits) wired end to end:
  constants.js TRANSACTION_TYPES, transaction-import-types label maps +
  append/template support, cooperative-bank-ledger-csv LEDGER_TYPES (it is a
  bank-facing type so it stays in the cash projection and generated reference)
  + TYPE_TO_NARRATIVE, parse-bank-sources TYPE_MAP + COOPERATIVE_LEDGER_TYPES,
  insert branches in import-bank-ledger.js and bank-import-append.js
  (member optional, positive amounts). Books: otherIncome feeds
  totalCooperativeIncome, cooperativeNet, an "Other Cooperative Income" row
  in Total Cooperative Income and Cooperative Net Income details (only when
  nonzero), and a new other-income detail slug listing the credits.
  cooperative-status-report.js shows an Other Cooperative Income income
  statement line when nonzero. Client: reclassify dropdown option, split
  member-optional, formatTxType label.
  Adjustment engine: `membership_fee` reclassify/split legs now expand to the
  deposit + membership_fee pair the member books need (member balance nets to
  zero, fee income recorded, bank cash unchanged). Emitted adjustment product
  rows carry an `adj:<ledger_key>` marker in transactions.reference so a
  product never re-matches the adjustment that produced it on the next
  rebuild (previously a reclassify to membership_fee would have duplicated
  the pair each rebuild). `loadBankTransactionsFromDb` now also streams
  MEMBER_BOOKS_ONLY_TYPES (membership_fee) so CSV-imported fee legs survive
  rebuilds; before this a single UI split/reclassify deleted every
  membership_fee leg on the account since the rebuild stream only carried
  LEDGER_TYPES. Verified on a scratch org via
  scripts/test-other-income-splits.js: Bakare 151,320 split
  (150,000 Entrance Fee + 1,320 other income), Oluwafemi 75,009.72 split
  (75,000 Annual Dues + 9.72), Oni 5,000 SIAML refund reclassified to share
  capital, two Sterling credits (19,726.17/19,726.49) reclassified to other
  income, Eyinade 37,500 reclassified to membership fee; member balances net
  to zero, otherIncome = 40,782.38 (matches workbook GL 4200 exactly), bank
  ledger projection intact. Deploy: git push only. Data note: the same
  corrections are applied to Downloads/ttfc-ledger-operations.csv for anyone
  re-running a Full Ledger Refresh from file, but the in-app
  split/reclassify path is the intended fix on the live org.

- **2026-11-24** - **Loans-off toggle now suppresses loan income lines.**
  Total Cooperative Income and Cooperative Net Income detail rows
  skipped Loan Interest Income only implicitly; they now check
  loan-feature-service.isLoansEnabled() (new shared isLoansEnabled()
  helper in cooperative-books.js, replacing the inline try/catch in
  getCooperativeBooks) and omit the row entirely when loans are
  disabled. loanInterestIncome and expectedLoanInterest in
  getCooperativeBooks are also gated so totals cannot be inflated by
  leftover loan ledger data in a loans-off Cooperative. Deploy:
  git push only.

- **2026-11-24** - **Income lines drill down to their detail views.**
  Rows in the Total Cooperative Income and Cooperative Net Income
  details now carry detailSlug (registration-income,
  loan-interest-income, cd-interest-income, expenses). Clicking a row
  opens that card's full detail via openBookDetail. Client renders
  rows with detailSlug as .detail-drill-row (pointer + hover, bound by
  bindBookDetailDrillRows) alongside the existing member-row pattern.
  Deploy: git push only.

- **2026-11-24** - **Configurable interest-income keywords.** New
  "Interest Income Keywords (Comma-Separated)" field in Organization &
  Report Settings on the Status Report page. Stored in
  cooperative_settings.interest_income_keywords; normalized to
  uppercase, deduped, and merged with DEFAULT_INTEREST_INCOME_KEYWORDS
  (INTEREST, CAPITALIS in constants.js). getInterestIncomeKeywords() in
  cooperative-books.js matches investment credits by case-insensitive
  substring on the narration (was a hardcoded LIKE on INTEREST/
  CAPITALIS). Settings payload field: interestIncomeKeywords (string or
  array); empty clears back to defaults. Settings response also returns
  interestIncomeKeywordsEffective, shown in the field hint. Deploy:
  git push only.

- **2026-11-24** - **Fixed/term deposit interest now counted in income.**
  getCdInterestBreakdown only tracked cd_purchase/cd_liquidation lots,
  so imported INTEREST CAPITALISED rows (typed investment) showed as
  zero. Investment credits whose narration contains INTEREST or
  CAPITALIS now count as realized interest income and appear in the
  interest-income detail as "Received" rows. Country-aware naming:
  depositInstrumentLabel() returns "Fixed Deposit" for NG and "CD" for
  US, applied to card labels, detail titles (via replaceAll on
  BOOK_DETAIL_SLUGS titles), income line items, and lot descriptions;
  US output unchanged. For Twilight the three FD interest credits
  total 98,816.25 and flow into Total Cooperative Income and Net
  Income. Deploy: git push only.

- **2026-11-24** - **Member Share Capital card detail added.** The card
  previously threw "Unknown book detail" when clicked (slug emitted by
  the UI but absent from BOOK_DETAIL_SLUGS). getBookDetail now serves a
  per-transaction view: date, member, Purchase/Redemption, amount
  (signed), narration, newest first; summary = net purchases minus
  redemptions. Deploy: git push only.

- **2026-11-24** - **Cooperative Investments detail: Account column
  fixed.** The Account column duplicated the bank narration because
  investment-account-service.js auto-created an investment account per
  distinct description (syncAccountsFromTransactions) and imported
  rows got linked to those narration-named accounts. Now: the detail
  card joins bank_accounts and shows the curated investment account
  when assigned, else the ledger bank account label (NULL
  bank_account_id resolves to the primary account). Sync skips
  source='bank_import' rows, and pruneAutoCreatedAccounts removes
  previously spawned narration accounts (no institution, no notes, all
  linked rows are imports whose description equals the name) while
  preserving curated accounts. Runs inside getBookDetail so the card
  self-heals on next view; also runs in the investment accounts/entries
  listers. Covered by scripts/test-investment-account-display.js.
  Deploy: git push only.

- **2026-11-24** - **Status report in-browser PDF preview.** New
  Preview Report button on the Status Report page opens the generated
  PDF in a new browser tab: it fetches GET
  /api/books/monthly-status-report/download?inline=1 through the
  authenticated fetch wrapper (a bare window.open loses the Bearer
  token and returns "Login required"), then opens the blob URL.
  The endpoint sends Content-Disposition: inline for ?inline=1.
  Complements Send Preview to Admin Only: the button checks the PDF
  itself, the email preview checks the outgoing announcement.
  Deploy: git push only.

- **2026-11-24** - **Monthly status report: admin preview before publish.**
  Administrators can now send the report announcement email to their own
  account first (Send Preview to Admin Only button, new
  POST /api/books/monthly-status-report/test-send endpoint, subject
  prefixed "Preview:") to verify rendering before members are notified.
  cooperative_status_reports gained preview_sent_at / preview_sent_to
  columns (guarded ALTERs in monthly-status-report-service.js and
  report-notification-service.js). Manual publish now refuses with
  code preview_not_sent until a preview is recorded for the current
  draft; the UI shows a warning confirmation and retries with
  confirmedNoPreview when the admin explicitly proceeds. Regenerating
  a report clears the preview stamp so a stale preview cannot authorize
  a changed report. Scheduled month-end auto-publish passes
  allowWithoutPreview and is unaffected. Panel status line shows
  "preview sent to …" or "preview not sent". Covered by
  scripts/test-report-preview-gate.js (5 cases, all passing).
  Deploy: git push only.

- **2026-11-23** - **Import dedupe hardened app-wide.** Re-uploading a
  statement (same or different format) can no longer create duplicates.
  lib/import-fingerprint.js now emits multiple candidate keys per row:
  description-prefix, category-stripped (stored expenses carry
  "Category: " prefixes), absolute-amount (reversal credits stored as
  negative expenses), reference-token (DOC-NUM etc.), and embedded
  5+ digit runs (bank doc numbers inside narrations).
  bank-import-append.js checks all variants plus a narration-similarity
  fallback (same date + same |amount| + token overlap >= 0.5) for
  banks that narrate identical postings differently across formats
  (e.g. COMMISSION vs STAMP DUTY, TRZL- vs TRZL- ). Legacy
  import-bank-ledger.js sync-missing dedupe got the same variant set.
  Verified: 243-row Providus statement applied, then XLSX re-upload
  170/170 skipped and PDF cross-format re-upload 170/170 skipped.
- **2026-11-23** - **Membership Applications card renamed** on the
  Import tab: "(WPForms CSV)" dropped from the title per Owner; card,
  form handler, and backend route retained (a prior over-broad removal
  was reverted). Member-import results line now shows Updated count
  with per-row filled-field detail.
- **2026-11-23** - **Member import: tolerant fields + district (LGA).**
  member-import-service now: treats NULL/N/A/- cells as blank; skips
  fully blank rows; maps Member ID No and Bank Account Name (->
  payment name); captures any unmapped populated column into
  members.notes as "Header: value" pairs (zeros dropped); and
  UPDATES existing members by filling blank profile/member fields
  instead of skipping (never overwrites; reported as `updated`).
  New member_profiles.district column (migration in
  applyProfileMigrations + schema.sql): "LGA" for NG, "County/District"
  for US via countryProfile.districtLabel; register + update-profile
  forms, address block, template header "District/LGA" all wired.
  Verified on TTFC Member Data -2.xlsx: 28 created, 1 updated,
  0 failed (trailing blank row tolerated).
- **2026-11-23** - **UI copy: spacing fixes.** App-wide correction of
  "word : word" to "word: word" and "word / word" to "word/word" in
  user-facing strings only (topbar subtitle, hints, buttons, timezone
  labels, subscription text, CSV generator headers, statement/email
  generators). Done with a string-literal-aware rewrite so code
  ternaries/division/regexes were untouched; all JS files pass
  node --check. ~48 strings across 14 files.
- **2026-11-23** - **Members & Accounts panel: normal page scroll.**
  Removed the fixed-viewport app frame (#appShell 100vh overflow:hidden,
  members-list-pane internal scroll) so the header, hint block, and
  search row scroll away with the page and the full member table is
  reachable with one page scroll - same behavior the <=900px breakpoint
  already had. member-detail-open hide rules and 1-column layout kept.
- **2026-11-23** - **Member profile: merged fee/deposit display pairs.**
  Contributions Account Activity (admin profile AND member portal My
  Contributions; Share Capital panel is a harmless no-op) now renders a
  membership_fee + deposit pair sharing the same date and absolute
  amount as ONE row: fee type label, deposit description, post-pair
  balance (max-id leg's balance_after, sort-order independent). Ledger
  data unchanged - both legs still exist; admin Category/Split controls
  attach to the deposit (bank) leg. Verified on live data pattern:
  Fagbenro 15/12/2025 100k entrance fee + 12/02/2026 150k annual dues
  each appear once. Standalone fee or deposit rows still render
  normally. `isFeeDepositPair` requires opposite signs and matching abs
  amounts. NOTE: the generated member statement PDF
  (member-deposit-statement.js) still lists both legs deliberately -
  merge there too if the Owner wants one-line presentation on formal
  statements.
- **2026-11-23** - **Maintenance tab cleanup:** removed the raw JSON
  "Live Database Status" card (diagnostic noise for nontechnical
  admins), its Refresh button, and `loadMaintenancePanel()` in app.js.
  The `/api/admin/data-status` endpoint stays on the server for
  diagnostics but is no longer rendered. Bank reconcile status remains
  visible in friendly form on the Cooperative Books card.
- **2026-11-23** - **Twilight ledger split prep (Providus reconciliation):**
  comparison of the real Providus current-account statement
  (STATEMENT (4).xlsx, period 24/11/2025-10/11/2026) against the imported
  TTFC workbook ledger showed the old ledger was a CONSOLIDATED funds
  view, not the current account: 38.3M share-capital inflows and 32
  member dues deposits (3.9M) never touched account 0215/0652442/001/0013/000,
  and TD placements (41.9M) exceeded this account's funding (16.8M).
  Owner chose per-account split. Generated in Downloads:
  ttfc-ledger-providus-current.csv (243 statement rows + 67 membership_fee
  mirrors; reference format for Full Ledger Refresh),
  ttfc-ledger-share-capital.csv (24 share purchases + 32 unbanked dues
  deposits + 2 transfers-in; template format for Import New Bank
  Activity), ttfc-ledger-time-deposits.csv (24 investment rows).
  Procedure: backup DB, create "Share Capital Account" + "Time Deposits"
  bank accounts, Full Ledger Refresh with the current CSV (WIPES all
  transactions - conflict check warns about manual rows), then append
  the other two CSVs under their accounts. Verified parse: 243 rows,
  52 members resolved, net = 1,977,905.38 closing balance.
- **2026-11-23** - **Providus Bank statement import (NGN Cooperatives):**
  new `lib/providus-statement.js` recognizes Providus Bank business
  statements in both XLSX and PDF. XLSX: detects the "PROVIDUS BANK"
  marker + Post Date/Narration header, parses Debit/Credit/Doc-Num and
  the summary block (opening/closing/totals). PDF: zero-dependency text
  extraction (inflate streams, Tm/Tj ops), column-anchored row assembly
  with truncation-tolerant keyword stems. Providus narration
  classification: stamp duty/VAT/commission/SMS/maintenance/legal ->
  expense; reversals -> positive expense; ADD A TIME DEPOSIT /
  PREMATURE SETTLE / own-account transfers -> investment (matches the
  Cooperative's Investment Placement convention); outward transfers ->
  expense; inward/account transfers -> deposit with sender-name member
  resolution (order-insensitive, matches IFIE CYNTHIA ONOME -> Cynthia
  Ifie Onome). Wired into import-format-service as resolvedFormat
  `providus_business`; non-Providus PDFs get a clear error; file input
  accepts .pdf. Verified: XLSX and PDF produce identical results - 243
  rows, 73 deposits / 157 expenses / 13 investments, 30 members
  resolved, net = NGN 1,977,905.38 = statement closing balance. PDF
  narrations wrap as multi-line cells (Tm+Tj continuation ops without
  Tf) - the extractor attributes each Tj to the latest Tm and groups
  continuation lines into the owning transaction by Post Date anchors,
  so full narrations including sender names survive. Dates parse via
  the org DMY setting.
- **2026-11-23** - **Security round 2: MFA + webhook closure + favicon:**
  TOTP two-factor authentication for admin/staff accounts - new
  `lib/totp.js` (RFC 6238, zero deps) and `lib/mfa-service.js`
  (enrollment secrets, 10-minute signed mfa tickets, replay-safe
  challenge verify); users table gains mfa_enabled/mfa_secret columns via
  auth migrations; `login()` returns `{ mfaRequired, mfaTicket }` for
  MFA-enabled users instead of a session; new routes POST /api/mfa/start,
  /api/mfa/confirm, /api/mfa/disable, GET /api/mfa/status, and public
  POST /api/auth/mfa-verify (own limiter, 20/10min); app.js login flow
  prompts for the code on mfaRequired; new Security tab
  (data-roles="admin,staff") hosts self-service enroll/disable; Users
  table gains a Two-Factor column with admin Reset button
  (`POST /api/users/:id/reset-mfa`). FlexxForms webhook: unsigned
  payloads now rejected outright even for orgs without a secret
  (previously warn-and-accept); `webhookSecured` boolean added to
  getFlexxFormsAdminView (secret value never leaves server). API flood
  damper: 600 req/min per IP across /api (auth limiters still stricter).
  Favicon set created (favicon.svg/.ico/-32/-512/apple-touch-icon from
  the theme.css gradient + glyph) and linked on all 6 public HTML pages.
  Verified: full e2e enroll/confirm/login/challenge/reject cycle passes;
  node --check clean on all touched files.
- **2026-11-23** - **Security hardening pass (audit-driven):**
  rate limiting on /api/auth/login, /api/platform/auth/login,
  /api/auth/register-organization, and /api/organizations/lookup via the
  new in-memory lib/rate-limit.js (app now sets trust proxy: 1);
  org lookup response trimmed to { slug, name, countryCode } (was
  leaking adminEmail, billingEmail, stripeCustomerId,
  checkPaymentReference); FlexxForms webhook now requires a valid fresh
  HMAC signature whenever the org has a webhookSecret (5-minute replay
  window enforced) and rejects signed payloads that match no secret;
  security headers middleware added (CSP script-src self + flexxforms,
  X-Frame-Options, nosniff, HSTS, Referrer-Policy, Permissions-Policy)
  with all inline scripts extracted to /boot.js, /brochure.js,
  /cooperative-public.js; ?access_token= session-token-in-URL support
  removed entirely (repayment-plan downloads now always fetch with the
  Authorization header); login timing side channel closed on both
  tenant and platform auth via dummy-hash scrypt on unknown users.
  Deploy via git push (Render auto-deploys).

- **2026-11-23** - **Platform admin: delete Cooperative:** new
  `DELETE /api/platform/organizations/:slug` (platform auth +
  type-the-code `confirmSlug` guard) backed by
  `organization-service.deleteOrganization` - removes the organizations
  row (sessions cascade), closes the cached org db handle (`closeDb`),
  and removes the org data dir recursively. UI: red **Delete** button per
  org row in the platform organizations table; prompts for the exact
  organization code before calling. Irreversible: wipes the org's
  ledger, members, imports, uploads, and reports.
- **2026-11-23** - **OG thumbnails on app + public pages:** `index.html`
  (serves /admin /member /register /staff /platform) had no OG tags, so
  WhatsApp/shared links showed only the title. Added the standard OG/Twitter
  block with `og-product.jpg`; `cooperative-public.html` (the `/c/*` public
  Cooperative pages) got `og:image` too. Link previews on every route now
  render the product thumbnail.
- **2026-11-21** - **Custom domain prep (peerfinancemanager.com):** all
  hardcoded `peer-finance-manager.netlify.app` references moved to
  `peerfinancemanager.com` - `lib/portal-urls.js` + `lib/platform-billing-service.js`
  fallbacks, `lib/automated-message-service.js` sample URLs, canonical/og
  tags and link text on the brochure/product pages, and
  `scripts/test-organization-code.js`. Env overrides still win
  (`ALLOWED_ORIGINS`, `MEMBER_PORTAL_URL`). To finish the cutover: add the
  domain in Netlify site settings, point Namecheap DNS at Netlify (A:
  75.2.60.5 for apex, CNAME `www` -> the netlify site, or delegate NS),
  then set Render `ALLOWED_ORIGINS`/`MEMBER_PORTAL_URL` to the new origin.
  The netlify.app URL keeps working in parallel - zero downtime. FlexxForms
  integration is unaffected (all its URLs are outbound to
  flexxforms.netlify.app; `hostApp` is a slug, not a URL).
- **2026-11-22** - **Uniform Cooperative Books card rhythm:** every book card
  now always renders a `.book-note` explainer (cards that lacked one -
  Registration Income, Cooperative Expenses, Distributions Paid, Active
  Members/Profiles - got notes; Registration Income's label/note are now
  fee-model-aware via `membershipFeeLabel()`, as is the Total Cooperative
  Income note). `.book-note` has a 2-line min-height so all cards share one
  rhythm (2-line title zone + amount + 2-line note zone).
- **2026-11-22** - **Annual dues controls spacing:** the Dues Year input and
  Refresh Dues Status button now share a `.dues-controls-row` flex row, the
  year input is 110px wide, `#annualDuesSection > * + *` adds 14px spacing
  between the section's inner blocks, and `#annualDuesTableWrap` gets a
  20px top margin plus a 10px gap under the dues summary line before the
  status table.
- **2026-11-22** - **"Enable Loan Accounts" toggle (Membership Policy):**
  new `lib/loan-feature-service.js` (`loans_enabled` setting, default ON for
  all existing Cooperatives). GET/PATCH membership-policy carries
  `loansEnabled`; `/api/members` returns it; `POST /api/loans` and
  `/api/loans/:id/repayments` call `assertLoansEnabled`. Frontend:
  `loansUiEnabled()` + `applyLoansUi()` toggles `body.loans-disabled`, and
  `.loans-col` marks the Loans nav tab, member-table Loan column, profile
  loan card/panel, record loan forms + nav links, member-portal loan
  panels (Loan Outstanding, Loan Terms, Apply for a Loan), and
  loan-terms cards; dashboard/books loan cards (loans outstanding,
  loan interest income, expected loan interest, repayments due) and the
  reclassify dropdown loan types are gated. Status report drops the
  Loans to Members row, loan unearned income, loan interest income, and
  the performance-overview loan sentence when off. Toggling does not
  touch ledger data; everything reappears when re-enabled.
- **2026-11-22** - **Fee-model-aware "membership_fee" labels:** `membership_fee`
  ledger entries were always labeled "Registration Fee" even for annual-model
  Cooperatives. New `membershipFeeLabel()` returns "Annual Membership Fee" for
  annual-model orgs and drives `formatTxType`, the reclassify/split dropdown
  option, the record-fee card summary + nav link + hint, the profile "Fee Paid"
  field, the Contributions card subtitle, and the books card note. `/api/members`
  now also returns `feeModel` so non-admin/member views label correctly
  (`feeModelFromMembers` fallback in `isAnnualFeeModel`).
- **2026-11-22** - **Investment accounts feature + Members split view:**
  - New `lib/investment-account-service.js`: per-tenant
    `investment_accounts` table (name, institution, notes, active
    window), `transactions.investment_account_id` column, and a
    `syncAccountsFromTransactions` that auto-creates one account per
    distinct imported investment description (empty description ->
    "Unclassified Investments") and backfills row links. Runs at
    `openOrgDatabase` so every tenant migrates on next open.
    CRUD + `assignInvestmentEntries` + `recordInvestment` (placement
    = negative, return/income = positive, queues ledger CSV sync).
    Renaming an account updates matching ledger descriptions; accounts
    with entries cannot be deleted (reassign or set Active To).
  - Routes: `GET/POST /api/investment-accounts`,
    `PATCH/DELETE /api/investment-accounts/:id`,
    `POST /api/investment-accounts/assign`, `POST /api/investments`
    (all requireAdmin).
  - `cooperative-books.js`: investments card note now lists account
    names (up to 4, else "N Investment Accounts"), detail table gains
    an Account column. Both fall back to raw descriptions if the
    table is missing.
  - Record tab: new "Cooperative Investment" card (account picker or
    inline new account, placement/return direction, amount, date) and
    "Investment Accounts" card (rename/delete/add accounts, plus a
    Reclassify Ledger Entries table with per-row account dropdowns).
  - Members & Accounts is now a list/detail split: the member table
    fills the panel; clicking a row (or an account cell) swaps to the
    full-width profile detail with a "Back to Member List" bar. The
    list no longer auto-opens a profile on load, and post-save
    refreshes use `refreshProfileIfOpen` so record actions no longer
    yank the admin into a member detail view.
- **2026-11-22** - **Cooperative Investments card note de-hardcoded:**
  the card subtitle was hardcoded to "Caribe Restaurant and Lounge"
  (Assurance's specific investment) for every tenant. `cooperative-books.js`
  now returns `investmentNote` built from the org's distinct investment
  transaction descriptions (joined when <=2, else "N Investment Types"),
  and `app.js` falls back to "Cooperative Investment Accounts". The
  ledger-CSV `TYPE_TO_NARRATIVE` investment narrative is now generic
  "Investment" (row descriptions still carry real text), and
  `TYPE_MAP` gained `Investment -> investment` so generic narratives
  re-import. Same fixes applied to the legacy root `lib/`+`public/` copy.
- **2026-11-22** - **Record-tab index/cards aligned:** the left
  `record-index` labels drifted out of line with their cards because
  `membershipPolicyPanel` lacked the `record-section` class (kept
  `.card` 24px padding and `margin-top:16px`, making it taller and
  offset) and nav links used a 36px/6px rhythm vs the cards' ~58px/12px.
  The panel now carries `record-section`/`record-section-summary`, and
  record-index links use `height:58px` flex-centered with `gap:12px` so
  each label sits beside its card.
- **2026-11-22** - **Policy save message copy clarified:** "Applies to new
  activity only" read as if past transactions were ignored; replaced with
  "New amounts apply to fees recorded from now on; existing ledger
  entries are unchanged." Historical payments still count toward dues
  status and reports.
- **2026-11-22** - **Dues mirror row fixes:** the auto-added current-year
  row under Amount by Year showed `0` because
  `currentDuesYearRequirement` read the raw stored setting (unset -> 0)
  while the Annual Membership Fee field shows the resolved default
  (NGN 50,000). `duesRequirementForYear` is now called with the resolved
  `policy.annualDuesAmount` so the row prefills consistently. The row is
  also a live mirror: typing in Annual Membership Fee Amount updates it
  until the admin edits the row directly (turning it into a real
  override). Confirmed deployed commit via `/api/health` `build.commit`.
- **2026-11-22** - **Membership policy save failures diagnosed + made
  loud:** the persistence complaint root cause was most likely the PATCH
  400ing on validation, not the 402 subscription gate (Twilight's
  subscription is ACTIVE). Pre-52eb805 builds threw
  `requirePositiveAmount` on `initialContribution: 0` (and the oldest
  build ignored feeModel/dues fields entirely while returning
  `{success:true}`), so every save failed with only a small red status
  line. Fixes shipped: `membershipFee`/`initialContribution` now accept
  0 (a Cooperative may charge no one-time fee; `initialContribution` 0
  was already allowed), the saveMembershipPolicy catch now pops a
  danger-variant appAlert naming the failure, and `/api/health` returns
  `build.commit` from `RENDER_GIT_COMMIT` so the deployed version can be
  verified against the repo. A global `window.fetch` interceptor also
  still pops "Subscription Required" on any 402 response.
- **2026-11-22** - **Subscription-blocked writes now surface loudly:** the
  Membership Policy "not persisting" report traced to
  `requireActiveSubscription` (`platform-routes.js`), which returns 402
  `{error, subscriptionStatus}` on every non-GET `/api` call when the
  Cooperative's subscription is inactive and past grace. GETs pass, so
  panels load normally and failed saves showed only a small red status
  line. A global `window.fetch` interceptor in `app.js` now pops an
  appAlert "Subscription Required" whenever a 402 subscription response
  arrives, covering every write path. If Twilight writes revert on
  refresh, check the Subscription tab/platform console for its status.
- **2026-11-22** - **Dues panel clarity/spacing pass:** policy GET now also
  returns `currentDuesYear` + `currentDuesYearRequirement`; the current
  year's Amount by Year row is prefilled with the resolved amount and
  captioned "Mirrors the annual amount; saving pins it for this year" so
  the base field (labeled Required) vs per-year overrides (Optional) is
  unambiguous, and saving always pins the current year explicitly. The
  schedule block got a bordered panel, row/action spacing, and history
  layout styles.
- **2026-11-22** - **Dues schedule becomes auditable per-year rows:** the
  freeform "Amount by Year" text field is now an editable year/amount row
  list with an Add Year button, per-row "Set DD/MM/YYYY by &lt;admin&gt;"
  stamps, and a **Fee Change History** block. Backend stores schedule
  entries as `{year, amount, setAt, setBy}` and appends every amount change
  to `annual_dues_change_log` (`{at, by, scope: year|"default", from, to}`,
  capped at 200). Mid-year votes edit the current year's row; unchanged
  years keep their original stamps. `setMembershipPolicy` accepts
  `changedBy` (route passes `req.user` display name/username/email). Policy
  GET returns `annualDuesHistory` newest-first.
- **2026-11-22** - **Membership Policy usability pass:** amount fields are
  text inputs that group thousands live while typing (`150000` -> `150,000`,
  caret preserved via `attachGroupedAmountInput`/`groupAmountDigits`/
  `parseGroupedAmount` in app.js) with a currency preview (`= ₦150,000`);
  the Amount by Year parser accepts commas inside amounts
  (`2026:150,000, 2027:175,000`); the per-year dues
  field is retitled "Amount by Year (Optional)" with a per-line hint
  explaining it vs the current annual amount, and Initial Contribution is
  explicitly optional: `0` or empty means no minimum first deposit
  (`requireNonNegativeAmount`, Verify Deposits skips the zero deposit and
  the not-on-books hint omits it). Stored `0` resolves correctly instead of
  falling back to the country default (`normalizeAmountAllowZero`).
- **2026-11-22** - **Membership fee models: one-time vs annual dues.** New
  `feeModel` policy (default `one_time`, unchanged for Assurance/US) plus
  `annual` model for Cooperatives like Twilight that charge a yearly
  membership fee instead of a registration fee. `membership-policy-service`
  now resolves `feeModel`, `annualDuesAmount`, a per-year
  `annualDuesSchedule` (`[{year, amount}]`, inheritance: exact year, else
  latest earlier year, else current amount) and reminder settings.
  `annual-dues-service` computes per-active-member paid/required/outstanding
  from `membership_fee` transactions in the calendar year; amount edits never
  rewrite recorded transactions (historical immutability).
  `recordMembershipFee` is model-aware: one-time keeps the single-fee rule,
  annual allows repeated instalment payments (description "Annual membership
  fee payment for YYYY") and flips `membership_fee_paid` only once the year's
  requirement is covered. First-deposit fee split and FlexxForms fee
  readiness are bypassed in annual mode. `annual-dues-reminder-service`
  emails outstanding members via a per-org scheduler (6h cadence, gated by
  daily/weekly/monthly frequency + last-sent stamp), auditable in Email
  Notices. Routes: `GET /api/cooperative/annual-dues?year=`,
  `POST .../annual-dues/send-reminders` (manual on-demand send).
  Membership Policy panel gained a model selector, annual amount + optional
  yearly schedule (`2026:150000, 2027:175000`), a per-year dues status table
  (Paid/Partial/Unpaid, outstanding total), reminder toggle + frequency, and
  a "Send Reminders Now" action. Test `test-annual-dues.js` covers schedule
  inheritance, instalments, status transitions, reminder gating, historical
  immutability, and one-time coexistence.
- **2026-11-22** - **Receipt emails split by transaction type:** the old
  combined "Deposit/Loan Repayment Received" notice is now three templates
  under Automated Messages: Member Deposit Received (id
  `deposit_credit_alert`, existing overrides preserved), Loan Repayment
  Received, and Share Capital Received. `deposit-credit-alert` groups
  imported rows per member **and** per transaction type, so a member who
  paid both in one import gets two separate emails, never a combined one.
  `share_capital` rows joined the credit-alert types and the bank-import
  deposit query; emails/portal notices inherit the Share Capital template.
  `email-audit-service` label map updated. Manual Record-tab entries still
  do not email (unchanged, consistent with deposits).
- **2026-11-21** - **TTFC workbook ledger converted for import:** sheet
  "09 Bank Ledger" (383 rows, 4 Providus accounts) transformed into
  `cooperative-bank-ledger-reference.csv` format (429 rows) at
  `C:\Users\ydara\Downloads\ttfc-cooperative-bank-ledger-reference.csv`.
  Mapping: Savings -> `deposit`; Entrance Fee / Annual Dues / the two
  treasurer-approved split rows -> paired `deposit` + `membership_fee`
  (fee leg negative, kept out of the bank balance per ledger convention);
  Share Capital / SC-credit-wrong-account / Diran Oni ₦5,000 ->
  `share_capital`; bank fees, salaries, regulatory, PAYE, WHT, refunds ->
  `expense`; UBA/StanChart/FSDH placements + FD capitalized interest +
  the two Sterling "Other Cooperative Income" credits -> `investment`.
  All 21 internal own-account transfer legs (ops<->FD, ops<->share,
  ops<->savings) excluded as they net to zero in the consolidated book.
  Member names emitted from the Linked Member No. -> app member-name map.
  Import via Admin -> Import -> Full Ledger Refresh. Not committed to git
  (member PII in the one-off script, kept at
  `C:\Users\ydara\Downloads\ttfc-workbook-to-ledger.js`).

- **2026-11-21** - **NG subscription bank-transfer details, editable by platform admin:**
New `platform_settings` key/value table in the registry DB.
`getNgBankTransferDetails()` resolves stored `ng_bank_transfer_details` ->
`PLATFORM_NG_BANK_TRANSFER_DETAILS` env -> built-in default (currently
GTBank / Awoyinka Daramola / 0001713399). `getTenantSubscription` serves it as
`bankTransferDetails` to NG tenants on the Subscription tab.
`POST /api/platform/ng-bank-transfer-details` (platform auth) saves a new value
via `setNgBankTransferDetails`; `GET /api/platform/organizations` now includes
`ngBankTransferDetails`. Platform console has a "Nigerian Bank Transfer
Details" card (textarea + Save) that applies to all NG tenants immediately.
The "Record Check Payment" card was retitled "Record Offline Payment
(Check/Bank Transfer)" with generic labels since it confirms NG bank transfers
too (payment method auto-records as `bank_transfer` by org country).

- **2026-11-21** - **Hint readability:** new `.hint-line` block style puts each
  sentence of a long hint on its own line with 8px spacing. Applied to the
  Members & Profiles, Record tab, and Membership Policy hints.

- **2026-11-21** - **Header overlap fix:** `.topbar` gained `flex-shrink: 0`.
  On the Members & Accounts screen (the `100vh`/`overflow:hidden` internal-scroll
  layout), the header was flex-shrinking below its content height so the
  full-width subtitle row overlapped the Members & Profiles heading and its
  action buttons. The header now always reserves its natural height.

- **2026-11-21** - **Header session bar + subscription panel spacing pass:**
Session bar now reads "Administrator: Full Name" as one line (plain role label,
bold name) instead of an isolated role pill. The org subtitle
(`#appOrgSubtitle`, `#platformSubtitle`) moved out of `.topbar-titles` to a
full-width `.topbar-subtitle` flex row under the header, so it no longer wraps
mid-phrase against the session bar. `.topbar` gained `flex-wrap`/`row-gap`.
Mobile truncation now clips only `.session-user-name` (140px ellipsis), not the
role label. Subscription tab rhythm: `.platform-subscription-body` and
`.platform-subscription-summary` are flex columns with real gaps;
`.platform-check-instructions` (transfer/check instructions box) is a flex
column so injected paragraphs and the Notify Transfer Sent button no longer
collapse together; action-button rows bumped 8px to 10px.

- **2026-11-21** - **Country-aware platform billing + header session layout:**
Billing is now driven by the Cooperative's `country_code` (set at registration).
`platform-billing-constants.pricingSummary(countryCode)` returns a rail-aware
shape: US stays USD/Stripe ($29.99 / $89.07 / $345.48); NG gets naira pricing
matching `/productngn` (₦40,343 monthly, ₦119,818 quarterly, ₦464,744 annual)
with `paymentRail: "bank_transfer"`. `getTenantSubscription` now returns
`countryCode`, `paymentRail`, and `bankTransferDetails` (env
`PLATFORM_NG_BANK_TRANSFER_DETAILS`, fallback "contact platform administrator").
`createStripeCheckoutSession` hard-blocks non-Stripe-rail orgs server-side.
`requestCheckPayment` accepts `plan` and stamps `bank-transfer:<plan>:<iso>`
references for NG orgs; `recordCheckPayment` auto-records
`paymentMethod: bank_transfer` for NG orgs (platform admin flow unchanged).
Subscription tab UI: naira-priced plan buttons open bank-transfer instructions
with a "Notify Transfer Sent" action; "Manage Card on File" hidden on the
transfer rail; "Request Check Payment" relabels to "Bank Transfer Instructions";
`check_pending` displays as "Payment Pending"; payment method shows a friendly
label. Platform-admin check-payment plan dropdown now shows plan names only
(prices differ by country). NG product/brochure copy updated to bank transfer.
New `scripts/test-billing-country.js` (all passing). Paystack or other local
NG card processors can plug in behind the `paymentRail` abstraction later.
Header: `.topbar` alignment fixed so the session bar no longer drops to the
subtitle line; `.session-user` no longer truncates the signed-in name at 40ch.
Member profile account cards reordered: Share Capital now sits between
Contributions and Loan Account (matching the members table column order).

- **2026-11-21** - **Member Share Capital accounts (admin-toggleable):**
New optional member account type for Cooperatives that issue shares (Nigeria).
New transaction types `share_capital` (purchase, +) and `share_capital_redemption` (-).
New `lib/share-capital-service.js`: `share_capital_enabled` cooperative setting
(off by default, so existing Cooperatives are untouched), per-member and org-total
balances, running balances, and `recordMemberShareCapitalEntry` (purchase requires
active member; redemption allowed for former-member settlement, mirroring
withdrawal rules). Toggle lives in Record -> Membership Policy ("Enable Share
Capital Accounts") and rides the existing GET/PATCH
`/api/cooperative/membership-policy` as `shareCapitalEnabled`.
POST `/api/transactions/member-share-capital` records manual entries.
When enabled: member profile gets a third account card (indigo) with full
history + running balance; Members & Accounts table gains a Share Capital
column (`share-capital-col` class hidden via `body.share-capital-enabled`);
member portal gets a Share Capital panel (data via `/api/me/account`);
Record tab gets a Member Share Capital Account form; Cooperative Books gets a
Member Share Capital (Total) card; statement/ledger imports classify and post
`share_capital`/`share_capital_redemption` rows (keyword rules:
"share capital", "share cap", "share subscription", "share purchase" via new
`shareCapitalKeywords` in import rules; Type labels in preview override,
reclassify dropdown, and payment-alias default types). Member profile payload
includes `share_capital_enabled`, `share_capital_balance`,
`share_capital_transactions`; `/api/members` returns `shareCapitalEnabled`.
Tests: `scripts/test-share-capital.js` (toggle, entries, balances, profile,
keyword classify, ledger import, disabled state); membership-policy test
updated for new field. **Production:** enable per Cooperative in Record ->
Membership Policy.
- **2026-11-21** - **Bank account delete (empty/unused accounts only):**
New `DELETE /api/bank-accounts/:id` + `deleteBankAccount()` in bank-account-service:
removes the account only when zero transactions reference its `bank_account_id`;
otherwise it errors and tells the admin to set Active To. Deleting the primary account
auto-promotes the first remaining account. UI: red **Delete Selected Account** button in
Import -> Bank Accounts and Import Settings -> Edit Selected Account with appConfirm.
Use case: Twilight Funds can remove the seeded "Main Operating Account" placeholder once
its real BA001-BA005 accounts are registered. Tests cover delete, linked-block, and
primary promotion in . **Production:** .
- **2026-11-21** - **App-wide density reduction (layout spacing pass):**
User feedback that the app looks cramped/clunky. Global rhythm opened up:
.card padding 20->24px and margin-bottom 16->20px; .card form gap 10->12px;
.profile-disclosure margin-top 12->16px; import panel summary padding 14/16->16/18;
import subsection margin-top 10->14px and summary padding 10/12->13/14;
profile-disclosure-body padding -> 0 16px 16px (subsection 0 14px 14px);
panel sibling gap 14->16px; .field-row gap -> 12/16px; .entry-form gap -> 14px;
label inner gap 4->6px; hint font 12->12.5px and line-height 1.45->1.55.
Pure CSS; no markup/JS changes. **Production:** . Hard-refresh app.
- **2026-11-21** - **Bulk Distribution upload joins dropzone pattern (Import tab sweep complete):**
Record -> Bulk Distribution (Excel) file picker converted to `.file-dropzone` with
`bindChosenFileName`. Every raw file input is now converted except Messages attachments,
which keep their own designed multi-file field (title, hint, selected-file list).
**Production:** .
- **2026-11-21** - **Import tab file pickers converted to dropzone pattern; spacing opened up:**
All raw browser file inputs on the Import tab replaced with the styled `.file-dropzone`
(dashed upload area, Choose File button, filename display) already used by bank statement
uploads: Bank Account Import, Cooperative Spreadsheet, Member Import, WPForms Profiles,
Loan Repayment Schedule. Submit buttons sit in a `.field-row` beside the dropzone.
`bindChosenFileName` wired for all five. Vertical rhythm increased: `.profile-disclosure-body`
sibling gap 10px -> 14px, `.entry-form` gap 10px -> 12px. Fixes the cramped look flagged
on the Bank Account Import Template section. **Production:** . Hard-refresh Import.
- **2026-11-21** - **App-wide spacing fix for crammed rows and disclosure bodies:**
 was used in ~20 places (import panels, bank account settings, members toolbar,
loan policy, record forms) but had no global rule, so buttons, file inputs, and controls
rendered flush against each other and neighbors. New global  (flex, wrap,
gap 10px/14px, align center, plus  guard) and 
(10px sibling rhythm) give every disclosure panel consistent vertical spacing. Checkbox/label
pairs and toolbar rows keep their specific layouts (, ,
 unaffected by specificity). Hard-refresh app after deploy.
**Production:** .
- **2026-11-21** - **US bank catalog expanded to parity with Nigeria:**
US_BANKS in `lib/country-catalog.js` grew from 5 to 60+ entries (national banks,
regionals, credit unions, digital/fintech banks) with aliases. The Bank Account Import
Template's Banks sheet, the Institution suggest-picker, and the import canonicalizer
all read `getCountryCatalog(profile.code)`, so US Cooperatives now get a real US bank
list and alias resolution ("boa" -> "Bank of America") identical to the NG pathway.
Test: `test-bank-account-import.js` covers a US org template + alias resolution.
**Production:** `git push`.
- **2026-11-21** - **Bank Account Import Template pipeline + Account ID/Account No fields:**
bank_accounts gains `account_code` (Cooperative's own ID, e.g. BA001) and `account_number`
(bank-issued number); columns added via ensureBankAccountSchema ALTERs, surfaced on the
Add/Edit Bank Account forms and the Registered Bank Accounts table (new Account No column).
New subsection **Import -> Bank Accounts and Import Settings -> Bank Account Import Template**:
download CSV/xlsx (`GET /api/bank-account-import/template.csv|xlsx`), fill one row per account
(only Account Label required), upload (`POST /api/bank-account-import`). Template xlsx includes
a **Banks sheet** listing the org's country catalog (45+ CBN banks for NG) with aliases;
import canonicalizes institution names via the catalog ("gtbank" -> "Guaranty Trust Bank (GTBank)",
"Providus" -> "Providus Bank") so users never type full names. Dedupe on label+institution,
Account ID, or Account No; idempotent re-uploads. Currency defaults to org currency; Primary
Yes/No honored. Filled Twilight Funds file saved at Downloads/pfm-bank-account-import-template.csv
(BA001-BA005, Providus+GTBank). Tests: `scripts/test-bank-account-import.js` all pass.
**Production:** `git push`. Hard-refresh Import.
- **2026-11-21** - **Auto-assigned member numbers now continue the Cooperative's own scheme:**
`ensureMemberNumber`/`backfillMemberNumbers` (member-number-service) infer the numbering pattern
from existing members: the dominant `letters[+sep]+digits` group wins, next = max+1 preserving
separator and digit width. Twilight Funds import `TTFC25001..TTFC25050` -> next member gets
`TTFC25051`, not `THE-001`. Pure numeric schemes supported. Explicit `member_number_prefix`
setting still overrides; empty orgs fall back to slug-derived `PREFIX-001`. Assurance `AIC-`
behavior unchanged. Test: `test-member-import.js` asserts TTFC25051 continuation.
**Production:** `git push`.
- **2026-11-21** - **Member Import Template gains optional `Member No` column:**
Cooperatives migrating existing members can keep their own numbering (e.g. Twilight Funds
`TTFC25001` style, no hyphen). `Member No` is the first template column; aliases include
membernumber/memberid/membershipno. Supplied numbers are stored verbatim on `members.member_number`
(`createMember` accepts `payload.memberNumber`, rejects collisions); blank cells still get an
auto-assigned `PREFIX-###` number via `ensureMemberNumber`. Rows whose Member No already exists
are skipped like name duplicates. Tests updated in `scripts/test-member-import.js`.
**Production:** `git push`. Hard-refresh Import before downloading a fresh template.
- **2026-11-21** - **Member Import Template pipeline (bulk-create member accounts for existing Cooperatives):**
New org onboarding tool on **Import -> Member Import Template**.
Admin downloads a CSV/xlsx template (`GET /api/member-import/template.csv|xlsx`),
fills one row per member, uploads it (`POST /api/member-import`, admin + restoreOrgContext),
and PFM creates member accounts plus profiles via existing `createMember`.
**Only First Name and Last Name are required**; optional columns: Middle Name, Gender, Date of Birth,
Email, Phone, Address, City, State, Postal Code, Country, Next of Kin (name/phone/relationship),
Joined Date, Membership Fee Paid (flag only, no transaction), Opening Deposit (records a deposit
transaction dated Joined Date or today), Notes. Member numbers auto-assigned via `ensureMemberNumber`.
Rows whose name already exists are skipped, never duplicated; invalid rows reported per-row, not fatal.
**No membership-fee transaction is recorded on import** (`createMember` with `recordMembershipFee: false`)
since these are pre-existing members. Country-aware: preferred payment method defaults to
`Bank Transfer` for NG, `Zelle` for US; dates parse per co-op date format (DD/MM/YYYY for NG);
amounts are plain numbers in org currency; no ZIP required. New `lib/member-import-service.js`
(header alias map tolerates variants like Surname/DOB/Mobile). Tests: `scripts/test-member-import.js`
(template build, NG+US import, missing-name rejection, duplicate skip, re-import idempotency,
no fee tx, opening deposit tx, CSV upload) all pass. **Production:** `git push`. Hard-refresh Import.
- **2026-11-18** — **Nigeria pathway hardening: NGN leaks fixed, admin-set membership fee/contribution, organization welcome email, platform FlexxForms controls:** (1) **Login now returns the Cooperative's real country profile** - `/api/auth/login` previously always returned the US profile because profile lookup ran outside org context; NG admins/members now get NGN/`en-NG`/Lagos/DD-MM-YYYY on sign-in. (2) **`/register?country=NG` preselects Nigeria** and `/productngn` + `/brochurengn` register links carry it; the form still defaults to United States otherwise. (3) **Membership fee and initial contribution are per-Cooperative settings, no longer hardcoded $100/$100** - new `lib/membership-policy-service.js` resolves stored setting -> country profile `membershipDefaults` (US 100/100, NG 50,000/50,000 NGN pending client confirmation) -> legacy constants. Wired into `member-service`, `flexxforms-membership-service` (readiness, verify deposits, correction sweep), `import-spreadsheet` (description shows actual amount), `membership-application-notify` fallback, and `/api/config`. Admin UI: **Manual Record -> Membership Policy** card (admin-only) with GET/PATCH `/api/cooperative/membership-policy`. Record Registration Fee label, fee form default, and FlexxForms application cards now use `fmt`/policy amounts. Existing Cooperatives with no stored setting keep $100/$100 (Assurance unchanged). (4) **Organization administrator welcome email** - new `organization_admin_welcome` automated message (editable on Automated Messages) sent to the admin on `POST /api/auth/register-organization` and recorded in Email Notices audit (`organization_admin_welcome` trigger); register response includes `welcomeEmail` status and the UI confirms it. Platform Admin resend: `POST /api/platform/organizations/:slug/resend-welcome-email`. (5) **Platform FlexxForms management** - `GET /api/platform/organizations/:slug/flexxforms` (status view, no secrets) and `POST .../flexxforms/retry` (re-run `workspaces/ensure`; idempotent) for support without co-op credentials. Plan B per-Cooperative workspaces were already the architecture; these endpoints verify/fix provisioning (e.g. Twilight Funds NG). Tests: `npm run test:membership-policy` (new), `test:country-profile`, `test:membership-applications`, `test:automated-messages`, `test:organization-code`, `test:loan-policy`, `test:deposit-credit-alerts` all pass. **Production:** `git push` (Netlify UI + Render API). Hard-refresh Register, Record, Forms & Documents. No data upload; existing fee/contribution rows untouched.
- **2026-11-19** — **Platform member-directory diagnostic endpoint:** `GET /api/platform/organizations/:slug/member-directory` (platform admin) returns every member row with name, member number, hasProfile, accountStatus, statusLabel, activeDirectory, former flags plus counts {total, active, withProfile, missingProfile, former}. No emails/phones/balances exposed. Used to answer which Assurance member lacks a profile without org-admin credentials. **Production:** `git push`.
- **2026-11-19** — **Nigeria displays the naira symbol (₦), never NGN:** Country profiles gained `currencySymbol`; NG = ₦, US unset (stays Intl USD). `lib/money-format.js` and client `moneyFormatterFor` (app.js) render `symbol + grouped number` when a profile defines `currencySymbol`, so every amount in UI, emails, notices, PDFs, and statements shows ₦50,000.00 regardless of browser/ICU. `publicCountryProfile` exposes `currencySymbol`; welcome-email `{{currency}}` token renders ₦ for NG orgs (sample updated); register hint and USER-GUIDE copy updated. Currency *code* fields (bank account currency = NGN) unchanged. Tests: `test:country-profile` pass; node --check on touched files clean. **Production:** `git push`. Hard-refresh for the new app.js.
- **2026-11-19** — **FlexxForms per-Cooperative starter cloning live; Twilight Funds workspace populated:** Root cause of empty form ids: FlexxForms clones starter templates only when `HOST_APP_PEER_FINANCE_MANAGER_STARTER_TENANT_ID` (or `FLEXXFORMS_STARTER_TENANT_ID`) is set on the FlexxForms/Netlify env, and it was unset. Fix: (a) set `provisioningRole` in Assurance tenant form/document settings (membership, loan_application, guarantor, borrower, guarantor_info) so `inferProvisioningRole` resolves roles on clones; (b) set the env var to Assurance tenant `5cb4bbf8-5cdf-46ee-9369-b9f7ef759334` on Netlify production; (c) redeployed FlexxForms (build:netlify + deploy --prod --no-build); (d) `POST /api/platform/organizations/<slug>/flexxforms/retry` for Twilight Funds cloned 2 forms + 3 docs into its own tenant and stored ids. Verified: twilight membershipFormId 0514db29, loanFormId 4eac3ca6, guarantorMasterDocId be4882f7, borrowerMasterDocId 9166a0fe; public config + embed urls live; webhook url injected per clone; Assurance ids unchanged (8d5e2b33/e180588a). Every future Cooperative signup now auto-gets cloned co-op forms/docs. Doc roles chosen semantically: Personal Loan Guaranty Agreement = guarantor master, Personal Loan Agreement = borrower master, Guarantor (short doc, no signers) = guarantor_info. If Assurance admin used different masters, adjust via Manage Forms & Documents. Also sent organization admin welcome email to kfagbenro@outlook.com via platform resend (send confirmed, inbox receipt not verified).
- **2026-10-31** — **Append opening anchor is beginning + skipped rows (fix false block):** **Import New Bank Activity** no longer blocks when an already-imported mid-period debit (check, loan disbursement) pulls the ledger balance below the statement's period-opening balance. The ledger-short check now compares the live ledger to the **expected position at the append point** (statement beginning plus the net of Skipped rows) instead of the raw beginning. Assurance case: October stmt beginning $22,286.80, ledger $21,880.61 through Check 1196 (-$2,250 on 10/20): 22,286.80 + skipped net -$406.19 = 21,880.61 exactly, so no block; ending still ties. Genuine missing history still blocks (ledger below anchor). Server + client `computeAppendBalanceCheck` mirror updated; preview shows "Expected ledger position" when it differs from beginning. Tests: `npm run test:bank-append`. **Production:** `git push` (Netlify UI + Render API). Hard-refresh **Import**. No data upload.
- **2026-10-31** — **Skipped preview rows show the stored ledger type, not the parser guess:** Import preview Skipped rows previously displayed the *inferred* Type from the bank description, which made correctly-stored rows look misclassified (Assurance Check 1196 showed "Expenses" while stored as Loan Disbursement). The preview now resolves each skipped row's stored type via fingerprint/legacy key maps and shows it; member display was already stored-sourced. Tests: `npm run test:bank-append`. **Production:** `git push`. No data upload.
- **2026-10-31** — **Approved-loan disbursement links survive ledger rebuilds:** `importBankLedgerCore` (Full Ledger Refresh and split/reclassify rebuilds) now calls `relinkApprovedLoanDisbursements`, which re-points each approved loan application's `disbursement_tx_id` at the disbursement transaction matching the member and principal when the stored id no longer resolves (rebuilds delete and reinsert every bank row). Needed for Check 1196 (Assurance, -$2,250 on 2026-10-20): it funds Yinka Daramola's approved $2,250 application #3 but was imported as **Expense**; the reclassify path (POST `/api/ledger-adjustments/reclassify` → `loan_disbursement` + member) rebuilds the ledger, and this relink keeps the application attached to the new transaction row. Tests: `npm run test:loan-applications`. **Production:** `git push` (Render API). No data upload. **Gap:** no UI surface reclassifies member-less bank rows (expense/CD/investment); Category/Split controls only render on member profile tables filtered to deposit/loan types. Fix member-less rows via the reclassify API until a surface exists.
- **2026-10-21** — **One-tap repayment-plan save to the device:** **Download Repayment Plan (PDF)** and **Download Repayment Plan (Excel)** are real download links (not a background fetch that phones drop). One tap saves the file. GET attachment routes accept the signed-in session as `access_token` so the browser can download without a scripted blob click. **Production:** `c3cf0ec` (`git push`; Netlify UI + Render API). Hard-refresh **Messages** and **My Account**. No data upload.
- **2026-10-21** — **Inbox disbursement notice shows repayment-plan downloads:** The member portal inbox "Your Loan Was Disbursed" conversation now replaces the email wall of text with the repayment plan and **Download Repayment Plan (PDF)** / **Download Repayment Plan (Excel)** on that notice. If the FlexxForms application is missing, the open loan on **My Account** still supplies the same buttons. Labels on **My Account → Loan Accounts** use the same wording. **Production:** `6b0236d` (`git push`; Netlify UI + Render API). Hard-refresh **Messages** and **My Account**. No data upload.
- **2026-10-21** — **Loan disbursed notice, 30-day first repayment, repayment-plan downloads:** After **Import New Bank Activity** records the matching **Loan Disbursement**, the member gets email + portal inbox copy naming the disbursement date and first due date (`loan_disbursed` on **Automated Messages**). The schedule realigns to that bank date: first repayment is 30 days later, then monthly on that day. Due notices follow the schedule dates (they no longer fall back to the disbursement calendar day when a schedule exists). Administrators and members download the plan as **Download PDF** or **Download Excel** from **Forms & Documents → Loan Applications**, **Loan Terms to Review** / the inbox notice, and each open loan on **Loan Account** (member profile and **My Account**). The activity **Statement** PDF is unchanged. Tests: `npm run test:loan-applications`, `npm run test:loan-due-notice`, `npm run test:automated-messages`. **Production:** `3fddd9d` (`git push`; Netlify UI + Render API). Hard-refresh **Forms & Documents**, **Messages**, **Loans**, and **My Account**. No data upload.
- **2026-10-21** — **Approved loan opens after the bank outflow:** Admin **Approve Loan** now notifies the member (email + inbox) and does not pretend the loan is live. The member loan account and **Loans** portfolio stay empty until **Import New Bank Activity** records an outflow that matches the approved amount as **Loan Disbursement**. That row is attached to the borrower, the agreed schedule is applied, and repayments track as usual. The inbox no longer hides the approval notice behind the Accept Terms card. Startup posts a missing approval notice once if the earlier approve did not. Test: `npm run test:loan-applications`. **Production:** `15710c9` (`git push`; Netlify UI + Render API). Hard-refresh **Forms & Documents**, **Messages**, **Loans**, and **Import**. No data upload.
- **2026-10-21** — **No loan due notice after a recorded repayment:** The installment due-date job no longer emails or posts a portal notice when a **Loan Repayment** for that installment is already on the books (bank import or Record). Schedule coverage handles prepaid months; without a schedule, a repayment after the previous due date through today skips the notice. Paid `loan_installments` rows are also skipped. Fixes Assurance members such as Oluwabiyi Omotuyole receiving an October due notice after their October repayment was imported. Test: `npm run test:loan-due-notice`. **Production:** `fa7d5b6` (`git push`; Render API). Hard-refresh not required for the scheduler. No data upload.
- **2026-10-21** — **Email Notices View Message opens in a new tab:** **Messages → Email Notices** and Meetings **Email Send Audit** no longer dump the copy at the bottom of the same page. **View Message** opens `/admin?emailNotice=<id>` in a new tab with the stored wording, recipients, and send status. Close that tab when done. **Production:** `5c0ac31` (`git push`; Netlify UI + Render API). Hard-refresh **Messages**. No data upload. UI-only (same `GET /api/books/email-audit/batches/:id`).
- **2026-10-21** — **Loan terms schedule shows principal and interest on mobile:** Each installment is a stacked row (due date and payment on the first line; Principal and Interest on the second) so members see the split without a sideways-scroll table. Summary also shows Total Interest. Inbox Accept/Reject stays on the same notice. Tests: `npm run test:loan-applications`. **Production:** `ce1d477` (`git push`; Netlify UI + Render API). Hard-refresh **Messages**. No data upload.
- **2026-10-21** — **Loan terms inbox: readable schedule + Accept/Reject on the notice:** The member portal inbox no longer dumps a 12-line principal/interest wall of text. The notice shows Principal, Rate, Term, Monthly Payment, and a two-column Due Date/Payment table, with **Accept Terms** and **Reject Terms** on that same conversation. Rejected terms become **Terms Rejected** on the admin loan applications list (admin can re-offer). Email copy is the same two-column schedule. Tests: `npm run test:loan-applications`, `npm run test:automated-messages`. **Production:** `b5093ed` (`git push`; Netlify UI + Render API). Hard-refresh **Messages**. No data upload. The already-sent ugly notice is replaced on open by the clean card (stored application terms).
- **2026-10-21** — **Simple loan application workflow (no guarantor when covered by contributions):** Loan applications without a term default to **12 months**. Administrators set **Annual Interest Rate (%)** on **Loans → Loan Payment Policy** (default 8%). Before approval, admin **Offer Repayment Terms** generates an amortization schedule, emails the member, and posts a portal notice. The member reviews the schedule on **My Account → Loan Terms to Review** (mobile-friendly) and clicks **Accept Terms**. Only then can admin **Approve Loan**. Amounts at or below the member's contributions account need no guarantor. Amounts above contributions are blocked until the two-guarantor workflow (task 5h). After approval the member gets email + portal notice. Admin **Loans** tab banner shows applications with accepted terms. Tests: `npm run test:loan-applications`, `npm run test:loan-policy`, `npm run test:automated-messages`. **Production:** `e4c6774` (`git push`; Netlify UI + Render API). Hard-refresh **Forms & Documents**, **Loans**, and **My Account**. No data upload.
- **2026-10-19** — **Email Notices exact copy + portal deposit acknowledgements:** **Messages → Email Notices** (and Meetings **Email Send Audit**) now store and show the exact wording each member received, not only subject and recipients. Older sends say copy was not stored. Deposit/loan repayment acknowledgements and loan payment due notices are also posted to the member portal inbox; administrators see the same threads under **Sent**. Tests: `npm run test:deposit-credit-alerts`, `npm run test:messaging`. **Production:** `9e79795` (`git push`; Netlify UI + Render API). Hard-refresh **Messages**. No data upload. Past deposit emails are not backfilled into the portal.
- **2026-10-19** — **New-member bank attach pipeline:** Skipped import rows that are already on the books no longer show "Member is required" (they show the ledger member). Zelle "payment from" names attach when the first name is unique among members (Olayemi Idowu → Olayemi Daramola). Bank import now deducts the $100 membership fee from a first deposit. Payment name mappings are learned from attached deposits and seeded on Accept Member. Tests: `npm run test:member-bank-attach`, `npm run test:bank-append`. **Production:** `bad422b` (`git push`; Netlify UI + Render API). Hard-refresh **Import**. No data upload. Startup learns existing Zelle names from deposits (including OLAYEMI IDOWU → Olayemi Daramola).
- **2026-10-08** — **Deposits-verified email wording:** The notice now says the agreed membership application fee was deducted from the initial deposit, and the remaining amount was credited to the contributions account as the first deposit. Startup v2 correction rewrites the prior "membership fee income" sentence and resends once. Test: `npm run test:automated-messages`. **Production:** `04d2fe3` (`git push`; Netlify UI + Render API). If the Cooperative saved custom wording, Restore Default on **Automated Messages**. No data upload. Olayemi's v2 correction email sends on Render restart.
- **2026-10-08** — **Deposits-verified notice uses actual deposit leftover:** The verified-deposits email and portal notice no longer hardcode a $100 initial contribution. They state the first deposit, the $100 membership fee, and the leftover in the contributions account ($150 deposited → fee $100, leftover $50). Startup rewrites mismatched $100/$100 notices and resends a corrected email once (Olayemi Daramola after Render restart). Test: `npm run test:membership-applications`. **Production:** `9b9fee5` (`git push`; Netlify UI + Render API). Hard-refresh **Automated Messages** if you had saved the old wording (or Restore Default). No data upload. Olayemi's corrected email sends on Render restart.
- **2026-10-08** — **Admin Messages Sent + Email Notices; first-deposit membership fee:** The Messages tab now has **Inbox**, **Sent**, and **Email Notices** so administrators can see portal messages they sent and automatic member emails (with recipients). A new member's first deposit automatically records the agreed $100 membership fee as fee income; the contributions account keeps the extra. Startup backfill applies this for recent joins who already have a deposit but no fee row (including Olayemi Daramola on Assurance after Render restarts). Tests: `npm run test:messaging`, `npm run test:membership-applications`. **Production:** `38f9252` (`git push`; Netlify UI + Render API). Hard-refresh **Messages**. No data upload (fee posts on the live API after Render restarts).
- **2026-10-07** — **Automated Messages tab (edit email wording on demand):** Admin tab lists every automatic member email (loan due, deposit/loan repayment confirmed, membership, login, meetings, reports, inbox tip). Subject and body are editable per Cooperative with placeholders; Restore Default returns PFM copy. Due-notice confirmation line says **confirmed** (not imported). APIs: `GET/PUT /api/cooperative/automated-messages/:id`, `POST .../reset`. Test: `npm run test:automated-messages`. **Production:** `9c92d02` (`git push`; Netlify UI + Render API). Hard-refresh **Automated Messages**. No data upload.
- **2026-10-07** — **Loan installment due notices:** On each loan's installment due date (same calendar day as disbursement, every month after; e.g. disbursed 5/22 is due every 22nd after), PFM emails the borrower the amount due and outstanding loan balance as of that date. Disclaimer: if the payment was already sent, disregard pending bank reconciliation; a payment acknowledgment with the transaction date follows after the repayment is confirmed. Scheduler runs at API startup and every 6 hours for all Cooperatives (deduped per member per day). Admins edit wording on **Automated Messages**. Test: `npm run test:loan-due-notice`. **Production:** `9c92d02` (`git push`; Render API). No data upload.
- **2026-10-07** — **Deposit/loan repayment credit alerts after bank import:** After a successful **Import New Bank Activity** apply, each member whose new **Member Deposit** or **Loan Repayment** rows were ingested is emailed an acknowledgment with the date, type, and amount (one email per member per import). Skipped duplicates are not emailed. **Full Ledger Refresh** does not send alerts. Re-sends are blocked per transaction. Latest recent append import can be backfilled with `POST /api/bank-import/deposits/notify-latest` (used for Assurance payments ingested just before this shipped). Test: `npm run test:deposit-credit-alerts`. **Production:** `b88aa68` (`git push`; Netlify UI + Render API). Hard-refresh **Import**. After Render is live, latest recent append is emailed via `POST /api/bank-import/deposits/notify-latest` or the next admin session. No data upload.
- **2026-10-05** — **Disregard a mistaken membership application:** `/admin` **Forms & Documents** now has **Disregard Application** for an erroneous or duplicate submission (for example a wrong date of birth, then a second form). Status becomes **Disregarded**, the (1) badge clears, and an unused pending profile with no ledger activity is removed. A later correct application can still be accepted. Accepting one application also closes other open applications for the same applicant. **Delete** remains for wiping leftover rows. Test: `npm run test:membership-applications`. **Production:** `d4f3baf` (`git push`; Netlify UI + Render API). Hard-refresh **Forms & Documents**. No data upload.
- **2026-10-05** — **Forms catalog lists each published form once:** `/admin` **Forms & Documents** no longer shows Membership and Loan assign buttons on every row. Membership-named forms appear under **Membership Form** with **Use as Membership Application**. Loan-named forms appear under **Loan Form** with **Use as Loan Application**. Linking a form to one purpose clears it from the other so the same UUID cannot be Linked as both. **Production:** `eb35895` (`git push`; Netlify UI). Hard-refresh **Forms & Documents**. No data upload.
- **2026-10-05** — **Membership applications: accept first, then verify deposits:** Submit now emails the applicant immediately (received + welcome; another email after deposits). **Accept Member** is always available (no fee/contribution gate). Accept activates the member, creates portal login, emails welcome credentials, adds them to **Members & Accounts**, and clears the Forms & Documents (1) badge. **Save Profile** still does not accept or clear the badge. **Verify Deposits** records the standard fee/contribution if missing, then emails the member and posts a portal notice to check balances. Bank import or Record of a matching deposit on an accepted application sends the same notice. Test: `npm run test:membership-applications`. **Production:** `eb35895` (`git push`; Netlify UI + Render API). Hard-refresh **Forms & Documents**. No data upload.
- **2026-09-30** — **Brochure look restored to the original Letter print design:** User preferred the former brochure chrome over the product-page restyle. `brochure.css` and the brochure toolbars are back to the navy rail, compact feature rows, and print-first cards. E-loan copy, four highlight chips, and product-page **View Brochure** stay. **Production:** `db20706` (`git push`; Netlify UI). Hard-refresh `/brochure` and `/brochurengn`. No data upload.
- **2026-09-30** — **Marketing lists the full e-loan flow:** `/product`, `/productngn`, `/brochure`, and `/brochurengn` no longer describe loans as tracking-only. Hero, Capabilities, Roles, workflow, and trust include **E-Loan Application/Guarantee/Approval**, plus **Membership Applications**, **Messages Inbox**, monthly bank-append import, and auto-generated organization codes. Brochures keep four highlight chips. Hero **View Brochure** buttons open `/brochure` or `/brochurengn`. No FlexxForms vendor name on marketing. **Production:** `154f6ec` (`git push`; Netlify UI). Hard-refresh `/productngn` and `/brochurengn`. No data upload.
- **2026-09-18** — **Import preview does not linger after you leave the tab:** Import is a single-page view, so the last statement preview (file name, skipped rows, status) stayed on screen after switching to Books/Members and back. Leaving **Import** now clears **Import New Bank Activity** and **Full Ledger Refresh** upload state for a fresh session. Also stop **Add New Transactions (N)** from sticking after apply (busy-label restore). Files: `public/app.js`. **Production:** `50f454e` (`git push`; Netlify UI). Hard-refresh **Admin → Import**. No data upload.
- **2026-09-18** — **Messages no longer corrupt ampersands:** Admin Word-paste/HTML sanitizer was escaping text that was already HTML (`&` → `&amp;` → `&amp;amp;`), then doing it again when the thread opened, so members saw `&amp;amp;`. It now decodes entities (including already double-encoded text) and escapes once. Existing messages repair on open; no data upload. Files: `html-sanitize-lite.js`, `test-messaging.js`. Test: `npm run test:messaging`. **Production:** `50f454e` (`git push`; Netlify UI + Render API). Hard-refresh **Messages**. No data upload.
- **2026-08-29** — **Register is quieter and generates the organization code:** `/register` no longer asks the user to invent a code or read notes about US dollars or existing Cooperatives. After they enter the Cooperative name they confirm it, then PFM generates the code with **Copy Code** and **Save to Device**. Country label is **Select Country of Business Location**. After create, `/admin` opens with the code filled in. Member welcome/reset emails and other member portal links now use `?org=` so the login field is pre-filled. Files: `organization-service.js`, `portal-urls.js`, `auth-service.js`, `report-notification-service.js`, `public/index.html`, `public/app.js`, `public/theme.css`. Test: `npm run test:organization-code`. **Production:** `64da149` (`git push`; Netlify UI + Render API). Hard-refresh `/register`. No data upload.
- **2026-08-25** — **Signed-in views use the full pane beside the sidebar:** `.app-content` was capped at 1320px and centered, so Loans (and other tabs) sat in a narrow column with unused grey space on both sides. The content column now fills `app-main` (32px side padding kept). Login cards are unchanged. Files: `public/theme.css`. **Production:** `866f75e` (`git push`; Netlify UI). Hard-refresh `/admin`. No data upload.
- **2026-08-25** — **Loan labels stay on one line; Windows type is sharper:** The Loans table has 11 columns, so the first column was squeezed and **Loan 1** wrapped onto two lines. The Loan column now uses `nowrap` (plus a non-breaking space in the label) and the table can scroll sideways. Also removed `-webkit-font-smoothing: antialiased` so Windows Chromium/Edge keeps ClearType instead of grey grayscale AA. Files: `public/theme.css`, `public/app.js`, `public/index.html`. **Production:** `866f75e` (`git push`; Netlify UI). Hard-refresh **Admin → Loans**. No data upload.
- **2026-08-25** — **Members & Accounts is a half-and-half split:** The profile pane was capped at 360px, so **Edit Profile**, **Reset Portal Password**, and the account cards looked scrunched. List and profile are now equal columns (`1fr 1fr`). Profile photo, buttons, and account cards use the extra width; the list still shows all five columns and can scroll sideways if needed. Files: `public/styles.css`, `public/theme.css`. **Production:** `e57d965` (`git push`; Netlify UI). Hard-refresh **Admin → Members & Accounts**. No data upload.
- **2026-08-25** — **Plantvest-crisp type and color (operational UI):** Headings are neutral near-black (`#14181C`), body is `#2B3136` on white, sidebar text is solid `#FFFFFF` / `#DCE7DF` (no alpha). Inter 400–700 and Plus Jakarta Sans 600–800 load from Google Fonts (latin woff2 preloaded). Body uses antialiased rendering; no opacity/filter/scale on text. Table headers 12.5px 600; readable text ≥14px. Button gradient 0% stop stays `#2A7A44` because spec `#6FBF3F` is 2.28:1 with white. Ink-400 is `#6E787D` because spec `#7B8590` is 3.75:1. Files: `public/theme.css`, `public/styles.css` (body font), `public/index.html` and `public/cooperative-public.html` (font preload). **Production:** `c132206` (`git push`; Netlify UI). Hard-refresh `/admin`. No data upload.
- **2026-08-25** — **Members & Accounts fits list and profile in view:** The list pane was capped at 38% width, so **Profile** (and sometimes **Loan Account**) clipped to a letter. Layout is now list `1fr` + profile max 360px. On wide screens both panes fill the leftover window and scroll inside the pane (sticky column headers). **Contributions Account** and **Loan Account** cards sit directly under the name so they stay on screen; **Membership Status** is below those cards. Below 1200px the panes stack and the page scrolls. Files: `public/styles.css`, `public/theme.css`, `public/app.js`. **Production:** `c132206` (`git push`; Netlify UI). Hard-refresh **Admin → Members & Accounts**. No data upload.
- **2026-08-25** — **Record Recent Expenses is readable:** On wide screens `.record-workspace` is a 2-column grid (jump list + forms). **Recent Expenses** and **Recent Distributions** sat as extra grid items, so Expenses was squeezed into the 220px left column under the jump links and cut off. Both lists now live in `.record-grid` with the forms. Jump list includes those two sections. Files: `public/index.html`, `public/theme.css`. **Production:** `c132206` (`git push`; Netlify UI). Hard-refresh **Admin → Record** and open **Recent Expenses**. No data upload.
- **2026-08-24** — **Import Bank Accounts section opens and loads accounts:** Plantvest `display:flex` on `summary` stacked the chevron under centered title/hint, so **Bank Accounts and Import Settings** did not look or act like a control. Import rows are a 2-column grid (title/hint left, chevron right) with pointer-events on the row. Hidden **Choose File** inputs no longer override `.visually-hidden-file` (they were 300px wide and could steal clicks). Opening that section loads bank accounts and expands **Registered Bank Accounts**. Dropdown errors show **Could not load accounts** instead of staying on **Loading Accounts…**. Files: `public/theme.css`, `public/index.html`, `public/app.js`. **Production:** `6f7686d` (`git push`; Netlify UI). Hard-refresh **Admin → Import**. No data upload.
- **2026-08-24** — **Header no longer shows Administrator twice:** The green outline is the role (`#sessionRole`). The text beside it is the account name (`#sessionUser`). Assurance startup was rewriting the admin `display_name` to `Administrator` on every boot, so both said the same word. Startup no longer overwrites the name. If the stored name is still just the role word, the header shows the email instead. Files: `public/app.js`, `lib/auth-service.js`, `public/theme.css`. **Production:** `1ab54eb` (`git push`; Netlify UI + Render API). Hard-refresh `/admin`. No data upload.
- **2026-08-24** — **Import Bank Account dropdown usable again:** Same Plantvest card-form bug as Restore: `.card form { align-items: center }` shrink-wrapped the empty native `<select>` to the arrow (~30px), so Bank Account looked broken. Card forms now stretch; Import New Bank Activity uses a full-width select (placeholder **Loading Accounts…**) and the Statements **Choose File** pattern (`name="statement"` unchanged). Duplicate ▸/▾ markers on Import rows removed (theme chevron stays). Files: `public/styles.css`, `public/theme.css`, `public/index.html`, `public/app.js`. **Production:** `1ab54eb` (`git push`; Netlify UI). Hard-refresh **Admin → Import**. No data upload.
- **2026-08-24** — **Users and Maintenance cards no longer scrunched:** Plantvest had two layout bugs. (1) `.card form { align-items: center }` plus a global dashed `input[type="file"]` squeezed Database Restore into a narrow centered column. (2) Users/Maintenance reused `.record-grid` as a single full-width column, so Provision All Member Logins was a thin strip across 1320px. Restore now uses the Statements **Choose File** pattern (`name="database"` unchanged). Users and Maintenance cards are a 2-column grid from 960px, with 16px internal stacking. Files: `public/theme.css`, `public/index.html`, `public/app.js`. **Production:** `1ab54eb` (`git push`; Netlify UI). Hard-refresh **Admin → Users** and **Admin → Maintenance**. No data upload.
- **2026-08-24** — **Plantvest theme regressions (Import/Users blank) + layout correction:** An extra `</div>` after Record closed `.app-main` early, so Import, Maintenance, Users, and My Account sat outside the layout grid and looked empty. Restored nesting. Unboxed the admin header (no pill), one `app-content` column (max-width 1320px) for header + views, white cards on `--pv-surface-1` `#F5F6F4`, 52px collapsible rows, green/neutral badges (Excel and Announced no longer blue), styled Statements Choose File (native input kept). Session role is `#sessionRole`; display name stays `#sessionUser`. **Production:** `8460938` (`git push`; Netlify UI + Render API). Hard-refresh `/admin`. No data upload.
- **2026-08-24** — **Stronger organization codes for new signups:** `/register` now requires at least 8 characters with a letter and a number; letters, numbers, and hyphens only (no special characters). Live `assurance` is unchanged (seeded outside Register; login still accepts it). Sign-in returns **Invalid username or password** whether the organization code is unknown or the password is wrong. Files: `organization-service.js`, `auth-service.js`, `public/index.html`. Test: `npm run test:organization-code`. **Production:** `git push` (Netlify UI + Render API). Hard-refresh `/register` and login pages. No data upload.
- **2026-08-24** — **Plantvest visual theme (operational UI):** Restyled the SPA (sign-in, Cooperative Manager, member portal, SPA public shell) and Cooperative About/Bylaws pages to the Plantvest green design language. Tokens live in `public/theme.css` (loaded after `styles.css`). No API, PDF, email, or FlexxForms logic changes. Highlighted Cooperative Books cards still use `.book-card.accent`. Marketing `/product` and `/brochure` pages are unchanged. **Production:** `a874460` (`git push`; Netlify UI). Hard-refresh after publish. No data upload.
- **2026-08-24** — **Nigeria brochure (`/brochurengn`):** Printable two-page Letter brochure for Nigerian Cooperatives, same layout as `/brochure`. Naira prices match `/productngn` (₦40,343 / ₦119,818 / ₦464,744). Copy is Nigeria-only (naira, DD/MM/YYYY, Nigerian bank import, Country: Nigeria). Toolbar **Open Product Page** goes to `/productngn`. Linked from `/productngn` Brochure. No cross-links to `/brochure` or `/product`. US `/brochure` chip/trust copy is United States only. Files: `public/brochurengn.html`, `brochure.css`, `brochure.html`, `productngn.html`, `server.js`, `scripts/netlify-build-config.js`. **Production:** `f13f441` (`git push`; Netlify UI). Open https://peer-finance-manager.netlify.app/brochurengn after publish. No data upload.
- **2026-08-24** — **Share thumbnails for marketing links:** Open Graph and Twitter cards on `/product`, `/productngn`, `/brochure`, and `/brochurengn` so WhatsApp, iMessage, Slack, and Facebook show a preview image. Files: `public/og-product.jpg`, `public/og-productngn.jpg`. **Production:** `git push` (Netlify UI). After publish, refresh the share preview (some apps cache the old blank card). No data upload.
- **2026-08-24** — **Product pages stay market-specific:** Removed the Naira link from `/product` and the United States links from `/productngn` (nav and footer). Each marketing page is standalone; no cross-country tabs. **Production:** `git push` (Netlify UI). No data upload.
- **2026-08-24** — **Nigeria product page copy:** Members sample card is **250**. Removed all USD wording and dollar prices from `/productngn` (that footnote was only explaining that Stripe still charges dollars). Nigeria page now shows naira only. US `/product` unchanged. **Production:** `git push` (Netlify UI). No data upload.
- **2026-08-24** — **Nigeria product page deploy:** Production `2fa3fd4`. Open https://peer-finance-manager.netlify.app/productngn after Netlify publishes. USD page remains https://peer-finance-manager.netlify.app/product. No data upload.
- **2026-08-24** — **Nigeria product page (naira display):** Public marketing page at `/productngn` mirrors `/product` with naira hero cards and naira plan prices converted from USD at **₦1,345.21 per $1** (24 August 2026, ExchangeRate-API). Monthly **₦40,343**, quarterly **₦119,818**, annual **₦464,744**. Footnote: subscription billing stays US dollars; naira is display only. US `/product` unchanged. Files: `public/productngn.html`, `product.css`, `product.html` (Naira nav), `server.js`, `scripts/netlify-build-config.js`. **Production:** `2fa3fd4` (`git push`; Netlify UI). No data upload. Do not change Assurance country.
- **2026-08-23** — **Login org-code sample deploy:** Production `9c10243`. Hard-refresh member/staff/admin login. Placeholder is `e.g. acme`. If the field still shows `assurance`, that browser remembered the last successful sign-in; new visitors see `acme`. No data upload.
- **2026-08-23** — **Login org-code sample is fictional:** Organization Code placeholders on member/staff/admin login, membership apply, and platform check-payment use `e.g. acme` (already used on Register). Stopped pre-filling the live `assurance` slug into login fields (`DEFAULT_ORG_SLUG` is now empty; remembered code from a prior sign-in still works). Files: `public/index.html`, `public/app.js`. **Production:** `9c10243` (`git push`; Netlify UI). Hard-refresh login pages. No data upload.
- **2026-08-22** — **Marketing brochure deploy:** Production `13c1a24`. After Netlify publishes, open https://peer-finance-manager.netlify.app/brochure and hard-refresh. **Download PDF** then Save as PDF. No data upload.
- **2026-08-22** — **Marketing brochure (webpage + PDF):** Printable two-page Letter brochure at `/brochure`. On-screen toolbar **Download PDF** opens the browser print dialog (choose Save as PDF). Copy matches product features, roles, workflow, and live pricing ($29.99 / $89.07 / $345.48). Linked from `/product`. Files: `public/brochure.html`, `public/brochure.css`, `server.js`, `scripts/netlify-build-config.js`. **Production:** `13c1a24` (`git push`; Netlify UI). Local: http://localhost:3457/brochure. No data upload.
- **2026-08-21** — **SPA portal CSS deploy:** Production `03d1541`. Hard-refresh `/register`. You should see only the styled **Register Cooperative** form. No data upload.
- **2026-08-21** — **SPA portal CSS on Netlify (all public paths):** `/register`, `/admin`, `/staff`, `/member`, and `/platform` rewrite to `index.html`. Relative `styles.css`/`app.js` then requested `/register/styles.css` (also HTML), so CSS never applied, `.hidden` did nothing, and every login form stacked as raw HTML. Fix: root-absolute `/styles.css`, `/app.js`, `/flexxforms-embed.js`; inline `.hidden`; tiny boot script shows only the screen for the current path; Netlify cache-bust keeps leading slashes. **Platform Administration is never linked** from register/member/staff/admin/product; `robots.txt` disallows `/platform`. Operator-only URL stays in `STRIPE-PAYMENTS-GUIDE.md`. Files: `public/index.html`, `scripts/netlify-build-config.js`, `public/robots.txt`. **Production:** `03d1541` (`git push`; Netlify UI; Render API unchanged). Hard-refresh `/register`. No data upload.
- **2026-08-21** — **Assurance annual subscription activated (ops):** Platform **Record Check Payment** for slug `assurance`, plan **annual**, method **check**. Status `active`. Period end **2027-08-22**. Live registry on Render (also recorded on local registry). No code deploy. Do not change Assurance country.
- **2026-08-21** — **Country profiles deploy:** Production `ae04579`. Netlify UI + Render API. Hard-refresh after Render finishes. Register a test org at `/register` with **Country: Nigeria**. Leave Assurance on United States. No data upload.
- **2026-08-21** — **Deleted leftover `tmp-live-app.js`:** Local scratch dump of an old live `app.js`. It was never part of the product, was not in Git, and is gone. Do not recreate it. **Production:** no code impact.
- **2026-08-21** — **Docs audit vs §0:** Confirmed feature changelog/USER-GUIDE/README for country work were written in the same session. Backfilled stale handover sections: workspace path `C:\Users\ydara\Documents\AssurCoop`; machine-snapshot working tree; Assurance annual-pay user report vs last API verify; outstanding task 2b; §6 test script; §7/§8 next session; §10 grep targets; README key files. **Production:** `ae04579`. No data upload.
- **2026-08-21** — **Nigerian banks/states searchable dropdowns + DD/MM/YYYY:** Full catalog in `country-catalog.js`: CBN deposit-money banks (plus common aliases and digital/MFB names that appear on transfers) and all 36 Nigerian states + FCT. Institution and State fields use a type-to-search dropdown (custom names still allowed). US path uses US bank suggestions and 50 states + DC; Assurance date labels stay MM/DD/YYYY. Nigeria status reports, import, and UI dates use DD/MM/YYYY. Files: `country-catalog.js`, `country-profile.js`, `cooperative-date-format.js`, `cooperative-status-report.js`, statements, `app.js`, `index.html`, `styles.css`. Test: `npm run test:country-profile`. **Production:** `ae04579` (`git push`; Netlify UI + Render API); no data upload. Do not change Assurance country.
- **2026-08-21** — **Country profiles (US default, Nigeria ready, future-flexible):** Per-tenant **Country** on Register and **Organization & Report Settings**. Unset/unknown codes stay **United States** (USD, Pacific, MM/DD/YYYY) so Assurance and existing tenants are unchanged: no ledger conversion, no bank-account rewrite. Nigeria: NGN display, Africa/Lagos, DD/MM/YYYY, Nigerian statement header aliases (Trans Date/Narration/Debit/Credit, ₦ amounts). Add the next country in `country-profile.js` plus lists in `country-catalog.js`. Platform SaaS billing stays USD. Test: `npm run test:country-profile`. Files: `country-profile.js`, `money-format.js`, org/auth/import/PDF/UI. **Production:** `git push` (Netlify UI + Render API); no data upload. Do not change Assurance country.
- **2026-08-21** — **Manual status report date + CD term form deploy:** Production `efd3006`. Netlify UI + Render API. Hard-refresh after Render finishes. No data upload. Then **Status Report → Generate** (and **Publish** if auto-publish is off); **Record → CD Account Balance and Term** for the rolled-over CD.
- **2026-08-21** — **Manual status report date + CD term form (all tenants):** Manual **Generate Report** / **Publish to Members** now stamp the report **as at today** (the calendar day you run them). A prior save/display path always rewrote as-of to month-end, so mid-month publishes showed e.g. 08/31. Month-end auto-generate still uses the last calendar day. **Record → CD Account Balance and Term** now edits rollover terms (beginning balance, rate, APY, renewal, maturity, term days); Cooperative Books **Open Record** on CD cards opens that form; Expected CD Interest no longer formats dates/rates as money ($0.00). Updating the CD balance no longer resets terms to hardcoded defaults. Files: `cooperative-status-report.js`, `monthly-status-report-service.js`, `cd-balance-service.js`, `cooperative-books.js`, `server.js`, `app.js`, `index.html`, `USER-GUIDE.md`. **Production:** `efd3006` (`git push`; Netlify UI + Render API; no data upload). After deploy, **Generate** then **Publish** this month's report so members see today's date; enter new CD term on Record after a rollover.
- **2026-08-09** — **Machine-transfer docs sync:** Verified `main`/`origin/main` (ignore untracked `tmp-live-app.js`). Added **Machine transfer snapshot** (git HEAD, pricing, Assurance grace through **2026-08-21** `check_pending`, what Git moves vs data/env). Corrected stale outstanding task **Cooperative expenses** (UI + report labels live). Refreshed §7/§8 next-session plan. Also `UPDATE-AND-PUBLISH.md` (moving PCs) + README pointer. **Production:** `382e588` (docs-only push).
- **2026-08-07** — **Operational Expense Labels presets + add-new (all tenants):** Seed dropdown from built-in categories (Bank Fees, Administrative, Technology, Meeting/Event, Professional Services, Insurance, Other). Empty catalog previously showed only **Other…**. Renamed freeform option to **Add New Label…**; added **Add Report Label** field; new labels persist and appear in all row dropdowns. Pre-selects matching import category when no report label assigned. API `POST /api/books/expense-report-labels`. Files: `expense-report-label-service.js`, `server.js`, `app.js`, `index.html`, `styles.css`, `USER-GUIDE.md`. **Production:** `d399bb4` (`git push`; Netlify UI + Render API; no data upload; seed runs on next labels API call).
- **2026-08-06** — **SaaS pricing $29.99 (all tenants):** Monthly **$29.99** (was $27.99 / earlier $24.99); quarterly **1% off** → **$89.07**; annual **4% off** → **$345.48**. Same discount terms. Source: `platform-billing-constants.js` + marketing `product.html`, platform check-plan labels, docs. **Production:** `4c31805` (`git push`; Netlify UI + Render API; no data upload).
- **2026-08-06** — **SaaS pricing update (all tenants):** Monthly **$27.99** (was $24.99); quarterly **1% off** → **$83.13**; annual **4% off** → **$322.44**. Superseded same day by $29.99. **Production:** `b58a8f6`.
- **2026-07-30** — **Assurance subscription grace +20 days (ops):** Platform `extend-grace` for slug `assurance`: `subscription_grace_until` → **2026-08-21** (was 2026-08-01; full access through that date). Status remains `check_pending` (check pickup pending). Note stored on org. No code deploy.
- **2026-07-20** — **Apply embed signature/submit gap deploy:** Production `a71d895`. Netlify UI; hard-refresh apply page. No data upload.
- **2026-07-20** — **Apply for Membership embed: signature/submit gap fix:** Stop growing the FlexxForms iframe to inflated document heights (signature pad was creating endless whitespace + scroll glitch). Embed now stays at viewport shell height; form scrolls inside the iframe. MutationObserver fights embed.js restretch. Files: `flexxforms-embed.js`, `cooperative-public.css`, `cooperative-public.html`, `USER-GUIDE.md`. **Production:** `a71d895`.
- **2026-07-19** — **Membership alerts + bylaws cleanup deploy:** Production `478950c`. Admin membership-application nag/Messages notice; Assurance bylaws OCR/article/certificate seed v13; Public Pages Bylaws admin disclosure fix. No data upload; Render reseed applies Assurance bylaws on API restart.
- **2026-07-18** — **Public Pages admin Bylaws disclosure:** Closed missing `</div></details>` around **Bylaws Page** in `index.html` so the section expands and shows Bylaws Text / PDF upload like About Us. **Production:** `git push` (this deploy).
- **2026-07-18** — **Assurance Bylaws page cleanup:** Fixed OCR mid-word splits (`s hall` → shall, etc.), proper Article headers (`Article N` badge + title) with body text styling, Articles 14–18 as separate sections, Certificate filled with **December 9, 2022** and **Assurance Cooperative Executive Committee**. Seed version **13** (auto-applies on API restart). Files: `ocr-text-repair.js`, `public-plain-text-html.js`, `seed/assurance/public/bylaws.html`, `cooperative-public.css`, `cooperative-public-pages-service.js`. Test: `npm run test:ocr-text-repair`. **Production:** `git push` (this deploy; Render reseed).
- **2026-07-18** — **Admin membership application alerts (all tenants):** On new FlexxForms membership submit, PFM posts an unread **System Notice** to admin **Messages** (optional email tip) and shows a flashing **Forms & Documents** tab badge + banner nag until no open applications remain. API `GET /api/flexxforms/applications/summary`. Files: `messaging-service.js`, `flexxforms-service.js`, `flexxforms-membership-service.js`, `flexxforms-routes.js`, `app.js`, `index.html`, `styles.css`, `USER-GUIDE.md`. Test: `npm run test:messaging`. **Production:** `git push` (this deploy).
- **2026-07-18** — **Admin UX polish deploy:** Production `b2dd327`. Membership Status collapsed; full members list; bank **Approve as Is**. No data upload.
- **2026-07-18** — **Admin UX polish (all tenants):** (1) Member detail **Membership Status** collapsed by default (expand to edit). (2) **Members & Profiles** list no longer uses an inner max-height scroll pane: full list on the page. (3) Bank append preview: **Approve as Is** per Review row and **Approve Suggested Rows** when Type/Member already look correct (no toggle dance). Files: `app.js`, `styles.css`, `USER-GUIDE.md`. **Production:** `b2dd327`.
- **2026-07-17** — **Messages HTML render fix deploy:** Production `e9c0678`. Existing minutes threads re-render without resend. Attachments above body. No data upload.
- **2026-07-17** — **Messages HTML render fix (all tenants):** Member/admin thread view showed raw tags when HTML bodies were stored under default `body_format=markdown`. `formatMessageBody` / `normalizeBodyFormat` now detect HTML content and sanitize as rich HTML. Attachments render **above** the message body. Files: `messaging-service.js`, `app.js`, `styles.css`, `test-messaging.js`. **Production:** `e9c0678`.
- **2026-07-17** — **Messages rich Word-paste + modern UI deploy:** Production `409dbb3`. Netlify UI + Render API. Hard-refresh Messages after deploy. No data upload.
- **2026-07-17** — **Messages UI modernized (all tenants):** Redesigned Admin/Member Messages: segmented Send To control, compact format toolbar (B/I/lists) inside a unified rich shell, dashed attachment drop zone, elevated surfaces, chat-style bubbles (self-aligned), unread left accent on inbox rows. Files: `index.html`, `styles.css`, `app.js`. **Production:** `409dbb3`.
- **2026-07-17** — **Messages rich Word-paste composer (all tenants):** Admin Messages uses contenteditable rich editor: paste from Word keeps headings/bold/lists; toolbar for Bold/Italic/Bullets/Heading; server sanitizes HTML (`html-sanitize-lite.js`, `body_format=html`). Attachments (PDF/image/Word) unchanged. Markdown still supported for older/member plain posts. Files: `html-sanitize-lite.js`, `messaging-service.js`, `messaging-routes.js`, `app.js`, `index.html`, `styles.css`, `USER-GUIDE.md`. Test: `npm run test:messaging`. **Production:** `409dbb3`.
- **2026-07-17** — **Messages Markdown + attachments (all tenants):** Admin compose accepts Markdown; optional PDF/image/Word attachments. Stored per org under `uploads/messages/`. Superseded same day by rich Word-paste composer (still supports markdown bodies).
- **2026-07-17** — **Loan applications pipeline (all tenants):** Assign FlexxForms **Loan Form Id** → member **Apply for a Loan** embed. Webhook stores `kind=loan` with parsed answers; admin **Forms & Documents → Loan Applications** lists submissions; **Review & Approve Loan** (borrower + 2 guarantors) creates PFM loan; reject/delete for unapproved. Member claim on form completed. Files: `flexxforms-loan-service.js`, `flexxforms-service.js`, `flexxforms-routes.js`, `app.js`, `index.html`, `USER-GUIDE.md`. Test: `npm run test:loan-applications`. **Production:** `git push` (`721187c`).
- **2026-07-17** — **Assurance subscription grace +15 days (ops):** Platform `extend-grace` for slug `assurance`: `subscription_grace_until` → **2026-08-01** (full access through that date). Status remains `check_pending`. Note stored on org. No code deploy.
- **2026-07-17** — **Cooperative inbox messaging (all tenants):** Bidirectional portal messages per org DB (`coop_message_threads` / participants / messages). Admin **Messages** tab: send to all / selected / one member; inbox + reply. Member My Account **Messages** / **Unread Messages** button (above performance reports) opens dedicated inbox page (list → full thread → back); members can message Cooperative admin. Optional email tip when SMTP/relay configured. APIs under `/api/messages/*` and `/api/me/messages/*`. Files: `messaging-service.js`, `messaging-routes.js`, `server.js`, `app.js`, `index.html`, `styles.css`, `USER-GUIDE.md`. Test: `npm run test:messaging`. **Production:** `git push` (`167e2c7`; no data upload).
- **2026-07-17** — **Member portal Apply for a Loan (status):** Embed shell already exists on My Account when `loan_form_id` is set. Gap: most orgs (incl. Assurance) have no published/assigned loan form; webhook stores `kind=loan` but does not parse, validate eligibility, or create a reviewable loan application (unlike membership). Needed next: FlexxForms loan form + assign id; then PFM loan-application pipeline (admin review → create loan → guarantor/borrower docs). Outstanding task **4r**.
- **2026-07-17** — **Meeting reminder email layout:** Reminder (and announce) emails now match preferred copy: title, date/time, **Join Online**, **Agenda**, **Best regards** + org name, then **Sign In to the Member Portal**. File: `meeting-notification-service.js`. **Production:** `git push`.
- **2026-07-16** — **Approve member emails portal login (all tenants):** On **Approve Member**, PFM creates/resets portal credentials, emails a welcome login message when configured, and shows **Copy Welcome Message** / temp password for admin handoff. Files: `flexxforms-membership-service.js`, `auth-service.js`, `flexxforms-routes.js`, `app.js`, `index.html`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-16** — **Admin one-click member password reset + email (all tenants):** Users tab **Reset Password** (and member profile **Reset Portal Password**) creates a temp password, emails the member when configured, and shows **Copy Temporary Password** / **Copy Full Login Details**. API `POST /api/users/reset-member-password` (`sendEmail` default true). Script: `reset-member-password-production.js`. **Production:** `git push`.
- **2026-07-16** — **Single-member portal password reset API:** Admin API `POST /api/users/reset-member-password` (`memberId` or `memberName`). Deployed `2a1fe6c`.
- **2026-07-16** — **No membership restore (all tenants):** Former statuses cannot be set back to Active. Returning people must **Register New Member** (new number, new history). Old account stays historical. UI hides Active for former members; API rejects restore. Test: `npm run test:membership-status`. **Production:** `git push`.
- **2026-07-16** — **Former members blocked from active-member benefits (all tenants):** Resigned/Deceased/Expelled/Suspended cannot use portal APIs, emails, bulk/member statements, login provisioning/credentials, new loans/guarantor roles, contributions, distributions, or registration fees. Withdrawals + loan repayments still allowed for settlement; bank import matching kept for ledger history. `assertActiveDirectoryMember` + `requireActiveMemberAccount`. **Production:** `git push`.
- **2026-07-16** — **Dashboard Active Members/Profiles excludes former members:** Cooperative Books card counted all ledger members, so resigning Sonia left **23/24** unchanged. Now counts only active directory members/profiles and notes former count. Files: `cooperative-books.js`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-16** — **Fix membership status update “No organization database selected”:** `PATCH /api/members/:id/account-status` had `restoreOrgContext` before multer, so the upload cleared tenant context. Order is now upload → restore (same as bank append). **Production:** `git push`.
- **2026-07-16** — **Membership status document upload:** On **Membership Status**, admins can attach PDF/image of resignation or termination notice; download via **Download Document**. Stored per org under `uploads/membership-status/`. APIs: multipart on `PATCH /api/members/:id/account-status`, `GET .../account-status/document`. Test covers save/resolve. **Production:** `git push` (`48df822`).
- **2026-07-16** — **Membership status by type (all tenants):** Admins set **Active / Resigned / Deceased / Expelled / Suspended** on Members & Accounts (not a single vague inactive flag). Former members leave the default active list and **member emails**, keep ledger history, lose portal login until restored to Active. **Show Former Members** toggle. API: `PATCH /api/members/:id/account-status`. Profile edits no longer reset status to Active. Test: `npm run test:membership-status`. Files: `membership-status-service.js`, `member-profile-service.js`, `balance-service.js`, `report-notification-service.js`, `member-service.js`, `auth-service.js`, `server.js`, `app.js`, `index.html`, `styles.css`, `schema.sql`, `USER-GUIDE.md`. **Production:** `git push` (`48df822`).
- **2026-07-12** — **Splits: any N lines, all ledger types, no false Out of Sync, download notice:** Split supports 2+ lines mixing deposit/loan/expense/CD/investment/etc. Save blocked until amounts total the original (UI + API). Reconcile row-align treats any split-driven row-count increase as OK when cash balance still matches. Post-split prompt + alert require downloading Xlsx/Csv for local master sync. Test: `npm run test:ledger-split`. **Production:** `git push` (`971717e`).
- **2026-07-12** — **Reconcile after split/reclassify:** When bank cash balance at the verified as-of still matches but `bank_import` row count rose (one deposit expanded into split lines), realign the reconcile anchor instead of staying **Out of Sync**. Also refresh anchor after adjustment rebuild. Files: `bank-reconcile-service.js`, `ledger-adjustment-service.js`, `SAHEED-LOAN1-COOP-ADMIN-FIX.md`. **Production:** `git push` (`971717e`).
- **2026-07-11** — **Loan Payment Policy (flexible vs strict late fees, all tenants):** Coop admins toggle under **Loans → Loan Payment Policy**. Default **Flexible** (no late fee; current behavior). **Strict Timelines** charges a configurable flat late fee (default $25) when a repayment is after the installment due date. Policy is snapshotted per loan/disbursement at start so toggling never rewrites history. APIs: `GET/PATCH /api/cooperative/loan-policy`. Files: `loan-policy-service.js`, `loan-service.js`, `loan-ledger-service.js`, bank import hooks, UI. Test: `npm run test:loan-policy`. **Production:** `git push` (`971717e`).
- **2026-07-11** — **Layman SaaS scale review (MD):** Added [SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md](./SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md) (plain language: current limits, what works, phased plan). Linked from README + handover document map. Complements canvas `saas-scalability-architecture-review`.
- **2026-07-11** — **Zero WinSCP (complete):** Removed every WinSCP/SFTP/break-glass data workflow. `UPLOAD-DATA-TO-PRODUCTION.md` rewritten as Coop-admin browser guide. `DEPLOY-TODAY.md` first-time seed = Register + **Maintenance → Restore**. Docs/UI/comments no longer instruct SFTP. Replacement path: **Admin → Import** / **Maintenance**. Task 4h ✅. (Nightly off-disk backups still 4i.)
- **2026-07-11** — **SaaS scale architecture review (no code):** Audited multi-tenant readiness for thousands of Cooperatives. Verdict: isolation model (registry + per-org SQLite) is sound; single Render starter + 1 GB disk + in-process Puppeteer + no off-disk backups cannot scale. Canvas report: `canvases/saas-scalability-architecture-review.canvas.tsx`. Outstanding tasks 4i–4n (Phase 1 plan; 4h completed same day).
- **2026-07-11** — **WinSCP retired for routine ops (all tenants):** New **Admin → Maintenance** tab: **Download Database Backup**, **Restore Database** (preview + confirm, closes live DB handle, no Manual Deploy), **Normalize Profiles** on production. APIs: `GET /api/admin/data-backup`, `GET /api/admin/data-status`, `POST /api/admin/data-restore/preview`, `POST /api/admin/data-restore`, `POST /api/admin/maintenance/normalize-profiles`. `profile-normalize-service.js`, `admin-data-service.js`, `admin-data-routes.js`; `normalize-profiles.js` uses shared service. Docs: `UPLOAD-DATA-TO-PRODUCTION.md`, `UPDATE-AND-PUBLISH.md`, `USER-GUIDE.md` §23, `README.md`, `DEPLOY-TODAY.md`, email setup guides. **Production:** `git push`.
- **2026-07-11** — **Stale reference file cannot corrupt DB (all tenants):** Reclassify rebuilds from live DB (`00667b8`). Server startup no longer runs `syncMissingBankLedgerRows` (was injecting phantom rows from stale Render CSV on boot). Startup and post-import only **export DB → CSV**. `sync-missing` refreshes CSV from DB before any compare. §1B documents reference-file rules. Files: `import-bank-ledger.js`, `server.js`, `AGENT_HANDOVER.md`. **Production:** `git push` (`0aae2db`).
- **2026-07-11** — **Member ledger reclassify/split (all tenants):** **Bank Ledger Rows** panel on Loan Account lists every adjustable row with **Category** + **Split** (same as Contributions Account). Loan rows without lots get controls too. **Loan Disbursement** added to reclassify dropdown. Split uses full bank amount. Files: `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-11** — **Schedule-based loan payoff + Coop Admin split only (all tenants):** Loan repayments apply to **principal + scheduled interest** when workbook matches disbursement. Paid loans book **full scheduled interest**. **Split/Reclassify** use full bank deposit; **Amount** column shows **$600** (not an internal slice). Nov 6 row stays one `loan_repayment` until **Coop Admin** saves **Split** in UI. **Loan Repayment Bank Deposits** panel; surplus label **Surplus Pending Split**. `getCoopRoot()` fix; `test-loan-schedule-payoff.js`. Do not use `fix-march-2026-reconciliation.js` for Yomi Nov split. Files: `loan-ledger-service.js`, `loan-details-reference.js`, `paths.js`, `app.js`, `SAHEED-LOAN1-COOP-ADMIN-FIX.md`. **Production:** `git push`.
- **2026-07-10** — **Apply page mobile landscape signing:** On `/c/{slug}/apply`, hide hero banner; compact topbar; in landscape on short screens hide sticky header/footer so FlexxForms signature pad gets full viewport. Files: `cooperative-public.html`, `cooperative-public.css`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-10** — **Complete USER-GUIDE rewrite:** Full user-friendly guide covering all portals, tabs, workflows, glossary, monthly checklist, reclassify/split, bank import, and troubleshooting. Multi-tenant language; Assurance as example only. Replaces partial guide. Files: `USER-GUIDE.md`.
- **2026-07-10** — **USER-GUIDE: reclassify/split save workflow:** Expanded § Reclassify or split bank transactions: no table Save button; reclassify saves via confirm on dropdown change; split saves via **Save Split** in modal; post-action download prompt. Files: `USER-GUIDE.md`.
- **2026-07-10** — **Production restored via standard UI workflow (no Assurance wrapper):** Corrupted cloud DB (**$16,113.55** / 465 rows) reset with **Full Ledger Refresh** from `data/master-ledger/cooperative-bank-ledger-master.xlsx` (453 rows, **$15,471.49** through 6/29), then **Import New Bank Activity** with `stmt (8).csv` (4 New rows, Saheed → Loan Repayment/Yomi Salami, ending **$16,241.55** through 7/8). Confirms master + append is the normal product path; Assurance-specific build/restore wrappers are optional ops shortcuts only. **Data fix on Render** (no git).
- **2026-07-09** — **Multi-tenant append docs + regression:** Clarified §1B tenant isolation (no slug/balance checks in product code). `test-bank-append-balance.js` uses generic unit amounts; live preview opt-in via `--org`/`--stmt` (not Assurance-default). USER-GUIDE leads with all-tenant cumulative upload workflow; Assurance moved to ops example only. Files: `bank-import-append.js`, `test-bank-append-balance.js`, `AGENT_HANDOVER.md`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Idempotent cumulative bank append (permanent):** Re-uploading a statement from **period start through today** is the normal workflow for interim July (and any month) balance updates. Append blocks only when ledger is **below** statement beginning (missing history), not when ledger is **above** beginning because prior rows are already imported. Duplicates fingerprint to **Skipped**; only **New** rows apply. Ending block applies only when **ready** rows would not tie to statement ending. UI shows green pre-period gap note instead of red block. Regression expanded: `computeAppendBalanceCheck` unit cases + live preview. Files: `bank-import-append.js`, `app.js`, `index.html`, `test-bank-append-balance.js`, `AGENT_HANDOVER.md` §1B, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Member gender dropdown + profile save fix:** Register New Member and Update Member Profile use **Gender** dropdown (Male, Female, Decline to Specify). Fixed spurious **email already exists** on gender-only saves: portal email sync skipped when email unchanged; no duplicate check when login email already matches (admin/member email collision). Files: `auth-service.js`, `member-service.js`, `text-format.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Assurance production balance restored again ($16,241.55):** Dashboard showed **$16,113.55** / **465 rows** (drift after corrupted append). Re-ran `restore-assurance-ledger-production.js`; production verified **457 rows**, **$16,241.55** through **2026-07-08**. **Do not** re-upload July `stmt (8).csv`. Data fix via script (no git).
- **2026-07-09** — **Login hardening (follow-up):** Login forms use `method="post"` to block credential leakage in URL if JS fails. `bootApplication()` shows the correct portal screen immediately and catches startup errors. **Production:** `git push`.
- **2026-07-09** — **Login broken by app.js syntax error (hotfix):** Bad edit removed `function bankAppendTypeSelectHtml` header, causing `SyntaxError` on load. Entire UI JavaScript failed: wrong login screen on `/admin`, forms submitted as GET with credentials in URL, sign-in appeared dead. Fixed syntax + `initLoginFromUrlParams()` strips password from URL and prefills org/username. API login was unaffected. **Production:** `git push` immediately.
- **2026-07-09** — **Bank ledger product mode (all tenants):** §1B documents fail-closed append contract, source-of-truth model, and agent rules. **Payment name mappings** admin table adds **Default Type** column (tenant self-service; persisted in `default_ledger_type`). **CSV auto-sync** runs on cloud (`PFM_DATA_DIR`) only; local dev off unless `PFM_LEDGER_CSV_SYNC=1` (prevents stale DB overwriting reference CSV). **Apply button** disabled when opening/ending blocked or Review rows remain. Regression: `npm run test:bank-append`. Files: `member-payment-alias-service.js`, `cooperative-bank-ledger-csv.js`, `app.js`, `index.html`, `test-bank-append-balance.js`, `package.json`, `AGENT_HANDOVER.md`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Append safety: block ending mismatch + Saheed loan alias:** Import New Bank Activity now **refuses to apply** when projected ledger ≠ statement **ending** (server `bank-import-append.js` + UI `app.js`), not only when opening drifts. Payment alias **SAHEED SALAMI → Yomi Salami** seeds `default_ledger_type: loan_repayment` so July-style payments classify correctly on future appends (`member-payment-alias-service.js`, `import-format-service.js`). **Production:** `git push`; balance already **$16,241.55** from restore script.
- **2026-07-09** — **Assurance ledger restored to stmt ending ($16,241.55):** Production was **$16,177.55** (drift from bad append/sync). Re-ran golden master + July `stmt (8).csv` → **457 rows**, **$16,241.55** through **2026-07-08**. `build-assurance-reference-with-july.js` now parses stmt file + Saheed override; `restore-assurance-ledger-production.js` is one command (build + Full Ledger Refresh + ending check). Local DB synced. **Production:** data restore via script (no git required for balance); script/doc changes need `git push`.
- **2026-07-09** — **Repo sync:** Committed and pushed remaining local work (ledger audit/reconcile scripts, `build-assurance-reference-with-july.js`, assurance restore wrapper, bylaws seed) so `main` matches workspace. **Production:** `git push` (`bdcc85f` + follow-up).
- **2026-07-09** — **Pending applicants hidden + ledger reclassify/split (all tenants):** Members & Accounts lists only **active** members (`pending_approval` profiles stay under Forms & Documents → Membership Applications). Admin **Category** dropdown + **Split** on Contributions and Loan Repayment rows; adjustments persist in `ledger_adjustments` / `ledger_adjustment_lines` and re-apply on every Full Ledger Refresh. APIs: `POST /api/ledger-adjustments/reclassify`, `POST /api/ledger-adjustments/split`. Removed production test applicant **Testy Testy** via `remove-pending-applicant-production.js`. Files: `ledger-adjustment-service.js`, `import-bank-ledger.js`, `member-profile-service.js`, `balance-service.js`, `server.js`, `app.js`, `index.html`, `styles.css`, `schema.sql`, `database.js`, `USER-GUIDE.md`. **Production:** `git push` (code); Testy already deleted on live DB via API script.
- **2026-07-09** — **Saheed July classification preserved on restore:** `restore-assurance-ledger-production.js` no longer appends `stmt (8).csv` (that re-classified Saheed $500 as Member Deposit). New `build-assurance-reference-with-july.js` writes `cooperative-bank-ledger-reference.xlsx` with July rows and Saheed as **Loan Repayment**. Full Ledger Refresh uses that file only. Files: `build-assurance-reference-with-july.js`, `restore-assurance-ledger-production.js`, `USER-GUIDE.md`. **Production:** run build + restore scripts (data); `git push` for script changes.
- **2026-07-09** — **Multi-tenant ledger ops:** Removed Assurance-only balance warnings from `app.js` (no hardcoded 15,471.49 / 453 rows). Generic production restore: `scripts/restore-ledger-production.js --org <slug> --ledger <file> [--stmt <file>]`. `restore-assurance-ledger-production.js` is now a thin Assurance wrapper. UI/append copy uses "master ledger file" not "golden master". Files: `app.js`, `bank-import-append.js`, `restore-ledger-production.js`, `restore-assurance-ledger-production.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Append blocked when opening balance drifts:** Import New Bank Activity now **refuses to apply** when statement beginning does not match live ledger opening (server + UI). Prevents stacking July rows on a corrupted June base. Added `scripts/restore-assurance-ledger-production.js` (Full Ledger Refresh from golden master + optional stmt append). Files: `bank-import-append.js`, `app.js`, `USER-GUIDE.md`. **Production:** `git push` for UI block; run restore script for data fix.
- **2026-07-09** — **Full Ledger Refresh button tooltips:** Each action (Preview, Import, Sort & Download, Download Csv/Xlsx) has an **i** icon with hover/focus tooltip explaining source (upload vs live books) and whether it imports. Files: `index.html`, `styles.css`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Full Ledger Refresh UX:** Download buttons relabeled **Download Csv Ledger**, **Download Xlsx Ledger**, **Sort & Download Csv Ledger**. Added **Preview** (row count, ending balance, ledger warnings before import). Post-import warnings now stay visible in **Ledger warnings** below (removed misleading "expand the panel above"). Files: `bank-import-conflicts.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Reference ledger download file names:** CSV and xlsx downloads now always save as **cooperative-bank-ledger-reference.csv** and **cooperative-bank-ledger-reference.xlsx** (matching `data\` on PC). Buttons show exact file names; browser Save dialog suggests the same name for overwrite. Files: `cooperative-bank-ledger-csv.js`, `server.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Reference CSV/xlsx parity:** Downloaded `cooperative-bank-ledger-reference.csv` now uses the **same columns** as `cooperative-bank-ledger-reference.xlsx` (`#`, Date, ISO Date, Member, Description, Amount, Running Balance, Narrative, Ledger Type, Source). CSV parser reads reference-format CSV interchangeably with xlsx. Added **Download Reference Xlsx** on Full Ledger Refresh. Files: `cooperative-bank-ledger-csv.js`, `parse-bank-sources.js`, `bank-statement-parser.js`, `server.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Import preview: editable Type and Member:** Admin → Import → **Import New Bank Activity** preview now shows **Type** and **Member** dropdowns on **New** and **Review** rows (not Skipped). User corrections are sent as `rowOverrides` on apply. Skipped rows still require **Full Ledger Refresh** to reclassify. Files: `bank-import-append.js`, `server.js`, `app.js`, `styles.css`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-08** — **Assurance ledger fixed on production (Render):** Local DB rebuilt via `npm run pfm:import-bank` (453 rows, **$15,471.49**). Production **Full Ledger Refresh** via `scripts/push-ledger-to-production.js` — health now shows **453** `bankImportRows`, ending **$15,471.49** as of **2026-06-29** (was 583 rows). Code deploy **`715ba7c`**: auto-sync no longer overwrites `cooperative-bank-ledger-reference.xlsx` (CSV only). **Production:** `git push` (Render auto-deploy ~5–15 min). July activity: **Import New Bank Activity** with `stmt (7).csv` when ready.
- **2026-07-08** — **Bank ledger reference restored from golden master:** Root cause of reference ≠ master: **4 phantom duplicate rows** (+$603.20 through 6/29) plus **2 July test rows** (+$170.06) in reference only. Duplicates: second **-$16** monthly fee on **2023-04-03** and **2023-10-02**; second **+$317.60** mobile deposit on **2025-01-27** and **2025-02-18** (empty Member). Reference had been overwritten by `queueCooperativeBankLedgerCsvSync` from stale DB + agent hand-appends. **Fix applied locally:** copied `data/master-ledger/cooperative-bank-ledger-master.xlsx` → `cooperative-bank-ledger-reference.xlsx` and rebuilt `.csv` (**453 rows**, ending **$15,471.49**; **0 field diffs** vs master). **Production:** Admin → **Full Ledger Refresh** with restored xlsx (git push not required for data files).
- **2026-07-08** — **Handover: two-file bank ledger model (§1A corrected):** User confirmed golden **historical bank archive** is `data/master-ledger/cooperative-bank-ledger-master.xlsx` (453 rows, **$15,471.49**, 2023-01-23 through 2026-06-29) — **not** the same as `cooperative-bank-ledger-reference.xlsx` (app import file, corrupted by auto-sync). Built via `build-master-ledger.js` from `pre 2025.xlsx` + `stmt (6).csv`. Agents had conflated the two files in prior responses.
- **2026-07-08** — **Append import balance check fix:** Preview no longer flags a red **Balance mismatch** when ledger opening already differs from statement **beginning** (pre-period gap). Warning only when opening aligns but **new rows** fail to reach statement **ending**. UI shows statement beginning, pre-period gap note, or success when ending ties. Prior Assurance reconcile (phantom XXXXX rows, bank fees, proxy Zelle, xlsx ending **$15,471.49** on 6/29/2026) is **done** — do not re-diagnose. Bank ledger updates: **Admin → Import** only (no WinSCP). Files: `bank-import-append.js`, `app.js`. **Production:** `git push`.
- **2026-07-08** — **Agent note (Assurance ledger sync):** Do **not** tell user to WinSCP-upload for bank ledger. Established path since **2026-06-28** / **2026-07-01**: monthly **Import New Bank Activity** on live admin; full rebuild via **Full Ledger Refresh**. Proxy Zelle + xlsx corrections already shipped (`git push` + admin import). **Add New Transactions** button was `disabled` after preview when 0 new rows (or before Preview) but still looked active. Now always clickable: auto-runs Preview if needed, shows clear status (`No new transactions to add`, `need review`, etc.), labels count when ready (`Add New Transactions (2)`), resets on file change. Disabled buttons styled gray. Files: `app.js`, `index.html`, `styles.css`. **Production:** `git push`. Removed regex **Reference patterns** from admin UI (stays server-side). **Payment name mappings** table: Member + **Name on Bank Statement** (plain text); backend builds match patterns. Contribution/loan keywords remain editable comma-separated labels. Files: `member-payment-alias-service.js`, `import-rules-service.js`, `server.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-08** — **Import tab nested subsections:** **Bank Accounts and Import Settings** collapses **Registered Bank Accounts**, **Add Bank Account**, and **Edit Selected Account** (nested **Account Details** and **Classification Rules**). **Import New Bank Activity** nests **Download Import Template**. Files: `index.html`, `styles.css`. **Production:** `git push`.
- **2026-07-08** — **Bank import Phase 2 + Import tab UX:** All Import tab sections collapsed by default with explainer hints under each header. **Format-first parsers** per bank account (`auto`, CSV date/desc/amount, credit/debit, summary block, PFM template, OFX/QFX, custom column mapping). **Classification rules** (contribution/loan keywords, reference regex) and **payment name aliases** stored in DB and editable under **Bank Accounts and Import Settings**. Preview shows detected format and **statement ending balance** vs projected ledger. Books card shows primary account currency. New libs: `import-format-service.js`, `import-rules-service.js`, `member-payment-alias-service.js`. Files: `bank-import-append.js`, `statement-import-parser.js`, `bank-account-service.js`, `cooperative-books.js`, `import-fingerprint.js`, `database.js`, `schema.sql`, `server.js`, `index.html`, `app.js`, `styles.css`, `USER-GUIDE.md`. Tested locally: Assurance July stmt dedup (2 skipped), format `csv_summary_then_transactions`, balance check flags mismatch. **Production:** `git push` only.
- **2026-07-08** — **Bank accounts admin UI:** Import → **Bank Accounts and Import Settings** lists accounts, **Add Bank Account** form, **Edit Selected Account** (institution, label, currency, active dates, primary). Inactive accounts hidden from import dropdown. Files: `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-08** — **Append-only bank activity import:** Admin → Import → **Import New Bank Activity** uploads a bank statement or PFM transaction template; preview shows New/Skipped/Review; only new rows are inserted (fingerprint dedup). **Bank accounts** table (institution name, currency); org **date format** setting (MDY/DMY/YMD). Downloadable **Import Template** (CSV/xlsx) with required Date, Description, Amount, Type; Member required for member transactions. Full **Ledger Refresh** remains under Advanced. Tested locally with Assurance July 2026 stmt (Olawale $100, Gbanju $70.06). Docs: `USER-GUIDE.md`, `README.md`, `PEER-FINANCE-MANAGER.md`, `UPLOAD-DATA-TO-PRODUCTION.md`. Files: `bank-import-append.js`, `statement-import-parser.js`, `bank-account-service.js`, `import-template-service.js`, `import-fingerprint.js`, `transaction-import-types.js`, `cooperative-date-format.js`, schema/migrations, `server.js`, `index.html`, `app.js`. **Production:** `git push`.
- **2026-07-06** — **Public Pages plain-text editor:** Admin **Public Pages** tab uses collapsible **About Us** and **Bylaws** sections (collapsed by default). Cooperatives paste plain text (no HTML); PFM auto-formats public pages. Optional external website URL per section greys out built-in fields when the Cooperative already publishes online. Bylaws supports plain text plus optional PDF upload. **Production:** `git push` (`bff5e79`).
- **2026-07-06** — **Member report PDF mobile fit:** On phones, report viewer renders PDF pages to width-fit canvases (PDF.js) instead of iframe; full viewport height and scrollable pages. Desktop keeps iframe. **Production:** `git push`.
- **2026-07-06** — **Member report PDF viewer auth fix:** iframe could not send Bearer token, showed `Login required`. Viewer now fetches PDF via authenticated `fetch`, then displays blob URL in iframe. **Production:** `git push`.
- **2026-07-06** — **Member report PDF UI cache fix:** Netlify build cache-busts `app.js`/`styles.css`; no-cache headers. Report rows show **VIEW PDF REPORT** card; full-screen viewer (`z-index` 5000) with Back/Download. **Production:** `git push` (`b5dbd79`).
- **2026-07-06** — **Performance report overview date fix:** Member/admin summary no longer uses today's date. Overview is **stored when the report is generated** and served from the published report; fallback rebuild uses **month-end from period slug** (`2026-06` → Jun 30, 2026), not live ledger date. **Production:** `git push` (`06f69fd`).
- **2026-07-06** — **Member performance report UX:** Overview summary uses **latest published report as-of date** (not today). Report links labeled **View PDF Report** with tap-to-open hint. Full-screen PDF viewer with **Back to Member Portal** and **Download Report**. New `GET /api/me/cooperative-status-reports/:periodSlug/view` (inline PDF). **Production:** `git push` (`bff5e79`).
- **2026-07-06** — **Manual Record multi-column fields:** Forms inside each expanded Record section use a responsive grid (`auto-fit`, ~200px min) so fields like First/Middle/Last Name sit side by side; member pickers, addresses, and submit buttons stay full width. **Production:** `git push` (`bff5e79`).
- **2026-07-06** — **Manual Record collapse buttons:** Each Record tab section shows a **Collapse Section** button at the bottom when expanded (summary expands at top). Scrolls back to the section header on collapse. **Production:** `git push` (`bff5e79`).
- **2026-07-08** — **Meetings schedule form collapsed by default:** Admin → Meetings → **Schedule a Meeting** is a collapsible section (like Reminder Settings). Expands automatically when **Edit Details** is clicked. Files: `index.html`, `app.js`. **Production:** `git push`.
- **2026-07-08** — **Admin Email Send Audit:** Cooperative admins can open Meetings → **Email Send Audit** to see send batches (meetings, report publish, month-end), per-recipient Sent/Failed rows, and currently eligible recipients. New table `member_email_delivery_log`; APIs `GET /api/books/email-audit` and `GET /api/books/email-audit/batches/:id`. Older batches remain count-only until the next send. Files: `email-audit-service.js`, meeting/report notification services, `server.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-07** — **Membership apply return-to-origin:** `/c/{slug}/apply?from=about|bylaws` embeds FlexxForms on PFM; on submit, member returns to origin page; one-time thank-you flash. `publicApplyUrl` = `/c/{slug}/apply`. **Production:** `git push` (`43f3865`).
- **2026-07-07** — **BLUEHOST-EMAIL-RELAY-SETUP.md:** keystroke-level non-technical send-email walkthrough (mailbox, secret, upload, Render env, test).
- **2026-07-06** — **Bluehost email relay (no SendGrid):** `email-service.js` supports `EMAIL_RELAY_URL` + `EMAIL_RELAY_SECRET` (HTTPS to PHP on Bluehost); `bluehost-relay/pfm-mail-relay.php`; layman guide **BLUEHOST-EMAIL-RELAY-SETUP.md**. User declined SendGrid paid trial. **Production:** `git push` + upload PHP to Bluehost + Render env.
- **2026-07-06** — **EMAIL-NOTIFICATIONS-SETUP.md:** Bluehost DNS field mapping for SendGrid (Host Name vs Alias to; `em6813` example).
- **2026-07-06** — **EMAIL-NOTIFICATIONS-SETUP.md:** added "Where You Left Off" resume section; meeting announcement/reminder rows in auto-email table. Record tab sections (Register Member, Update Profile, Registration Fee, bank balances, etc.) stack in a single column instead of a 4-column grid, so expanding one section no longer stretches empty siblings on the same row. Collapsible `<details>` behavior unchanged. **Production:** `git push` (`1ab6c83`).
- **2026-07-06** — **FlexxForms `answers[]` parser (partner fix):** FlexxForms now ships labeled `answers[]` on `form.submitted` webhooks and via `GET /api/integrations/forms/{formId}/submissions/{submissionId}`. PFM parses applicant vs next-of-kin by **lowest/second `fieldIndex` on name rows** (not generic `firstName`/`lastName` scan). Reprocess fetches full submission when stored webhook lacks `answers[]`. Legacy label walk remains as fallback. **Production:** `git push` (`e18710e`).
- **2026-07-06** — **FlexxForms sparse webhook guard:** Post-deploy retest confirmed webhook has no labeled answers and integrations API fetch failed; PFM wrongly imported Mia Testy from generic `firstName`/`lastName`. Reprocess/webhook now **refuse** to create or update profiles when payload is sparse and API fetch fails. Escalation to FlexxForms required for full answers in webhook or working GET submission API. **Production:** `git push`.
- **2026-07-06** — **FlexxForms webhook field enrichment:** Reprocess appeared to do nothing because stored `form.submitted` webhook often has only submission metadata (generic `firstName`/`lastName` keys), not labeled form answers. **Fix:** Reprocess and new webhooks fetch full submission from FlexxForms integrations API when stored payload has fewer than 4 core fields; deeper label/field-id parsing; clearer admin status message. **Production:** `git push`.
- **2026-07-06** — **Admin delete membership applications:** Forms & Documents → Membership Applications **Delete** removes FlexxForms submission row; also deletes linked **pending approval** prospective member when no ledger transactions or loans. **Production:** `git push`.
- **2026-07-06** — **FlexxForms membership payload parsing fix:** webhook extractor was flattening entire JSON blindly — next-of-kin `firstName`/`lastName` could overwrite applicant (e.g. Mia Testy instead of applicant); generic walk corrupted `fields` arrays; FlexxForms field labels (`First Name`, `Email`, `Current Address: …`) not matched. Parser now uses labeled fields from the FlexxForms webhook first, scopes applicant vs next-of-kin buckets, maps Assurance membership form question text. Admin **Reprocess Data** button re-applies stored `payload_json` to linked profile. **Production:** `git push`.
- **2026-07-06** — **FlexxForms CUSTOM_STATE fix (partner response):** User retest showed red banner “Submission: CUSTOM_STATE is not defined” after signature + checkboxes complete. FlexxForms root cause: JS typo in US address submit handler (`CUSTOM_STATE` undefined); validation passed but submit crashed before API call. Fix deployed (commit `2217f7c`, platform-wide for `/p/` forms with address fields). **PFM action:** hard refresh and retest; expect Submitting… → success → `form.submitted` webhook → Membership Applications row. No PFM code change.
- **2026-07-06** — **FlexxForms platform fix (partner response):** FlexxForms confirmed zero server-side submissions for Assurance form `8d5e2b33-922e-4044-ad5c-6fe8bb0473d5` (July 5–6 tests never reached `POST /api/submissions/public/{formId}`). Root cause: validation/submit feedback was iframe-only on standalone `/p/{formId}` — silent client-side block. They deployed platform-wide fix: visible Submitting… banner, validation error summary above Submit, country dropdown US default (no stuck Loading…). Verifying webhook URL/secret on Assurance workspace. **PFM action:** user retest per steps below; confirm Membership Applications + Render `[flexxforms-webhook]` logs after successful submit. No PFM code change required unless retest fails.
- **2026-07-06** — **FlexxForms submit diagnosis (post-redirect retest):** User confirms Submit still does nothing on standalone `https://flexxforms.netlify.app/p/8d5e2b33-922e-4044-ad5c-6fe8bb0473d5` (not a PFM iframe issue). Production API returns correct `membershipFormId` and URL; webhook endpoint live (`400` without valid HMAC/org). No evidence submissions reach PFM (admin Membership Applications empty). Escalation drafted for FlexxForms. Added `[flexxforms-webhook]` structured console logging on successful webhook handling in `server.js` for Render log diagnosis. **Production:** `git push` for logging only; submit fix is FlexxForms-side.
- **2026-07-06** — **Apply: redirect to FlexxForms (no embed):** removed broken iframe apply page. `/c/{slug}/apply` and all **Apply for Membership** links go directly to `https://flexxforms.netlify.app/p/{formId}`. Server 302 on Render; Netlify shows brief redirect via cooperative-public.html. Webhook unchanged. **Production:** `git push`.
- **2026-07-06** — **Apply page infinite loading fix:** `backTop` was referenced before `const` declaration (TDZ ReferenceError), so apply page script never reached `loadApplyForm()`. **Production:** `git push`.
- **2026-07-06** — **AGENT_HANDOVER:** FlexxForms partner messages: wait for user post-deploy retest before drafting escalations (rule §0 item 5).
- **2026-07-06** — **FlexxForms public SDK + primary full-window CTA:** embed.js `data-embed-mode="public"` with postMessage + `FlexxForms.on` handlers; iframe scrolling enabled; taller defaults; **Complete Application (Recommended)** button opens `/p/{id}` directly; hide back-to-top on apply page. **Production:** `git push`.
- **2026-07-06** — **FlexxForms official embed pattern:** adopt FlexxForms guidance: direct `/p/{formId}` iframe (no query params, no embed.js); `flexxforms:resize` / `flexxforms:completed` / `flexxforms:error` / `flexxforms:submitting` postMessage on apply page; status banner + success hides iframe. **Production:** `git push`.
- **2026-07-06** — **FlexxForms submit restore:** direct `/p/` iframe omits Submit (FlexxForms platform). Restored `embed.js` with `data-form-path="p"`, tall `data-min-height`, dedupe guard, and **Open Application in Full Window** fallback on apply page. **Production:** `git push`.
- **2026-07-06** — **FlexxForms submit button clip fix:** today's `/p/` embed regressed: `scrolling="no"` + resize height that omitted the fixed submit bar hid Submit below the iframe fold. Restored max-height tracking, +120px submit footer padding, scrollable fallback until resize confirms, `/p/{id}?embed=1` (resize only; not `/embed`), taller desktop default (~3000px). **Production:** `git push`.
- **2026-07-06** — **AGENT_HANDOVER:** mandatory rule: FlexxForms partner messages always in one copy-paste code block; § FlexxForms integration template (multi-tenant, all orgs). Outstanding task #7 broadened beyond Assurance.
- **2026-07-06** — **FlexxForms public embed (permanent):** dropped `embed.js` for cooperative apply forms. Direct iframe to `/p/{formId}` with no `?embed=1` or `/embed` path (only mode that hides PlacementExpress / "Back to deal"). Resize + completion via postMessage. **Production:** `git push`.
- **2026-07-06** — **FlexxForms embed fix:** use `data-form-path="p"` (public form URL, no PlacementExpress / "Back to deal" chrome). Mount embed.js once after script load to prevent duplicate forms. **Production:** `git push`.
- **2026-07-06** — **FlexxForms embed.js (July 2026):** membership and loan apply flows use FlexxForms host `embed.js` (`data-form-id` + auto-resize) instead of static iframes on `/c/{slug}/apply`, legacy `/?apply=`, and member loan apply. `mountFlexxFormsEmbed()` in `flexxforms-embed.js`; success UI on completed event. Webhook unchanged. **Production:** `git push`.
- **2026-07-05** — **Record tab collapsible sections:** all Record forms and recent lists use collapsed `<details>` by default; Register Member / Update Profile auto-expand when opened from Members tab. **Production:** `git push`.
- **2026-07-05** — **Meetings tab layout:** scheduled meetings list moved to top of Meetings page (form and reminder settings below). **Production:** `git push`.
- **2026-07-05** — **Admin nav tabs:** moved Public Pages, Status Report, Meetings, Forms & Documents, and Subscription off the Cooperative Books scroll stack into dedicated top-level tabs (lazy-loaded). Cooperative Books is dashboard cards only. **Production:** `git push`.
- **2026-07-05** — **Apply signing tip sizing:** reduced callout font/padding so it matches FlexxForms field scale. **Production:** `git push`.
- **2026-07-05** — **Apply page signing tip:** landscape rotation note above membership form on `/c/{slug}/apply`. **Production:** `git push`.
- **2026-07-05** — **Apply embed landscape fix:** removed broken fullscreen landscape mode (was hiding entire page). Form iframe stays tall in both orientations; page scrolls normally. **Production:** `git push`.
- **2026-07-05** — **Apply form embed overhaul:** use FlexxForms public form URL `/p/{id}` (removes erroneous "Back to deal" partner chrome from `/embed?embed=1`). Iframe opens at full form height (~2800px mobile) so the form is not clipped; page scrolls as one document. Apply hero hidden. Landscape: entire screen goes to form only. **Production:** `git push`.
- **2026-07-05** — **Apply embed landscape/signature:** on mobile landscape, apply shell goes full viewport and iframe resizes to `visualViewport` height; orientation/viewport listeners reset embed height and notify FlexxForms. `allow="fullscreen"` on iframe. **Production:** `git push`.
- **2026-07-05** — **Apply embed scroll fix:** FlexxForms embed URLs now include `?embed=1` (required for `flexxforms:resize` postMessage). `flexxforms-embed.js` keeps iframe scrollable until resize arrives; fallback height if resize missing. Apply page card `overflow: visible`. **Country dropdown "Loading…":** FlexxForms-side. **Production:** `git push`.
- **2026-07-05** — **Apply embed mobile height:** `flexxforms-embed.js` listens for FlexxForms `flexxforms:resize` postMessage and grows the iframe to fit the form (no nested scroll). Apply page hero compact on mobile. **Country dropdown "Loading…":** FlexxForms-side (lazy country library in embed); needs FlexxForms default US on address field or chunk-load fix. **Production:** `git push`.
- **2026-07-05** — **About hero section jumps:** Membership, Goals, and Leadership chips on `/c/{slug}/about` are now anchor buttons that scroll to `#membership`, `#goals`, and `#officials`; static chips removed on Bylaws/Apply. **Member login:** removed duplicate standalone Apply link (kept single link in public org links row). **Production:** `git push`.
- **2026-07-05** — **Public Apply for Membership pages:** `/c/{slug}/apply` served alongside About/Bylaws; nav, hero CTAs, footer links, and in-page **Become a Member** promos on About/Bylaws; FlexxForms iframe on apply page. Login/member footers link to apply when form is published; `/?apply={slug}` redirects to `/c/{slug}/apply`. Netlify redirect added in `scripts/netlify-build-config.js`. Files: `cooperative-public.html`, `cooperative-public.css`, `server.js`, `cooperative-public-pages-service.js`, `flexxforms-service.js`, `app.js`, `index.html`. **Production:** `git push`.
- **2026-07-05** — **FlexxForms membership pipeline:** public apply link (`/?apply={slug}`), webhook `form.submitted` auto-creates pending member profile (`cooperative_account_status: pending_approval`), admin **Membership Applications** panel with fee/deposit checklist, **Approve Member** gated on membership fee ($100) + initial contribution ($100 deposit). Files: `lib/flexxforms-membership-service.js`, webhook handler, routes, admin UI. **Production:** `git push`.
- **2026-07-04** — FlexxForms **document templates API:** `GET /integrations/documents/templates` merged into admin catalog load; forms vs master document assign targets; loan signing uses `signingUrl` / `signingSessions` (not `/embed/{id}` fallback). Webhook handles `document.updated` when status completed. FlexxForms fixed Assurance webhook URL to Render. **Production:** `git push`.
- **2026-07-04** — FlexxForms admin **Published in FlexxForms** catalog: card layout with UUID, four Assign targets (membership, loan, guarantor, borrower), linked state; removed browser `prompt()`. **Production:** `git push`.
- **2026-07-04** — FlexxForms **Load Forms** error copy: clarifies workspace must be connected (Retry → Ready badge) before listing forms; button disabled until provisioned. **Production:** `git push`.
- **2026-07-04** — **FlexxForms Assurance admin email (again):** logged-in session (`yinka@…`) was overriding canonical Assurance FlexxForms email in UI and retry. Assurance slug now always resolves to `assuranceflex@eworkchop.com`; startup backfill also syncs `flexxforms_admin_email`. **Production:** `git push`.
- **2026-07-04** — **FlexxForms Assurance admin email fix:** startup backfill had set `admin_email` to first org admin (`yinka@eworkchop.com`) before Assurance override could run; Load Forms failed with no API key. Assurance now always gets `assuranceflex@eworkchop.com`; retry uses logged-in admin email first. **Production:** `git push`.
- **2026-07-04** — **FlexxForms retry-provision fix (cooperative admin):** legacy orgs had NULL `organizations.admin_email`, so Retry FlexxForms Setup failed before calling FlexxForms ensure. Added `admin_email` on registry `organizations`, `resolveFlexxFormsAdminEmail()` (org row then logged-in admin session), startup backfill from first org admin user (+ Assurance `assuranceflex@eworkchop.com`), register-organization persists admin email before provision, `applyEnsureResponse` fills form/doc ids from `readyToUse` only when empty (preserves saved membership form id). Files: `lib/flexxforms-service.js`, `lib/flexxforms-routes.js`, `lib/organization-service.js`, `lib/auth-service.js`, `lib/auth-routes.js`. **Production:** `git push` only.
- **2026-07-03** — **FlexxForms Plan B:** each Cooperative gets its own FlexxForms workspace on register (`POST /platform/workspaces/ensure`). Credentials on registry `organizations` (secrets server-only). Admin **Manage Forms & Documents** (open FlexxForms, save form/doc ids, retry provision, list forms). Member loan apply embed; public membership apply from member login. Loan guarantor/borrower agreements via integrations API + in-app iframe. Webhook `POST /api/flexxforms/webhook` (raw body + HMAC). Env: `FLEXXFORMS_API_BASE`, `FLEXXFORMS_PROVISIONING_SECRET` on **Render** (API). Files: `lib/flexxforms-service.js`, `lib/flexxforms-routes.js`. **Production:** `git push` + set Render env vars if not already.
- **2026-07-03** — Product page Work Chop footer: compact content-sized badge (`width: fit-content`, smaller logo/padding) instead of full-width banner; mobile stacks logo above text. **Production:** `git push`.
- **2026-07-03** — Headings and section leads use full content width **app-wide** (`product.css`, `styles.css`, `cooperative-public.css`, legacy `public/styles.css`): no artificial `max-width` on titles/hints/leads. Form/input layout widths unchanged. Hero: five dashboard mock cards; mobile/tablet grid shows all cards. **Production:** `git push`.
- **2026-07-03** — **Cooperative capitalization enforced app-wide for all tenants:** `capitalizeCooperativeWording()` in `text-format.js`; public About/Bylaws sanitize + save; API error JSON middleware; HTML builder `esc()`; seed v12. **Production:** `git push`; Render restart re-seeds public pages.
- **2026-07-03** — Product page polish: workflow step 4 real-time copy; centered Work Chop footer (mobile stack); trust section color cards + title case; **Title Case rule** extended (lowercase 2–3 letter words; capitalize **Cooperative**); footer tagline update. Bylaws nested Roman lists under letter items (seed v10). **Production:** `git push`.
- **2026-07-02** — Product page (`/product`), `PEER-FINANCE-MANAGER.md`, bylaws HTML rebuild (structured lists/sections from PDF source), public content seed v9. **Em/en dash purge** in user-facing UI (`product.html`, `app.js`, `index.html`, emails, timezone labels, ledger CSV headers): colons per `UI-COPY-STANDARDS.md`. **Production:** `git push`. Admin → Cooperative Books → **Meetings & Announcements** — schedule drafts, announce to member portal + email, cancel, automatic reminders (per-org). Member portal **Cooperative Meetings** panel. Files: `cooperative-meeting-service.js`, `meeting-notification-service.js`. **Production:** `git push`.
- **2026-07-01** — Member portal UX: hide tab nav and redundant **My Account** heading (members land on account content directly); mobile header declutter; logout power icon. **Production:** `git push`.
- **2026-07-01** — **Proxy Zelle deposit fixes:** import credits beneficiary named after `for …` in description (not Zelle payer); pre-import **Ledger warnings** on Admin → Import (proxy mis-credit + contribution vs loan type); regression script `node peer-finance-manager/scripts/test-ledger-import-audit.js`. Corrected `cooperative-bank-ledger-reference.xlsx` (Ejiro/Titilope proxy rows; Oluwabiyi Mar 23 $100.13 → deposit). Utility scripts: `fix-proxy-deposit-members.js` (xlsx Member column), `fix-proxy-deposit-balances.js` (local DB one-shot). **Production:** `git push` then **Admin → Import** upload corrected xlsx (no WinSCP for bank ledger).
- **2026-06-29** — Bank import conflict handling with **Download missing rows CSV**; **Sort selected file & download** and **Download sorted reference CSV** (date-ordered `cooperative-bank-ledger-reference.csv` from upload or live books). Auto-sync reference CSV on manual entries. **Production:** `git push`.
- **2026-06-28** — Fix bank import upload error (`importBankLedger is not a function`) — circular require between `bank-import.js` and `import-bank-ledger.js`; lazy-load import inside `runBankImportFromUpload`. **Production:** `git push`.
- **2026-06-28** — **Admin bank ledger import on live site:** Admin → Import → **Bank Ledger Import** uploads cooperative workbook (.xlsx) and optional bank statement (.csv); updates production DB immediately (no WinSCP/Manual Deploy). API: `POST /api/bank-import/run`. Month-end auto-publish toggle on Cooperative Books. **Production:** `git push`.
- **2026-06-28** — Added **EMAIL-NOTIFICATIONS-SETUP.md** (layman steps to enable SMTP on Render for member report emails).
- **2026-06-28** — Olawale George WPForms row added to CSV and imported locally (`f5ec8e6`). **UPLOAD-DATA-TO-PRODUCTION.md** clarifies Manual Deploy is required after every WinSCP upload (stale DB connection). Fixed `pfm:profiles` script org context.
- **2026-06-27** — Member report email notifications: SMTP on Render sends reminders on the **last day of each month** and when a cooperative status report is **published** (profile email or member login email). Env: `SMTP_*`, `MEMBER_PORTAL_URL`. Deduped in `member_report_email_log`. **Production:** `git push` + Render env vars.
- **2026-06-27** — Monthly status report "as at" date: manual admin **Generate Report** uses **today's date** (not month-end); scheduled auto-generate at month end still uses the last calendar day. Dashboard preview matches. **Production:** `git push`.
- **2026-06-26** — Production data upload reliability: after WinSCP replaces `peerfinance.db`, **Manual Deploy** is required so the running Node process reopens the file (stale in-memory SQLite connection showed old Cooperative Books totals while disk/Shell were correct). Code: auto-remove stale `.wal`/`.shm` on open; do not restore from `peerfinance.seed.db` when live DB is newer; `/api/health` includes ledger probe (`latestTransaction`, `bankImportRows`, `dbSize`). Docs: **UPLOAD-DATA-TO-PRODUCTION.md** Step 4 (sidecars + seed). **Production:** `git push`.
- **2026-06-26** — Title Case backfill script: `npm run pfm:normalize-profiles` (dry-run) / `pfm:normalize-profiles:apply`. After apply locally, WinSCP upload + Manual Deploy.
- **2026-06-18** — Monthly Cooperative Status Report: per-organization PDF (not Assurance-specific); admin toggles for auto-generate at month end and auto-publish to member portal; manual Generate / Publish / Download on Cooperative Books; members see published reports on My Account. Storage: `data/organizations/{slug}/reports/cooperative-status/`. Scheduler runs all orgs every 6 hours. **Production:** `git push` only.
- **2026-06-18** — Member biodata Title Case: `peer-finance-manager/lib/text-format.js` normalizes names on create/update/import; display path formats legacy DB rows. WPForms import keeps raw `applicationName` for ledger matching. **Deployed:** `2ce0dd7` (`git push`).
- **2026-06-21** — Typography hierarchy: section headers larger/bolder than description (`.subtle`) text app-wide.
- **2026-06-21** — Agreed Loan Repayment Schedule: removed empty Payment column; balance reduces by interest plus principal each period.
- **2026-06-21** — Loan repayment **Balance** now tracks **principal still owed** (matches Paid status); repayments list newest-first. Fixes paid loans showing non-zero balance when total payable included unearned scheduled interest.
- **2026-06-21** — Loan account UX: **Agreed Loan Repayment Schedule** collapsed by default (no Due column; Balance column); actual repayments show running **Balance**; active loans expanded, paid loans collapsed.
- **2026-06-21** — Strengthened continuous documentation: `.cursor/rules/continuous-documentation.mdc` (`alwaysApply`); §0 self-instructing rules — agents must update docs in the same turn as every change; user must never need to ask for doc updates.
- **2026-06-21** — Admin can upload member profile photos from **Members & Accounts** (`POST /api/members/:id/photo`); members retain self-service upload/update. **Production:** `git push` only.
- **2026-06-19** — Fixed member profile photo upload: restore org context after multer async parse (was "No organization selected"); mobile Upload Photo button styled as primary full-width.
- **2026-06-19** — Full documentation sync: all project docs updated to match codebase; §0 strengthened with continuous documentation rule.
- **2026-06-19** — Fixed Gbanju alias (`GBANJU P ARUWAYOOBE`); CD balance updated to $7,211.82 with term metrics and **Expected CD Interest** dashboard card; bank re-import now 0 skipped rows (57 loan repayments).
- **2026-06-19** — Bank import through 2026-06-16: merged 3 new BoA deposits (Lolu $50, Mutiu $100.04, Clement $100.02) into `data/bank-statement-2026.csv`; ran `import-bank-ledger.js` (450 bank_import txs, last date 2026-06-16). **Production:** WinSCP upload `data/` → Render `/var/data` + Manual Deploy required.
- **2026-06-19** — Added USER-GUIDE, UPDATE-AND-PUBLISH, UPLOAD-DATA-TO-PRODUCTION, immutable doc rules (§0). Production live on Netlify + Render.
- **2026-06-18** — Member profile portal UX (`c8521cc`): collapsible **Membership Biodata** and **Emergency Contact**; mobile-friendly layout; inline labels (`Middle Name:`, `Account Status: Active`). **Production:** `git push` only.
- **2026-06-18** — Member self-service (`5041977`): profile biodata view, emergency contact edit, optional photo upload (`member-self-service.js`); admin **Cooperative Books** CD metrics; UI copy standards (Title Case, no em dashes).
- **2026-06-18** — Bank ledger import wired: `peer-finance-manager/lib/import-bank-ledger.js` + `npm run pfm:import-bank` merges `All deposits.xlsx` + `data/bank-statement-2026.csv` into SQLite with **real bank dates** (deposits, withdrawals, loan repayments, expenses, CD transactions).
- **2026-06-18** — Date display fix: `formatDate()` / `formatDisplayDate()` parse `YYYY-MM-DD` as local calendar dates (fixes DOB and transaction dates showing one day early in US time zones). Files: `peer-finance-manager/public/app.js`, `lib/loan-statement-generator.js`. **Production:** `git push` only.
- **2026-06-18** — Mobile My Account: **Description** column hidden by default on small screens; **Show Descriptions** / **Hide Descriptions** toggle on member portal. **Production:** `git push` only (verify committed).
- **2026-06-13** — Cloud deploy: Render API + Netlify UI; multi-org auth; member portal with running balances and monthly PDFs; Puppeteer Chrome install on Render for PDFs; data upload via WinSCP to `/var/data`.
- **2026-06** — Multi-organization registry, per-org SQLite, separate login portals (`/member`, `/staff`, `/admin`), manual Record tab, member credential provisioning.
- **2026-06-30** — **Assurance bank ledger golden reconcile (RESOLVED):** `build-master-ledger.js` merged `pre 2025.xlsx` + `stmt (6).csv` into **`data/master-ledger/cooperative-bank-ledger-master.xlsx`** — **453 rows**, last date **2026-06-29**, ending **$15,471.49** (matches BoA). User asked to **keep this single historical archive** separate from the app import file. June 2026: **13 transactions, $2,254.12**. Also refreshed `cooperative-bank-ledger-reference.xlsx` for import (later corrupted by auto-sync — see §1A).

---

## 1A. Assurance bank ledger — canonical record (mandatory read)

**Purpose:** Stop agents from re-opening resolved reconcile work, conflating two different files, or blaming the user. Read this **before** any balance-mismatch diagnosis or “re-upload your xlsx” guidance.

### Two different files (do not conflate)

| File | Role | Status |
|------|------|--------|
| **`data/master-ledger/cooperative-bank-ledger-master.xlsx`** | **Historical bank archive** — single reconciled copy of all BoA transactions the user asked to keep after the 6/30/2026 exercise. **Read-only reference.** | ✅ **Golden** (verified 2026-07-08) |
| **`data/cooperative-bank-ledger-reference.xlsx`** / `.csv` | **App import file** — uploaded via Admin → **Full Ledger Refresh** to rebuild production DB. Also auto-synced from DB (dangerous). | ✅ **Restored** (453 rows, **$15,471.49**, matches master 2026-07-08) |

### Golden historical archive (RESOLVED — do not re-diagnose)

| Field | Value |
|-------|--------|
| **Path (PC)** | `C:\Users\yinka\Documents\AssurCoop\data\master-ledger\cooperative-bank-ledger-master.xlsx` |
| **Row count** | **453** |
| **Date range** | **2023-01-23** through **2026-06-29** |
| **Ending checking balance** | **$15,471.49** (matches BoA) |
| **Sources merged** | `C:\Users\yinka\Downloads\pre 2025.xlsx` (pre-2025 history) + `stmt (6).csv` (Jan 2025 through 6/29/2026) |
| **How it was built** | `peer-finance-manager/scripts/build-master-ledger.js` |
| **June 2026 activity** | **13 rows, $2,254.12** — matches June bank stmt exactly |

**Resolved items (closed — never cite as open gaps):** phantom `XXXXX` duplicate NFCU rows (~$400); duplicate monthly bank fees; proxy Zelle mis-credits (Ejiro/Titilope); pre-2025 bank charges incorporated; June stmt tie-out to **$15,471.49**.

### App import file state (July 2026 — canonical)

| Field | Value |
|-------|--------|
| **Rows** | **457** (453 master through **2026-06-29** + **4** July 2026) |
| **Ending checking balance** | **$16,241.55** through **2026-07-08** (matches `stmt (8).csv`) |
| **July stmt** | `C:\Users\yinka\Downloads\stmt (8).csv` — beginning **$15,471.49**, credits **$770.06** |
| **Saheed 7/8 $500** | **Loan Repayment** → **Yomi Salami** (override; stmt text has no "loan") |

### Standard restore (admin UI — no special scripts)

When dashboard ≠ **$16,241.55** or ledger is below statement beginning:

1. **Full Ledger Refresh (Advanced):** upload `data/master-ledger/cooperative-bank-ledger-master.xlsx` → Preview → Import Bank Ledger. Expect **453 rows**, **$15,471.49** through **6/29/2026**.
2. **Import New Bank Activity:** upload `stmt (8).csv` (or latest cumulative July export) → Preview (4 **New**) → Add New Transactions. Expect **457 rows**, **$16,241.55** through **7/8/2026**. Saheed $500 → **Loan Repayment** / Yomi Salami (payment alias Default Type).

**Rest of July / any month:** re-upload cumulative stmt (period start → today); duplicates **Skipped**, only **New** rows apply (§1B).

Ops/API equivalent (same two steps): `restore-ledger-production.js --org assurance --ledger <master.xlsx> --stmt <july.csv>`

### Ops shortcut (optional — agents only)

`restore-assurance-ledger-production.js` pre-merges master + July into one reference xlsx then Full Ledger Refresh. **Not required** when payment aliases and append safety are deployed (2026-07-09+).

### Restore procedure (historical base only)

1. **Do not edit** `data/master-ledger/cooperative-bank-ledger-master.xlsx` (golden archive).
2. For **July+** activity after a bad base, use **standard restore** above (Full Ledger Refresh master, then Import New Bank Activity).
3. Confirm dashboard **Ledger Checking Balance: $16,241.55** as of **2026-07-08**.

```powershell
# Regenerate master if needed (does not touch golden copy if you copy output manually):
cd peer-finance-manager
node scripts/build-master-ledger.js "C:\Users\yinka\Downloads\pre 2025.xlsx" "C:\Users\yinka\Downloads\stmt (6).csv"
# Golden copy already at: data\master-ledger\cooperative-bank-ledger-master.xlsx
```

### Agent rules (non-negotiable)

| Do | Do not |
|----|--------|
| Treat **`master-ledger/cooperative-bank-ledger-master.xlsx`** as the reconciled historical archive | Call `cooperative-bank-ledger-reference.xlsx` the “historical bank records file” |
| Use **Full Ledger Refresh** (master xlsx) then **Import New Bank Activity** (stmt) when base is wrong | Tell admins to run Assurance-only wrapper scripts for normal resets |
| Verify: **457 rows**, ending **$16,241.55**, last **2026-07-08** (baseline through 7/8) | Re-diagnose from scratch when §1A already has the answer |
| **July interim + all months:** cumulative stmt upload (period start → today); fix Type/Member in preview if needed | Re-upload to "fix" skipped/wrong rows (use Full Ledger Refresh or Books → Category) |
| Document every ledger touch in **§ Changelog same turn** | Blame user for dashboard drift |

---

## 1B. Bank ledger product mode (all tenants — mandatory read)

**Purpose:** Tenant-specific rescue scripts (e.g. Assurance §1A) are **recovery only**. **Every** independent Cooperative admin must be able to trust **Import New Bank Activity** without agent intervention. Append logic lives only in generic libs (`bank-import-append.js`, `import-fingerprint.js`, shared admin UI). **No** tenant slug, balance, or row-count checks in product code.

### Tenant isolation

| Property | Behavior |
|----------|----------|
| Database | One isolated `peerfinance.db` per org (`runWithOrg` / session org slug) |
| Dedup fingerprints | Per `bank_account_id` within that org's DB |
| Payment aliases / rules | Per-org settings in admin UI |
| Regression test | Unit checks are tenant-agnostic; optional `--org <slug> --stmt <file>` live preview |

### Source of truth

| Layer | Role |
|-------|------|
| **Production DB** (`transactions` table) | **Authoritative** for dashboard balance, member accounts, statements |
| **Master ledger file** (uploaded via Full Ledger Refresh) | **Rebuild input** for initial load or full correction |
| **Monthly bank statement** (append upload) | **Delta input** for new activity only |
| **`cooperative-bank-ledger-reference.xlsx`** | **Export/download** of live books; **not** a second ledger to edit by hand |

### Append contract (fail-closed — every tenant)

1. **Ledger-short block:** refuse apply only when live ledger balance **before** new rows is **below the opening anchor** (missing history). The anchor is statement **beginning plus the net of Skipped rows** (period activity already in the ledger), so a mid-period debit (check, loan disbursement) that pulls the balance below the period opening does **not** block. With no skipped rows the anchor is the raw statement beginning. Run **Full Ledger Refresh** first when truly short.
2. **Cumulative re-upload (allowed — every tenant):** when the ledger is **above** statement beginning because rows from the same period are already imported (normal for in-month interim uploads), append is **not** blocked. Re-upload the statement from **period start through today** as often as needed. Rows already in the ledger show **Skipped**; only **New** rows apply.
3. **Ending block:** refuse apply when **ready** rows exist and **projected ledger** after new rows ≠ statement **ending**.
4. **Preview corrections:** admin sets **Type** and **Member** on New/Review rows before apply.
5. **Payment name mappings:** each row can set **Default Type** when bank text has no contribution/loan keyword (e.g. Zelle payer name only). PFM also learns Zelle/bank payer names from attached deposits and matches a unique first name to a ledger member (tenant-agnostic; not a hardcoded alias list).
6. **Dedup:** fingerprints + `INSERT OR IGNORE` on `import_fingerprint` (unique index). Re-uploading the same statement never creates duplicate rows.

### Auto-sync (local vs cloud)

- **Cloud (Render, `PFM_DATA_DIR` set):** after import/append/manual entry, CSV export sync runs from DB (xlsx never auto-overwritten).
- **Local dev:** CSV auto-sync **off** by default so a stale local DB cannot overwrite `data/cooperative-bank-ledger-reference.csv`. Opt in: `PFM_LEDGER_CSV_SYNC=1`.

### Regression test (any org)

```powershell
npm run test:bank-append
npm run test:member-bank-attach
# Optional live preview for any org:
node peer-finance-manager/scripts/test-bank-append-balance.js --org <slug> --stmt <path.csv>
```

Asserts alias classification, unique first-name Zelle attach, first-deposit membership fee on bank import, skipped preview member/notes, cumulative re-upload (ledger above statement beginning), ending tie-out when new rows exist, and idempotent re-upload when all rows skipped.

### Bank Reconcile Status (every tenant)

**Purpose:** Catch ledger drift **without** Assurance-only row counts or agent scripts. Each tenant's DB stores the last **verified** bank state after a successful import.

| When anchor is saved | `full_refresh` after **Full Ledger Refresh**; `append` after **Import New Bank Activity** when statement ending ties ledger (including idempotent re-upload with 0 new rows). |
| Stored in `cooperative_settings` | `bank_reconcile_balance`, `bank_reconcile_as_of`, `bank_reconcile_bank_import_rows`, `bank_reconcile_verified_at`, `bank_reconcile_source`, `bank_reconcile_label` |
| **Reconciled** | Live `bank_import` row count = anchor count **and** ledger balance through anchor as-of = anchor balance (±$0.02). |
| **Out of Sync** | Row count or balance at anchor date drifted since last verified import (phantom rows, bad append, manual DB edit, stale restore). |
| **Not Verified** | No anchor yet (new tenant or pre-feature DB). Clears on next successful import. |
| Dashboard | Cooperative Books card **Bank Reconcile Status** (amber when out of sync). |
| Ops | `GET /api/health` → `ledger.bankReconcile` (Assurance probe today; pattern is per-org in books API). |
| Regression | `npm run test:bank-reconcile` |

**Agent rule:** If status is **Out of Sync**, do **not** claim the ledger is correct. Use standard admin workflow (Full Ledger Refresh + append) or documented restore script; successful import refreshes the anchor.

### Reference file vs live DB (never stale-into-DB)

| Rule | Behavior |
|------|----------|
| **Authoritative** | Production `peerfinance.db` `transactions` table |
| **`cooperative-bank-ledger-reference.csv` on Render** | **Export only** — rewritten from live DB after every import, append, and reclassify (`queueCooperativeBankLedgerCsvSync`). **xlsx is never auto-overwritten.** |
| **Reclassify/split rebuild** | Uses **live DB rows** (`loadBankTransactionsFromDb`), not the on-disk reference file. Fallback to file only when DB has zero bank rows. |
| **Server startup** | Exports DB → CSV only (`server_startup` sync). **Does not** read reference file into DB (removed dangerous `syncMissingBankLedgerRows` on boot). |
| **`sync-missing` API** | If used, refreshes CSV from DB **before** comparing so a stale file cannot inject phantom rows. |
| **Full Ledger Refresh** | Only routine path that loads from an **uploaded** master file chosen by the admin. |

### Ops recovery (when append is blocked)

```powershell
node peer-finance-manager/scripts/restore-ledger-production.js --org <slug> --ledger <master.xlsx>
```

Assurance wrapper: `restore-assurance-ledger-production.js` (§1A).

### Agent rules (product mode)

| Do | Do not |
|----|--------|
| Ship fixes in **generic** libs (`bank-import-append.js`, aliases, UI) | Add Assurance-only UI thresholds or hardcoded balances |
| Run `npm run test:bank-append` after append/balance changes | Claim "fixed" after data restore only |
| Document §1B + changelog same turn | Tell Coop admins to use SFTP or file-copy tools (use **Admin → Import** / **Maintenance**) |

---

The cooperative collects monthly member contributions (minimum ₦50), charges a ₦100 annual registration/admin fee, pays periodic **distributions** (profit/interest), and offers **loans** to members under specific rules. The treasurer (user: Yinka) needs to:

1. Produce **monthly PDF account statements** for every member
2. Maintain an accurate **ledger** of deposits, withdrawals, distributions, and loans
3. Eventually **reconcile Bank of America** exports against member activity
4. Keep **member banking profiles** (KYC-style data from membership applications)

Historically, everything lived in Excel (`Assurance Status` workbooks). This repo automates statement PDFs and has started a proper ledger app (PeerFinanceManager).

### Key business rules already encoded

**Statements (`lib/statement-generator.js`):**

- Positive month cell = deposit; negative = withdrawal
- Distribution column on workbook (e.g. `* Distribution - February`) is credited on statements
- Distribution row in the period table sits **after February deposit** (user-requested layout)
- Members with a withdrawal in the statement window: closing balance = `Total Deposits + withdrawals` only; registration and distribution still displayed but not double-counted
- Ejiro Awhotu is the canonical test case: April 2026 withdrawal −₦1,721.91 → balance **₦995.59**

**Ledger (`peer-finance-manager/`):**

- Membership fee: ₦100
- Loan: 2 guarantors, 6+ months membership, max = min(borrower deposits, guarantors combined), 8% / 12 months default
- Late fee: $25 after 22nd (logic in `loan-service.js`)
- Spreadsheet import dates deposits on **last day of month** (placeholder); **bank import** uses real dates from BoA CSV

**Bank CSV (`lib/bank-statement-parser.js`):**

- Uses `Narrative` column: only `Member Deposit` / `Member Withdrawal` count toward contributions
- Known mislabels in `stmt (1).csv`: Gbanju and Oluwabiyi loan payments tagged as `Member Deposit` — **workbook wins**

---

## 2. What has been built

### Statement Generator (port 3456)

| Status | Item |
|--------|------|
| ✅ Done | Web UI (`generator.html`) — select workbook, sheet, optional distribution upload |
| ✅ Done | PDF batch generation via Puppeteer worker |
| ✅ Done | Distribution from workbook column and/or uploaded file |
| ✅ Done | Output to `statements/YYYY-MM/` |
| ✅ Done | March, April, May 2026 PDF runs |
| ✅ Done | Bank CSV parser with member name aliases |
| ✅ Done | `compare-workbook-bank.js` reconciliation |
| ✅ Done | `generate-may-2026-from-bank.js` pipeline |

### PeerFinanceManager (port 3457 local / production cloud)

| Status | Item |
|--------|------|
| ✅ Done | SQLite schema + per-org databases (`data/organizations/{slug}/`) |
| ✅ Done | Multi-org registry (`data/registry.db`) |
| ✅ Done | Auth: admin / staff / member roles; separate portals |
| ✅ Done | Member self-service: balances, transactions, monthly statement PDF |
| ✅ Done | Member portal **My Profile**: biodata (read-only), emergency contact (editable), optional photo upload |
| ✅ Done | Member portal mobile UX: collapsible biodata/emergency sections; Description column toggle; flat transaction tables with nowrap rows |
| ✅ Done | Manual Record tab: register member, profile edit, membership fee |
| ✅ Done | Cooperative Books dashboard (incl. CD balance, **Expected CD Interest** card) |
| ✅ Done | **Production:** Netlify (static UI) + Render (Express API + SQLite on disk) |
| ✅ Done | Member credential export CSV |
| ✅ Done | Puppeteer PDF on Render (Chrome installed at build) |
| ✅ Done | Bank ledger import via `npm run pfm:import-bank` (`import-bank-ledger.js` + `parse-bank-sources.js`) |
| ✅ Done | Date display fix for `YYYY-MM-DD` values (timezone-safe local parsing) |
| ✅ Done | Bank import UI tab — **Import New Bank Activity** (append preview/apply), format profiles, rules, aliases, OFX, balance check |
| 🟡 Partial | Active loans not fully loaded |
| ❌ Not done | Expenses UI / import |
| ❌ Not done | Supabase live sync (optional future) |
| ❌ Not done | Auto-sync PC database ↔ cloud database |

### Data files in repo

| File | Role |
|------|------|
| `Assurance Status 4 2026.xlsx` | Source of truth through **April 2026** |
| `Assurance Status 5 2026.xlsx` | May 2026 sheet with bank-filled deposits |
| `Assurance Status 2 2026.xlsx` | February 2026 only (older) |
| `wpforms-5-...csv` | 22 membership applications |
| `data/master-ledger/cooperative-bank-ledger-master.xlsx` | **Historical bank archive (golden)** — all reconciled BoA transactions 2023-01-23 through 2026-06-29, ending **$15,471.49**, **453 rows**. Built `build-master-ledger.js` from `pre 2025.xlsx` + `stmt (6).csv`. **User-kept reference; do not overwrite.** See §1A. |
| `data/cooperative-bank-ledger-reference.xlsx` | **App import file** for Full Ledger Refresh (Member/Narrative labels). Restored from master 2026-07-08 (453 / $15,471.49). Re-copy from master if auto-sync clobbers again. |
| `data/cooperative-bank-ledger-reference.csv` | CSV twin of import file |
| `C:\Users\yinka\Downloads\pre 2025.xlsx` | Pre-2025 BoA history source used in 6/30 reconcile |
| `C:\Users\yinka\Downloads\stmt (6).csv` | BoA Jan 2025 through 6/29/2026 source used in 6/30 reconcile |
| `data/bank-statement-2026.csv` | Partial 2026 BoA slice (older workflow; not full history) |

### Members (24 on ledger)

Abraham Udom, Adedayo Tolani, Clement Aribisala, Gbanju Aruwayo-Obe, Kelvin Amede, Lolu Adanri, Mutiu Saliu, Olugbenga Shofela, Oluwabiyi Omotuyole, Taiwo Embassey, Yinka Daramola, Yomi Salami, Iyioluwa Olaoye, Oladimeji Eboda, Akili Tcha Bindi, Ejiro Awhotu, Noghayin Idele, Idris Anaisah, Sonia Udom, Oluwatosin Ogunbowale, Titilope Saliu, Oluwatosin Omotuyole, Kehinde Agboola, Olawale George

**Profiles missing:** Olawale George, Kehinde Agboola (no WPForms row)

---

## 3. Architecture (for agents)

### Production (live — June 2026)

```
Members/Admin browser
        │
        ▼
┌───────────────────┐      proxy /api/*       ┌────────────────────────────┐
│ Netlify           │ ───────────────────────► │ Render (Node/Express)      │
│ peer-finance-     │                          │ peer-finance-manager.      │
│ manager.netlify   │                          │ onrender.com               │
│ .app              │                          │ SQLite: /var/data/         │
│ Static UI only    │                          │ organizations/{slug}/      │
└───────────────────┘                          └────────────────────────────┘
        │                                                  ▲
        │                                                  │ Admin → Import /
        │                                                  │ Maintenance
        │                                          ┌───────┴────────┐
        │                                          │ Coop admin UI  │
        └─ publish: git push ──► GitHub ──────────┘ (browser only) │
```

| Layer | Config files |
|-------|----------------|
| Netlify | `netlify.toml`, `RENDER_API_URL` env var |
| Render | `render.yaml`, `PFM_DATA_DIR=/var/data`, Puppeteer Chrome at build |
| Local PC | `PeerFinanceManager.exe`, `data/` folder |

**Publish code:** `git push` → auto-deploy both services. See [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md).  
**Publish data:** **Admin → Import** (ledger) or **Admin → Maintenance** (backup/restore). Browser only.

### Country profiles (currency and statement conventions)

Unset or unknown `country_code` is **United States** (USD, Pacific, MM/DD/YYYY). Assurance needs no migration and must stay on United States. Nigeria is opt-in at Register (`/register?country=NG` preselects it; `/productngn` links carry it) or **Organization & Report Settings**. Changing country does not convert ledger amounts or rewrite bank accounts. Each profile also carries `membershipDefaults` (US 100/100, NG 50,000/50,000 NGN pending client confirmation); the effective Registration Fee and Initial Contribution resolve in `lib/membership-policy-service.js` as stored setting -> country default -> legacy constant, and admins override them on **Manual Record -> Membership Policy**. Bank names and states live in `peer-finance-manager/lib/country-catalog.js` (Nigeria: CBN deposit-money banks plus common digital brands, 36 states + FCT; United States: 50 states + DC). Add the next client country in `country-profile.js` plus catalog lists. Do not fork product code per country. Platform SaaS billing stays USD. Test: `npm run test:country-profile`.

### Local development

**Assurance Cooperative Manager** (`PeerFinanceManager.exe` / port **3457**) is the one app:

- Members, profiles, ledger, imports, loans
- **Statements tab** — PDF generation via `peer-finance-manager/lib/statement-routes.js` → root `lib/statement-generator.js`

The old standalone server on port 3456 is legacy (`npm run statements:legacy-server`). `generator.html` redirects to 3457.

```
Excel workbook ──► statement-generator.js ──► PDFs (Statements tab)
       │
       └──► import-spreadsheet.js ──► SQLite (same app)

Bank CSV + All deposits.xlsx ──► parse-bank-sources.js ──► import-bank-ledger.js ──► SQLite
       │
       └──► bank-statement-parser.js ──► compare scripts / month PDF pipelines
```

### Critical files — read these first

| Priority | File | Why |
|----------|------|-----|
| 1 | `lib/statement-generator.js` | All statement logic, balance edge cases, PDF HTML |
| 2 | `peer-finance-manager/lib/import-spreadsheet.js` | How workbook maps to ledger |
| 3 | `peer-finance-manager/lib/import-bank-ledger.js` | Bank CSV + xlsx → ledger transactions |
| 4 | `peer-finance-manager/lib/parse-bank-sources.js` | Merges BoA CSV with All deposits.xlsx |
| 5 | `peer-finance-manager/lib/ledger-import-audit.js` | Pre-import proxy/type warnings on Bank Ledger Import |
| 6 | `peer-finance-manager/lib/cooperative-meeting-service.js` | Per-tenant meeting schedule, announce, reminders |
| 7 | `lib/bank-statement-parser.js` | BoA CSV + Narrative + name aliases (statements/compare) |
| 8 | `peer-finance-manager/lib/member-name-match.js` | Application ↔ ledger names; proxy Zelle beneficiary |
| 9 | `peer-finance-manager/lib/member-self-service.js` | Member portal profile, photo, emergency contact |
| 10 | `peer-finance-manager/db/schema.sql` | DB shape |
| 11 | `peer-finance-manager/lib/country-profile.js` | Per-tenant country catalog (US default; add NG/next country here only) |
| 12 | `peer-finance-manager/lib/country-catalog.js` | Banks and states for searchable dropdowns |
| 13 | `peer-finance-manager/lib/membership-policy-service.js` | Per-Cooperative registration fee + initial contribution (setting -> country default -> constant) |
| 14 | `peer-finance-manager/lib/organization-welcome-email.js` | Admin welcome email on registration + platform resend; audit trigger `organization_admin_welcome` |

### Ports

- **3457** — **Assurance Cooperative Manager** — `npm start` or double-click **`PeerFinanceManager.exe`**
- **3456** — Legacy statement-only server (`npm run statements:legacy-server`) — deprecated

**Exe locations:** `PeerFinanceManager.exe` (project root) and `peer-finance-manager/dist/PeerFinanceManager.exe`. Rebuild with `npm run pfm:build`. Build copies `lib/statement-generator.js` and `styles.css` beside the exe for PDF generation.

### npm scripts reference

```powershell
npm start                  # Assurance Cooperative Manager (port 3457)
npm run pfm                # Same as npm start
npm run pfm:seed           # Ledger from spreadsheet
npm run pfm:profiles       # WPForms → profiles
npm run pfm:import-bank    # Bank CSV + xlsx → ledger (real dates)
npm run generate:may-2026  # Bank + workbook → May PDFs
npm run compare:bank       # Workbook vs bank CSV
npm run test:country-profile  # US default, NG aliases, banks/states, DD/MM vs MM/DD
npm run pfm:build          # Package PFM as .exe
npm run statements:legacy-server  # Deprecated port 3456 only
```

---

## FlexxForms integration (PFM ↔ FlexxForms)

### How PFM embeds application forms (permanent)

| Item | Value |
|------|--------|
| Host pages | `/c/{slug}/apply`, legacy `/?apply={slug}`, member loan apply, login membership apply |
| Embed method | `/c/{slug}/apply?from=about\|bylaws` embeds FlexxForms via `mountFlexxFormsEmbed`; on **completed**, redirects to origin page with one-time thank-you flash (not persistent). Full-window FlexxForms link remains as fallback. `publicApplyUrl` = `/c/{slug}/apply`. Webhook unchanged. Member login apply still uses embed on `membershipApplyScreen`. |
| Form ids | Per Cooperative in registry `organizations`: `membership_form_id`, `loan_form_id`, guarantor/borrower master doc ids |
| Webhook | `POST https://peer-finance-manager.onrender.com/api/flexxforms/webhook` (HMAC, unchanged) |
| Provision | `POST /platform/workspaces/ensure` on org register; admin assigns ids in **Forms & Documents** |

**Never show on public cooperative apply:** PlacementExpress branding, "Back to deal", or deal/document chrome. That is a FlexxForms platform bug if `/p/{formId}` still shows it.

### Canonical message to FlexxForms (customize incident; give user in one code block)

Use this skeleton when drafting for the user. Replace `[INCIDENT]` and add form ids if helpful. Assurance example id: `8d5e2b33-922e-4044-ad5c-6fe8bb0473d5`.

```
Subject: Peer Finance Manager — public cooperative form embed (multi-tenant)

Hi FlexxForms team,

Peer Finance Manager (PFM) embeds your forms for many member-owned Cooperatives (multi-tenant). Each Cooperative has its own FlexxForms workspace and form ids (membership, loan, guarantor/borrower documents). We are still onboarding additional Cooperatives; the requirements below apply to every workspace we provision, not only one form.

[INCIDENT: e.g. PlacementExpress / "Back to deal" chrome on /p/{formId}; duplicate embed; submit button no response; address fields not in webhook.]

PFM host (example): https://peer-finance-manager.netlify.app/c/{cooperativeSlug}/apply
PFM embed (permanent): iframe src = https://flexxforms.netlify.app/p/{membershipFormId}
  — No query params, no embed.js, no /embed path on public cooperative apply pages.
  — Parent page listens for flexxforms:resize, flexxforms:completed, flexxforms:error postMessages.

Webhook (unchanged): POST https://peer-finance-manager.onrender.com/api/flexxforms/webhook

Platform requirements (all Cooperatives):

1. GET /p/{formId} with no query params must render a clean public respondent form only: no PlacementExpress header, no "Back to deal", no "Document: …" deal shell.
2. Membership and loan application forms published for PFM workspaces must be standalone public forms, not PlacementExpress deal documents (unless you provide a dedicated public mode).
3. If embed.js is recommended for resize/submit: support data-form-path="p" WITHOUT appending ?embed=1, OR add data-embed-mode="public" that never loads deal/partner chrome.
4. form.submitted webhook must fire for every successful public submit; formSubmissionId in postMessage must match webhook submissionId.
5. Webhook and integrations API must include **answers[]** with `fieldIndex`, `label`, `value` (and `partKey` for name/address parts). PFM uses lowest name `fieldIndex` = applicant, second = next of kin. Do not rely on generic `firstName`/`lastName` keys in `data`.
6. Integrations API (Bearer tenant apiKey): `GET /api/integrations/forms/{formId}/submissions/{submissionId}`; list fallback `GET /api/integrations/forms/{formId}/submissions?limit=50`. Paths `/integrations/submissions/{id}` and `/integrations/form-submissions/{id}` do not exist.
7. Mobile submit, validation feedback ("Submitting…", visible errors), and address sub-fields (city, state, zip, country) must work inside cross-origin iframes on peer-finance-manager.netlify.app.

Example (Assurance Cooperative, slug assurance):
  membership_form_id: 8d5e2b33-922e-4044-ad5c-6fe8bb0473d5
  public test URL: https://flexxforms.netlify.app/p/8d5e2b33-922e-4044-ad5c-6fe8bb0473d5

Please confirm the platform fix applies to all PFM-provisioned workspaces and future orgs, not a one-off patch for Assurance.

Thanks,
[Your name]
Peer Finance Manager / Assurance Cooperative
```

---

## 4. Outstanding tasks (prioritized)

### High — operational / product

| # | Task | Notes |
|---|------|-------|
| 1 | **Load active loans** | Framework exists; bank activity documented. User to provide schedules. |
| 2 | ~~**Cooperative expenses**~~ | ✅ **Done** (incremental) — Expenses import from bank ledger; Record expense + categories; **Operational Expense Labels** on Monthly Status Report (presets + add-new) deployed `d399bb4`. Remaining polish only if user asks. |
| 2b | ~~**Assurance subscription check**~~ | ✅ **Done** 2026-08-21 — Annual check recorded. Status **active**, plan **annual**, period through **2027-08-22**. |
| 3 | **Profile for Kehinde Agboola** | Olawale George added (WPForms row + local import). Kehinde still has no application row. |
| 4 | ~~**Restore app import file from golden master**~~ | ✅ **Done** 2026-07-09 — Render **457 / $16,241.55**. |
| 4b | ~~**Fix auto-sync clobber**~~ | ✅ **Done** — xlsx never auto-overwritten; CSV sync cloud-only (§1B). |
| 4d | ~~**Bank append product mode (all tenants)**~~ | ✅ **Done** 2026-07-09 — opening + ending blocks, Default Type on payment aliases, apply button disabled when blocked, `npm run test:bank-append`. See §1B. **2026-09-18:** Leaving Import clears the last preview/file so the next visit is a new session. **Deploy:** `50f454e`. |
| 4f | ~~**Bank Reconcile Status (all tenants)**~~ | ✅ **Done** 2026-07-11 — anchor on successful import; Cooperative Books card + `/api/health`; `npm run test:bank-reconcile`. **Deploy:** `git push`; re-import once per tenant to set anchor. |
| 4g | ~~**Eliminate WinSCP routine dependency**~~ | ✅ **Done** 2026-07-11 — **Admin → Maintenance**. |
| 4h | ~~**Zero WinSCP (complete)**~~ | ✅ **Done** 2026-07-11 — Removed all WinSCP/SFTP/break-glass workflows from docs and UI copy. Replacement: **Admin → Maintenance** (backup/restore) + **Import**; first-time = Register + optional Restore. Automated off-disk backups remain task **4i**. |
| 4i | **Automated off-disk backups (S3/R2)** | Nightly registry + all `organizations/*`. Complements browser Maintenance backups for SaaS DR. |
| 4j | **Gate public org registration** | Invite/approval + CAPTCHA + rate limits on `POST /api/auth/register-organization`. |
| 4k | ~~**Remove hardcoded platform/admin passwords**~~ | ✅ **Done** 2026-11-24 — `ensurePlatformAdminUser` no longer force-resets the hash on boot; `PLATFORM_ADMIN_PASSWORD` is now an explicit recovery path (rotates only when set AND different; revokes `platform_sessions`). Fresh prod install without env gets a random logged password; dev keeps `12345678`. Org seed honors `ASSURANCE_ADMIN_PASSWORD` with a prod console warning on fallback. **Owner action:** set `PLATFORM_ADMIN_PASSWORD` and `ASSURANCE_ADMIN_PASSWORD` in Render env to rotate off any repo-default credentials and kill stale sessions. |
| 4l | **Per-tenant email FROM** | Store smtp_from / smtp_from_name on registry org; stop global Assurance branding. |
| 4m | **Disk headroom + idle DB LRU** | Raise `render.yaml` disk; alert usage; evict idle `dbByOrg` handles. |
| 4n | **Layman import UX** | Single Import Bank Statement path; onboarding wizard; stop Assurance `SEED_ALIASES` on empty tenants. |
| 4v | ~~**Stronger organization codes for new signups**~~ | ✅ **Done** 2026-08-24 — Strength rules remain on the server. **2026-08-29:** Register now auto-generates the code after name confirm (copy/save). Admin sign-in and member login links pre-fill `?org=`. `assurance` unchanged. |
| 4w | ~~**Quieter Register + auto org code**~~ | ✅ **Done** 2026-08-29 — Name confirm, generated code, copy/save, country label **Select Country of Business Location**, admin/member login pre-fill. `npm run test:organization-code`. **Deploy:** `64da149`. |
| 4o | ~~**Loan Payment Policy (flexible vs strict)**~~ | ✅ **Done** 2026-07-11 — Toggle on Loans tab; snapshot per loan; late fee default $25; `npm run test:loan-policy`. |
| 4c | **PC ↔ cloud bank ledger** | Monthly: **Import New Bank Activity** only. Full rebuild: **Full Ledger Refresh**. Ops: `restore-ledger-production.js --org <slug>`. |
| 4e | ~~**Yomi Salami Nov 2025 split (Saheed bank alias)**~~ | ✅ **Done by Coop Admin** 2026-07-12 — Split saved on live; balance **$16,241.55** unchanged; row count 457→458 (expected). Reconcile row-align after classification added so Out of Sync does not false-alarm. |
| 4p | ~~**Loan Payment Policy deploy**~~ | ✅ **Done** 2026-07-12 — Deployed with N-way split reconcile align + download notice. Default flexible; no effect on existing loans. |
| 4q | ~~**Membership status by type (resign/death/expel/suspend)**~~ | ✅ **Done** 2026-07-16 — Typed status; hide from active list; keep ledger; block all active benefits; PDF/image notice upload; dashboard active count. `npm run test:membership-status`. **Deploy:** `git push`. |
| 4r | ~~**Member portal Apply for a Loan (end-to-end)**~~ | ✅ **Done** 2026-07-17 — Assign Loan Form Id; webhook → Loan Applications list. **2026-10-21:** Simple path is offer terms → member Accept Terms → admin approve; no guarantor when amount ≤ contributions (task 5g). Two-guarantor path remains task 5h. Guarantor/borrower e-sign docs remain on the Loans tab. **Deploy:** `b5093ed`. |
| 4s | ~~**Cooperative inbox messaging (all tenants)**~~ | ✅ **Done** 2026-07-17 — Inbox + unread; **rich Word-paste composer** + modern UI + attachments. Deployed `409dbb3`. **2026-09-18:** Ampersand double-encode fix (`html-sanitize-lite.js`); existing threads repair on open. **2026-10-08:** Admin **Inbox / Sent / Email Notices**. **2026-10-19:** Email Notices **View Message** shows the exact copy; deposit/loan acknowledgements and loan due notices also post to the member portal. **2026-10-21:** **View Message** opens each send in a new tab (`/admin?emailNotice=<id>`). `npm run test:messaging`, `npm run test:deposit-credit-alerts`. **Deploy:** `5c0ac31` (new-tab reader). Prior exact-copy: `9e79795`. Prior Sent/Email Notices: `38f9252`. |
| 4t | ~~**Admin nag + Messages notice on new membership application**~~ | ✅ **Done** 2026-07-18 — Forms tab flash + banner; system notice in admin Messages; optional email tip. **2026-10-05:** Badge/nag clear on **Accept Member** (not on Save Profile or payment). Applicant received-email on submit; welcome login email on Accept; deposit-verified email + portal notice on **Verify Deposits** or later bank import. **Disregard Application** closes a mistaken/duplicate submission without accepting. **Deploy:** `d4f3baf`. |
| 4u | ~~**Apply embed signature/submit endless gap**~~ | ✅ **Done** 2026-07-20 — Shell-height iframe + internal scroll; ignore content-height resize blowouts. **Deployed** `a71d895`. |
| 5 | ~~**Wire bank import into Import tab UI**~~ | ✅ Done — **Import New Bank Activity** (append) + **Full Ledger Refresh** (advanced). APIs: `POST /api/bank-import/append/preview`, `append/apply`, `run`. **2026-10-07:** Successful append emails Member Deposit and Loan Repayment acknowledgments. `POST /api/bank-import/deposits/notify-latest` backfills the latest recent append. **Deploy:** `b88aa68`. |
| 5a | ~~**Loan installment due notices**~~ | ✅ **Done** 2026-10-07 — Email borrowers on the due date. **2026-10-21:** First repayment is 30 days after disbursement; later months follow that calendar day. Skip when that installment's loan repayment is already recorded (Oluwabiyi October false due notice). `npm run test:loan-due-notice`. **Deploy:** `3fddd9d` (30-day first due). Prior skip recorded repayment: `fa7d5b6`. Prior: `9c92d02`. |
| 5b | ~~**Automated Messages wording editor**~~ | ✅ **Done** 2026-10-07 — Admin **Automated Messages** tab to view/edit all automatic member emails on demand. `npm run test:automated-messages`. **Deploy:** `9c92d02`. |
| 5c | ~~**First-deposit membership fee (automatic)**~~ | ✅ **Done** 2026-10-08 — First deposit posts a separate -$100 `membership_fee` (Registration Income); contributions account keeps the extra. Startup backfill for recent joins with a deposit and no fee row (Olayemi Daramola on Assurance after Render restart). `npm run test:membership-applications`. **Deploy:** `38f9252`. |
| 5d | ~~**Deposits-verified email leftover amounts**~~ | ✅ **Done** 2026-10-08 — Notice/email uses actual deposit and leftover, not a second $100 contribution. **2026-10-08:** Wording is now "agreed membership application fee deducted from initial deposit; remaining credited as first deposit." Startup v2 correction resend. **Deploy:** `04d2fe3`. |
| 5e | ~~**New-member first deposit attach**~~ | ✅ **Done** 2026-10-19 — Unique first-name Zelle match, learn payment names from deposits, $100 fee on bank import, skipped preview no longer flags "Member is required". `npm run test:member-bank-attach`. **Deploy:** `bad422b`. |
| 5f | ~~**Email Notices exact copy + portal deposit acknowledgements**~~ | ✅ **Done** 2026-10-19 — Store notice body on each delivery; Email Notices **View Message** shows the copy. Deposit/loan repayment and loan due notices post to the member portal and admin **Sent**. **2026-10-21:** **View Message** opens a standalone tab (sidebar hidden) so administrators do not scroll the Messages page. `npm run test:deposit-credit-alerts`, `npm run test:messaging`. **Deploy:** `5c0ac31` (new-tab reader). Prior exact-copy: `9e79795`. |
| 5g | ~~**Simple loan application: offer terms, Accept Terms, then approve**~~ | ✅ **Done** 2026-10-21 — Default 12-month term; 8% rate; offer → member Accept/Reject in inbox → admin approve. No guarantor when amount ≤ contributions. **2026-10-21:** Inbox Accept/Reject on the notice; stacked schedule shows due date, payment, principal, and interest. **2026-10-21:** Approval notifies the member; the loan account and portfolio open only after the matching bank disbursement is imported. **2026-10-21:** Disbursement email + portal notice; first repayment 30 days after the bank date; PDF/Excel repayment-plan downloads. `npm run test:loan-applications`. **Deploy:** `3fddd9d` (disbursement notice + plan downloads). Prior approve + bank open: `15710c9`. Prior inbox/schedule: `ce1d477`. |
| 5h | **Guarantor signing for loans above contributions** | Most requests will exceed deposits and need 2 guarantors to sign for their portion. Implement after the simple covered-by-deposits workflow (5g). |
| 5i | ~~**Disbursement notice + 30-day first due + repayment-plan downloads**~~ | ✅ **Done** 2026-10-21 — `loan_disbursed` email/inbox after bank outflow; schedule realigns to disbursement date with first due +30 days; **Download Repayment Plan (PDF)** / **(Excel)** for admin and member. **2026-10-21:** Buttons sit on the inbox notice. **2026-10-21:** One-tap native download to the device. **Deploy:** `c3cf0ec` (one-tap save). Prior inbox buttons: `6b0236d`. Prior first pass: `3fddd9d`. |
| 5j | **Member-less bank row reclassify UI** | Category/Split controls only render on member profile tables (deposit/loan types). Expense/CD/investment rows with no member cannot be reclassified in UI; use POST `/api/ledger-adjustments/reclassify`. Needs a real surface (e.g. Category/Split on the Cooperative Books expenses detail). **2026-10-31 Assurance resolved:** Check 1196 (10/20, -$2,250) was verified already stored as `loan_disbursement`/Yinka Daramola (the preview only showed the inferred label). Reclassify ran anyway as a no-op + rebuild; app #3 relinked to tx 16796. October stmt `stmt (17)` applied: +4 rows, ledger **$22,535.27** through 10/28, Reconciled. |
| 6 | ~~**Persist Title Case in database (backfill)**~~ | ✅ **Done** 2026-07-11 — **Admin → Maintenance → Normalize Profiles** on production (or CLI with `--org`). Display/save formatters already live. |
| 7 | **Reprocess July 6 Assurance membership application** | FlexxForms shipped `answers[]` + GET submission API. PFM parser updated locally (`flexxforms-membership-service.js`, `flexxforms-service.js`). **Deploy** (`git push`), then Admin → Forms & Documents → Membership Applications → **Reprocess Data** on kept test row. Confirm applicant (not Mia Testy), email, address. Do not Approve until correct. New submits should work from webhook automatically. |
| 8 | ~~**Finish email notifications (Bluehost relay)**~~ | ✅ Relays live (`emailConfigured: true`; admin confirmed meeting send to 25). Keep **[BLUEHOST-EMAIL-RELAY-SETUP.md](BLUEHOST-EMAIL-RELAY-SETUP.md)** for ops. **Email Send Audit** now available on Meetings tab for on-demand verification. |

| 4x | ~~Twilight Funds (NG) FlexxForms workspace verification~~ DONE 2026-11-19 | Starter cloning enabled: HOST_APP_PEER_FINANCE_MANAGER_STARTER_TENANT_ID=Assurance tenant on FlexxForms/Netlify + provisioningRole metadata on Assurance forms/docs + FlexxForms redeploy; retry populated twilight form/doc ids. See changelog. |
| 4y | **Confirm Nigeria membership defaults with client** | NG profile `membershipDefaults` ships at 50,000/50,000 NGN so the new Cooperative is not blocked; admin can change anytime on **Manual Record -> Membership Policy**. Confirm real fee/contribution amounts with Twilight Funds admin and update profile or stored setting. |
| 4z | **Nigeria bank statement samples for import training** | User note 2026-11-18: need a real statement export from each Nigerian bank used by the first NG Cooperatives to tune auto-detect (Trans Date/Value Date, Narration, Debit/Credit, DD/MM/YYYY). Collect with onboarding; extends task 14b. |
| 15 | **Apply TTFC workbook corrections on live org** | Reconciliation vs workbook 05 + Providus statement found 6 mistyped import rows (overstates Member Contributions by 268,829.72, understates fee income by 262,500). Fix on live: Contributions Account -> Bank Ledger Rows -> Split Bakare 151,320 (150,000 Membership Fee + 1,320 Other Cooperative Income) and Oluwafemi 75,009.72 (75,000 Membership Fee + 9.72 Other Cooperative Income); reclassify Oni 5,000 SIAML refund -> Share Capital, Eyinade 37,500 -> Membership Fee, both Sterling 19,726.xx credits -> Other Cooperative Income. Downloads/ttfc-ledger-operations.csv already corrected if a file-based Full Ledger Refresh is preferred instead. Note: workbook books Oni SIAML 5,000 to GL Paid-up Share Capital but excludes it from the member-facing 05 sheet, so Share Capital card will read 38,326,843 after the fix. |

### High — user said they will provide info later

| # | Task | Notes |
|---|------|-------|
| 9 | **Member photos** | Admin and member upload supported; most members still on placeholder SVG. |

### Medium — operational

| # | Task | Notes |
|---|------|-------|
| 8 | **June 2026 statements** | Bank CSV has June deposits (partial month). Generalize `generate-may-2026-from-bank.js` → month argument. |
| 9 | **April distribution on statements** | May statements use February distribution column (workbook fallback). Confirm when amounts finalized. |
| 10 | **January 2026 verification** | Workbook has Jan 2026 column; bank CSV starts 2 Feb 2026. |
| 11 | **Regenerate April PDFs** | After distribution layout fix, April folder may have old layout if not re-run. |
| 12 | **Spreadsheet import placeholder dates** | `pfm:seed` still uses last-day-of-month; bank-imported txs have real dates. |
| 13 | ~~**Currency display consistency**~~ | ✅ **Done (incremental)** 2026-08-21: PFM UI and PFM PDFs use the Cooperative **Country** currency (US = USD). Legacy root `lib/statement-generator.js` remains NGN for old Assurance workbook scripts only. |
| 14 | **Verify PDF statements on production** | Member monthly download after Puppeteer Chrome deploy. |
| 14b | **Nigeria bank statement sample** | Country profile, DD/MM/YYYY, header aliases, and searchable bank/state catalogs are **deployed** `ae04579`. When the Nigerian Cooperative provides a real export, tune auto-detect if any columns still miss. Do not change US/Assurance parsers. |
| 14c | ~~**Country profiles (US default, Nigeria)**~~ | ✅ **Done** 2026-08-21: `country-profile.js` + `country-catalog.js`. Assurance unset country = US. **Deployed** `ae04579`. |
| 14d | ~~**SPA `/register` unstyled stacked forms**~~ | ✅ **Done** 2026-08-21: root-absolute CSS/JS on Netlify SPA rewrites; platform login not linked on public UI. **Deployed** `03d1541`. |

### Low — engineering hygiene

| # | Task | Notes |
|---|------|-------|
| 15 | **Unify bank parsers** | Root `bank-statement-parser.js` vs PFM `parse-bank-sources.js` overlap. |
| 16 | **PFM bank-import tests** | `scripts/test-ledger-import-audit.js` covers proxy + contribution-type checks; expand as needed. |
| 17 | **Rebuild PFM exe** | After schema/profile/UI changes. |
| 18 | **Ejiro / withdrawal regression** | Always verify Ejiro balance when touching `statement-generator.js`. |

---

## 5. Known issues & gotchas

1. **Wrong May column** — Workbook has May columns for 2023–2026. Always match **year row + month header** (May 2026 = column index **46** on current sheets). Do not use `indexOf('May')` alone.

2. **Bank narrative errors** — Three April-ish mislabels documented in compare script output. Never blindly sum all `Member Deposit` rows without description checks.

3. **Proxy Zelle deposits** — `from X for Y` must credit **Y**, not X (e.g. Yinka for Ejiro/Titilope). Import auto-fixes via `member-name-match.js`; Admin → Import shows **Ledger warnings** if still wrong. After `git push`, re-import corrected `cooperative-bank-ledger-reference.xlsx`.

4. **Gbanju 4/20/2026** — ₦434.34 loan repayment mislabeled `Member Deposit` in bank file.

5. **Oluwabiyi 3/16 and 4/10** — ₦443.55 loan payments mislabeled `Member Deposit`. Mar 2026 **$100.13** was also mis-tagged `loan_repayment` in master ledger (fixed to `deposit`).

6. **Two Oluwatosin members** — `Oluwatosin Omotuyole` vs `Oluwatosin Ogunbowale`; bank alias patterns disambiguate.

7. **Sonia Udom CSV row** — First name `Sonia`, last name `Abraham Udom`; mapped to ledger `Sonia Udom`.

8. **Akili spelling** — Application `Tcha Binidi` → ledger `Akili Tcha Bindi`.

9. **`replaceExisting: true` on spreadsheet import** — Wipes ledger. Profiles survive in `member_profiles` table but re-link only if members re-imported with same names.

10. **Puppeteer** — Requires Chrome or Edge on Windows. Worker runs in separate process (`scripts/run-generation-worker.js`).

11. **Timezone date display** — `YYYY-MM-DD` strings parsed as `new Date('2026-06-08')` show one day early in US time zones. Fixed in `formatDate()` / `formatDisplayDate()` by parsing as local calendar date. Verify after any new date formatting code.

12. **User rules** — Do not git commit unless asked. Use `gh` for PRs. Real shell environment.

13. **Documentation** — `.cursor/rules/continuous-documentation.mdc` is `alwaysApply: true`. Update docs in the **same turn** as every change. Read `AGENT_HANDOVER.md` first every session. The user must never need to ask for doc updates.

14. **Assurance bank ledger auto-sync** — On **cloud**, CSV export syncs from DB after imports (xlsx is never auto-overwritten). On **local PC**, CSV sync is **off** unless `PFM_LEDGER_CSV_SYNC=1` so a stale dev DB cannot overwrite `cooperative-bank-ledger-reference.csv`. See **§1B**.

15. **Dashboard Current Bank Balance** — Uses `checking_balance` setting if set, else **ledger sum** from DB (`getLedgerEndingBalance`). Preview balance-check fix (`cd5e05d`) only changes Import **warning text**; it does **not** fix DB or xlsx. Production drift = incomplete Full Ledger Refresh or post-reconcile corruption.

16. **Netlify SPA asset paths** — Rewrites `/register` (and `/admin`, `/staff`, `/member`, `/platform`) to `index.html`. CSS and JS in that file **must** be root-absolute (`/styles.css`, `/theme.css`, `/app.js`). Relative `styles.css` becomes `/register/styles.css` and also rewrites to HTML, so screens dump unstyled.

17. **Platform Administration URL is private** — Never add a link to `/platform` on register, member, staff, admin, product, or any public page. Only the operator should know the path. Cooperative admin sign-in is `/admin` (different).

---

## 6. Verification checklist (after changes)

```powershell
# Ledger + profiles
npm run pfm:seed
npm run pfm:profiles
npm run pfm:import-bank   # After updating bank CSV / All deposits.xlsx

# Reconciliation
npm run compare:bank
node peer-finance-manager/scripts/test-ledger-import-audit.js

# Statements
npm run generate:may-2026
# Manually spot-check: Ejiro ($991.00 contributions), Yinka ($2,430.98), proxy warnings clear on Import tab

# Apps start
npm start   # → http://localhost:3457 (Assurance Cooperative Manager)

# Country profiles (US default / Nigeria)
npm run test:country-profile
```

---

## 7. User communication context

- User builds incrementally; **loan schedules and remaining unclear items** may still arrive later.
- **Expenses** are in use (bank import + report labels); do not treat as “table only.”
- User cares about **statement presentation** and Title Case / no em dash UI copy.
- **Assurance Status** workbook history still matters for April-era statement logic; live books use bank import + master ledger workflows (§1A/§1B).
- SaaS pricing decision (2026-08-06): **$29.99**/mo, 1% quarterly, 4% annual.
- Assurance billing: **active annual** through **2027-08-22** (check recorded 2026-08-21).
- **Platform Administration URL is private** — Never add a link to `/platform` on register, member, staff, admin, product, or any public page. Only the operator should know the path. Cooperative admin sign-in is `/admin` (different).
- Next client country: **Nigeria** (same product; Country toggle). Deployed `ae04579`. Do not change Assurance country.
- Docs rule: update `AGENT_HANDOVER.md` + affected guides in the **same turn** as code (`§0`). The user must never have to ask.
- Full build history lives in Cursor agent transcripts under `.cursor/projects/.../agent-transcripts/` (not required on the new machine if GitHub + this handover are current).

---

## 8. Suggested next session plan

1. Nigeria test: hard-refresh live `/register` (Ctrl+Shift+R). You should see the styled **Register Cooperative** form only (not stacked login pages). Create an org with **Country: Nigeria**, sign in at `/admin`. Leave Assurance on United States.
2. Monthly bank work: **Import New Bank Activity** only (append); Full Ledger Refresh only for rebuild (§1B).
3. Import loan records + schedules when user provides data.
4. Profile for Kehinde Agboola if application supplied.
5. Nigeria: wait for a real bank export (task **14b**) before tuning parsers.
6. SaaS hardening still open: **4i** off-disk backups, **4j** registration gate, **4k** remove default passwords.

---

## 9. UI copy conventions (user-mandated)

Documented in `.cursor/rules/ui-copy-standards.mdc`. Apply to all new or edited user-facing text.

1. **Title Case** — Headers, paragraph hints, labels, buttons, badges, and section titles use Title Case (e.g. `Cooperative Books`, `Import Profiles`, `On File`). **Do not capitalize** 2–3 letter words (`in`, `and`, `for`, `to`, `is`, etc.) unless first or last in the heading. Always capitalize **Cooperative** when referring to the member-owned organization.

2. **Slash compounds — no spaces** — When joining terms with `/`, do not space around the slash:
   - `Contributions Account/Loan Account` (not `Contributions Account / Loan Account`)
   - `Distribution/Interest`, `Zelle/Bank`, `Members/Profiles`, `22/24`
   - Same rule on PDF statement labels (e.g. `Interest/Distribution`)

---

## 10. Contact points in codebase (quick grep targets)

| Looking for… | Search / file |
|--------------|---------------|
| Balance logic | `hasStatementWithdrawal` in `statement-generator.js` |
| Distribution column | `distributionColIndex` in `statement-generator.js` |
| Name aliases (bank) | `MEMBER_BANK_ALIASES` in `bank-statement-parser.js` |
| Name aliases (applications) | `APPLICATION_TO_LEDGER` in `member-name-match.js` |
| Loan rules | `peer-finance-manager/lib/constants.js` |
| Date formatting (UI) | `formatDate` in `peer-finance-manager/public/app.js` (uses Country locale) |
| Date formatting (PDF) | `formatDisplayDate` in `loan-statement-generator.js`; numeric as-of via `formatCooperativeDate` |
| Country / currency | `peer-finance-manager/lib/country-profile.js`, `country-catalog.js`, `money-format.js` |
| Member self-service | `peer-finance-manager/lib/member-self-service.js` |
| Bank ledger import | `peer-finance-manager/lib/import-bank-ledger.js` |
| SaaS pricing constants | `peer-finance-manager/lib/platform-billing-constants.js` |
| Expense report labels | `peer-finance-manager/lib/expense-report-label-service.js` |
| Platform grace / check payment | `peer-finance-manager/lib/platform-billing-service.js`, `/platform` UI |
| Operational UI theme | `peer-finance-manager/public/theme.css` (tokens + visual overrides; loaded after `styles.css`) |
| Marketing product/brochure | `peer-finance-manager/public/product.html`, `productngn.html`, `brochure.html`, `brochurengn.html` (`/product`, `/productngn`, `/brochure`, `/brochurengn`) |
| Golden rebuild script | `peer-finance-manager/scripts/rebuild-ledger-from-bank.js` |
| Ledger vs stmt audit | `peer-finance-manager/scripts/audit-bank-ledger-discrepancy.js` |
| CD dashboard | `peer-finance-manager/lib/cooperative-books.js`, `cd-balance-service.js` |
| DB tables | `peer-finance-manager/db/schema.sql` |

---

*End of handover. UI copy: `.cursor/rules/ui-copy-standards.mdc`. Continuous docs: `.cursor/rules/continuous-documentation.mdc` (always apply).*

**User docs:** [USER-GUIDE.md](./USER-GUIDE.md) · **Publish updates:** [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) · **Technical:** [README.md](./README.md)
- **2026-11-23** - **Import dedupe scoped per bank account.** Matching
  now only considers rows on the target account (rows with no account
  id count as primary). Fixes internal-transfer legs being wrongly
  skipped when appended to their own account (ops-side leg blocked the
  share-capital-side leg). Verified: SC append 88 ready/0 skipped;
  re-upload dedupes correctly.
- **2026-11-23** - **Import audit flags classification mismatches.** Shared
  `auditLedgerImport` now also warns when a row's narration contradicts its
  ledger type: internal-transfer wording typed as member money/expense,
  investment/TD wording typed as non-investment, member-money rows with no
  member, negative deposit/share-capital amounts, positive
  withdrawal/loan-type amounts, and bank-charge narrations typed as anything
  but Expenses (charge narrations embed the transfer they were levied on,
  so they are checked first to avoid false investment flags). Warnings land
  in preview `needsReview` on the append path and in the refresh conflict
  audit. Verified against all four rebuilt TTFC files: only genuinely
  review-worthy rows flagged.
- **2026-11-23** - **Import success UX: clear preview + checkmark.** After a
  successful bank-activity append, the preview table is cleared (no more
  re-rendered statement) and the status line shows a checkmark with the
  result counts; the chosen file input is also cleared for the next upload.
  Checkmark added to all import success statuses for consistency (Full
  Ledger Refresh, Cooperative Spreadsheet, Membership Applications, Loan
  Repayment Schedule, Member Import, Bank Account Import). Error paths
  still re-render the preview so flagged rows can be fixed.
- **2026-11-23** - **Bank reconcile anchor scoped per bank account.** The
  reconcile card previously compared all-ledger totals against the
  primary account's verified statement balance, so appending other
  accounts' ledgers falsely reported Out of Sync. The anchor now stores
  the bank account (legacy anchors resolve to primary; rows with no
  account id count as primary, same rule as import dedupe) and both the
  balance-at-anchor and bank_import row count are account-scoped. Append
  preview/apply balance checks now project the target account's balance.
  Full Ledger Refresh now deletes only primary-account (or unassigned)
  bank_import rows: appended ledgers on other accounts survive a refresh.
  Verified: second-account appends keep the anchor reconciled; backdated
  primary-account rows still flag Out of Sync.
- **2026-11-23** - **Expense label auto-classify sweep.** On the Status
  Report expense-labeling table, changing a row's Report Label now offers
  to apply the same label to every other row whose bank description shares
  the leading narration signature (e.g. STAMP DUTY, COMMISSION, VAT,
  ACCOUNT MAINTENANCE FEE). A confirmation popup ("Apply Label to Similar
  Expenses") asks before sweeping: Apply to N Rows or Only This Row.
  Unlabeled rows are included; rows already on the same label are skipped.
  Change applies on Save Expense Labels as before.
- **2026-11-23** - **Expense report label subcategories.** Labels now
  support a parent (e.g. Stamp Duty, Commission, VAT, SMS Charges,
  Withholding Tax under Bank Fees). expense_report_labels gains parent_id
  (idempotent migration); children roll up to the parent total in the
  status report, and dropdowns show "Parent: Child". After the
  autoclassify sweep popup approves, a second popup offers to tag the
  swept rows with a subcategory named from the narration signature
  (STAMP DUTY -> Stamp Duty), created under the chosen label. Opt-in:
  choosing Keep leaves rows on the parent label.
- **2026-11-23** - **Manual subcategory creation for expense labels.** The
  Operational Expense Labels panel gains an "Under Label" dropdown next to
  Add Report Label so any label can be created as a subcategory of any
  top-level label (not only via the auto-classify sweep). Success copy
  confirms the parent; the parent selector repopulates whenever the label
  catalog changes.
- **2026-11-23** - **"Wages and Salaries" default expense label.** Added to
  EXPENSE_CATEGORIES so it seeds as a top-level report label in every
  Cooperative (salary rows can sit under it; PAYE/bonus can be
  subcategories).
- **2026-11-23** - **Expense label table: sort + signature aliases.** Rows
  needing attention (unlabeled or "Other") always sort to the top, with
  labeled rows grouped alphabetically; the table re-sorts after each
  autoclassify sweep. Signature collection now stops at connector words
  and expands abbreviation aliases (VAT -> VALUE ADDED TAX, COMM ->
  COMMISSION, CHG -> CHARGE, MAINT -> MAINTENANCE, TRF -> TRANSFER) so
  abbreviation/full-name variants of the same charge sweep together.
- **2026-11-23** - **Bulk expense labeling by must-contain text.** Two
  paths: (a) the autoclassify prompt after relabeling a row is now an
  editable "Description Must Contain" input (prefilled with the narration
  signature) so a sweep can be narrowed, e.g. outward transfers
  containing SALARY only; (b) a "Bulk Label Rows Containing" row in the
  Operational Expense Labels panel applies any label to all rows whose
  description contains the typed text, with a confirmation count. Both
  match case-insensitive substring on the bank description, skip rows
  already on the chosen label, and re-sort the table after applying.
- **2026-11-24** - **Per-account reconcile anchors + all-accounts card
  detail.** Anchors now store under per-account setting keys
  (bank_reconcile_*_acct_<id>); legacy unsuffixed keys remain the primary
  account's anchor for back-compat. getBankReconcileStatusAll() returns
  each bank account's status (Reconciled / Out of Sync / Not Verified
  with live balance + row count) and an aggregate headline (out_of_sync
  if any account diverges). The Bank Reconcile Status card detail lists
  one row per account plus its divergences. Statement appends that match
  their statement ending capture an anchor for that account; template
  appends (no statement summary) leave the account as Not Verified.
