# Agent Handover — Peer Finance Manager (AssurCoop)

This document gives the next developer or AI agent enough context to continue work without re-discovering the project from scratch.

**Last updated:** July 6, 2026 (FlexxForms official /p/ iframe + postMessage)  
**Organization:** Assurance Investment and Cooperative Inc. (slug: `assurance`)  
**Workspace:** `C:\Users\yinka\Documents\AssurCoop`  
**Production:** https://peer-finance-manager.netlify.app (UI) + https://peer-finance-manager.onrender.com (API)  
**GitHub:** `ydar996/peer-finance-manager`

---

## 0. IMMUTABLE AGENT INSTRUCTIONS (always follow)

> **Self-instructing rule for every agent, now and forever:**  
> **Read this section first. Document every change immediately in the same turn. The user must never have to ask you to update documentation.**

**Every change we make — and every outstanding task we discover, start, complete, or reprioritize — MUST be documented immediately and continuously for the next agent. Not at the end of a session. Not "when the user asks." Not only on commit.**

Documentation is the handoff contract between sessions. If it is stale, the next agent will guess or re-read chat transcripts and waste the user's time.

**Cursor enforces this via:** `.cursor/rules/continuous-documentation.mdc` (`alwaysApply: true`) — agents must follow it on every task without being reminded.

### Continuous documentation rule (non-negotiable)

1. **Read this file first** at the start of every session — before relying on chat history or agent transcripts.
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
| Data upload to production (WinSCP) | **UPLOAD-DATA-TO-PRODUCTION.md** |
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
3. **Code deploy** = `git push` → Netlify + Render auto-deploy. **Data deploy** = WinSCP to `/var/data` + Render Manual Deploy (separate step).
4. **Do not git commit** unless the user explicitly asks.
5. After cloud-affecting changes, note whether user must **re-upload data** or only **git push**.
6. **No em dashes** in user-facing app copy — use colons (`:`). See `.cursor/rules/ui-copy-standards.mdc`.

### FlexxForms messages to partner (mandatory)

When the user asks for a message to send **FlexxForms engineers** (or any FlexxForms follow-up you draft for them):

1. Put the **entire** copy-paste message in **exactly one** fenced code block (plain ` ``` `). No splitting across multiple blocks or mixing prose with the message body.
2. The user must be able to **one-click copy** the full text and paste into email/Slack.
3. Frame issues as **platform / multi-tenant** requirements for **all** Cooperatives PFM provisions, not only Assurance. Each org has its own `membership_form_id`, `loan_form_id`, and document ids in the registry DB; many are not fully configured yet.
4. Keep the canonical template in **§ FlexxForms integration** below current; customize incident details only inside the single code block you give the user.

### Document map (keep all current)

| Document | Audience | Purpose |
|----------|----------|---------|
| [USER-GUIDE.md](./USER-GUIDE.md) | Yinka, staff, members | Simple how-to use the live app |
| [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) | Yinka | How to change code and publish safely |
| [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md) | Yinka | WinSCP: copy `data/` folder to live server |
| [UI-COPY-STANDARDS.md](./UI-COPY-STANDARDS.md) | Agents/devs | No em dashes, Title Case, wording rules |
| [.cursor/rules/continuous-documentation.mdc](./.cursor/rules/continuous-documentation.mdc) | Agents (auto) | **Always applied** — doc updates same turn as every change |
| [DEPLOY-TODAY.md](./DEPLOY-TODAY.md) | Yinka | First-time cloud setup (already done) |
| [README.md](./README.md) | Developers | Technical overview |
| **AGENT_HANDOVER.md** | Agents | Background, architecture, tasks, changelog |

---

## Changelog

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

---

## 1. Background — what this project is for

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
| 🟡 Partial | Bank import UI tab — preview endpoint exists; full import is CLI/script today |
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
| `data/bank-statement-2026.csv` | BoA export merged for ledger import (not in git by default) |
| `All deposits.xlsx` | Historical bank deposits merged with CSV for import |

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
│ Static UI only    │                          │ organizations/assurance/   │
└───────────────────┘                          └────────────────────────────┘
        │                                                  ▲
        │                                                  │ WinSCP upload
        │                                          ┌───────┴────────┐
        │                                          │ PC data/ folder │
        └─ publish: git push ──► GitHub ──────────┘ (not in git)    │
```

| Layer | Config files |
|-------|----------------|
| Netlify | `netlify.toml`, `RENDER_API_URL` env var |
| Render | `render.yaml`, `PFM_DATA_DIR=/var/data`, Puppeteer Chrome at build |
| Local PC | `PeerFinanceManager.exe`, `data/` folder |

**Publish code:** `git push` → auto-deploy both services. See [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md).  
**Publish data:** WinSCP → `/var/data` → Render Manual Deploy.

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
npm run pfm:build          # Package PFM as .exe
npm run statements:legacy-server  # Deprecated port 3456 only
```

---

## FlexxForms integration (PFM ↔ FlexxForms)

### How PFM embeds application forms (permanent)

| Item | Value |
|------|--------|
| Host pages | `/c/{slug}/apply`, legacy `/?apply={slug}`, member loan apply, login membership apply |
| Embed method | Direct iframe `https://flexxforms.netlify.app/p/{formId}` (no query params). Parent `flexxforms:resize` / `flexxforms:completed` / `flexxforms:error` postMessage listeners. No embed.js on apply pages. |
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
5. Mobile submit, validation feedback ("Submitting…", visible errors), and address sub-fields (city, state, zip, country) must work inside cross-origin iframes on peer-finance-manager.netlify.app.

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
| 2 | **Cooperative expenses** | Table exists; no UI/import. |
| 3 | **Profile for Kehinde Agboola** | Olawale George added (WPForms row + local import). Kehinde still has no application row. |
| 4 | **PC ↔ cloud data sync** | **Bank ledger:** Admin → Import on live site (no WinSCP). **Profiles/manual DB edits:** WinSCP + Manual Deploy. |
| 5 | ~~**Wire bank import into Import tab UI**~~ | ✅ Done — Admin → Import → Bank Ledger Import (`POST /api/bank-import/run`). |
| 6 | **Persist Title Case in database (backfill)** | Script: `npm run pfm:normalize-profiles` then `:apply` locally → WinSCP upload + Manual Deploy. Display/save formatters already live (`2ce0dd7`). |
| 7 | **FlexxForms: public form mode for all PFM workspaces** | Every Cooperative's published membership/loan forms must work as clean `/p/{formId}` public URLs (no PlacementExpress / deal chrome). Applies to Assurance and all orgs we provision or will configure. PFM uses direct `/p/` iframe only. |

### High — user said they will provide info later

| # | Task | Notes |
|---|------|-------|
| 8 | **Member photos** | Admin and member upload supported; most members still on placeholder SVG. |

### Medium — operational

| # | Task | Notes |
|---|------|-------|
| 8 | **June 2026 statements** | Bank CSV has June deposits (partial month). Generalize `generate-may-2026-from-bank.js` → month argument. |
| 9 | **April distribution on statements** | May statements use February distribution column (workbook fallback). Confirm when amounts finalized. |
| 10 | **January 2026 verification** | Workbook has Jan 2026 column; bank CSV starts 2 Feb 2026. |
| 11 | **Regenerate April PDFs** | After distribution layout fix, April folder may have old layout if not re-run. |
| 12 | **Spreadsheet import placeholder dates** | `pfm:seed` still uses last-day-of-month; bank-imported txs have real dates. |
| 13 | **Currency display consistency** | Statements use NGN; PFM UI uses USD formatter. Cosmetic unless user wants one currency. |
| 14 | **Verify PDF statements on production** | Member monthly download after Puppeteer Chrome deploy. |

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
```

---

## 7. User communication context

- User is building this incrementally; **loans, expenses, and unclear items** will be provided later.
- User confirmed **regular member deposits** can be tracked now with workbook + bank CSV + Narrative column.
- User cares about **statement presentation** (distribution placement was explicitly corrected).
- **Assurance Status 4 2026** is authoritative through April 2026 end.
- Transcript of full build history: `.cursor/projects/.../agent-transcripts/0476ec24-f606-4198-a323-74c9b1aec2c6/0476ec24-f606-4198-a323-74c9b1aec2c6.jsonl`

---

## 8. Suggested next session plan

1. After deploy: **Admin → Import** corrected `cooperative-bank-ledger-reference.xlsx`; confirm **Ledger warnings** panel is empty
2. Import loan records + schedules when user provides data
3. Generalize month-from-bank script for June onward
4. Add Olawale / Kehinde profiles if applications supplied
5. Optional: single “monthly close” command — bank reconcile → update workbook → generate PDFs → refresh ledger → WinSCP upload

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
| Date formatting (UI) | `formatDate` in `peer-finance-manager/public/app.js` |
| Date formatting (PDF) | `formatDisplayDate` in `loan-statement-generator.js` |
| Member self-service | `peer-finance-manager/lib/member-self-service.js` |
| Bank ledger import | `peer-finance-manager/lib/import-bank-ledger.js` |
| CD dashboard | `peer-finance-manager/lib/cooperative-books.js`, `cd-balance-service.js` |
| DB tables | `peer-finance-manager/db/schema.sql` |

---

*End of handover. UI copy: `.cursor/rules/ui-copy-standards.mdc`. Continuous docs: `.cursor/rules/continuous-documentation.mdc` (always apply).*

**User docs:** [USER-GUIDE.md](./USER-GUIDE.md) · **Publish updates:** [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) · **Technical:** [README.md](./README.md)
