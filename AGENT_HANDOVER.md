# Agent Handover — Peer Finance Manager (AssurCoop)

This document gives the next developer or AI agent enough context to continue work without re-discovering the project from scratch.

**Last updated:** June 18, 2026 (member biodata Title Case)  
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

- **2026-06-18** — Member biodata Title Case: `peer-finance-manager/lib/text-format.js` normalizes names (e.g. `saheed a salami` → `Saheed A. Salami`), city, gender, address, and relationship on create/update/import; display path formats legacy DB rows. WPForms import keeps raw `applicationName` for ledger matching. **Production:** `git push` only.
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
| 5 | `lib/bank-statement-parser.js` | BoA CSV + Narrative + name aliases (statements/compare) |
| 6 | `peer-finance-manager/lib/member-name-match.js` | Application ↔ ledger names |
| 7 | `peer-finance-manager/lib/member-self-service.js` | Member portal profile, photo, emergency contact |
| 8 | `peer-finance-manager/db/schema.sql` | DB shape |

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

## 4. Outstanding tasks (prioritized)

### High — operational / product

| # | Task | Notes |
|---|------|-------|
| 1 | **Load active loans** | Framework exists; bank activity documented. User to provide schedules. |
| 2 | **Cooperative expenses** | Table exists; no UI/import. |
| 3 | **Profiles for Olawale George & Kehinde Agboola** | No WPForms row. |
| 4 | **PC ↔ cloud data sync** | Manual WinSCP only today; re-upload after each local data change. |
| 5 | **Wire bank import into Import tab UI** | CLI `pfm:import-bank` works; admin UI still preview-only. |

### High — user said they will provide info later

| # | Task | Notes |
|---|------|-------|
| 7 | **Member photos** | Admin and member upload supported; most members still on placeholder SVG. |

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
| 16 | **PFM bank-import tests** | No automated tests yet. |
| 17 | **Rebuild PFM exe** | After schema/profile/UI changes. |
| 18 | **Ejiro / withdrawal regression** | Always verify Ejiro balance when touching `statement-generator.js`. |

---

## 5. Known issues & gotchas

1. **Wrong May column** — Workbook has May columns for 2023–2026. Always match **year row + month header** (May 2026 = column index **46** on current sheets). Do not use `indexOf('May')` alone.

2. **Bank narrative errors** — Three April-ish mislabels documented in compare script output. Never blindly sum all `Member Deposit` rows without description checks.

3. **Gbanju 4/20/2026** — ₦434.34 loan repayment mislabeled `Member Deposit` in bank file.

4. **Oluwabiyi 3/16 and 4/10** — ₦443.55 loan payments mislabeled `Member Deposit`.

5. **Two Oluwatosin members** — `Oluwatosin Omotuyole` vs `Oluwatosin Ogunbowale`; bank alias patterns disambiguate.

6. **Sonia Udom CSV row** — First name `Sonia`, last name `Abraham Udom`; mapped to ledger `Sonia Udom`.

7. **Akili spelling** — Application `Tcha Binidi` → ledger `Akili Tcha Bindi`.

8. **`replaceExisting: true` on spreadsheet import** — Wipes ledger. Profiles survive in `member_profiles` table but re-link only if members re-imported with same names.

9. **Puppeteer** — Requires Chrome or Edge on Windows. Worker runs in separate process (`scripts/run-generation-worker.js`).

10. **Timezone date display** — `YYYY-MM-DD` strings parsed as `new Date('2026-06-08')` show one day early in US time zones. Fixed in `formatDate()` / `formatDisplayDate()` by parsing as local calendar date. Verify after any new date formatting code.

11. **User rules** — Do not git commit unless asked. Use `gh` for PRs. Real shell environment.

12. **Documentation** — `.cursor/rules/continuous-documentation.mdc` is `alwaysApply: true`. Update docs in the **same turn** as every change. Read `AGENT_HANDOVER.md` first every session. The user must never need to ask for doc updates.

---

## 6. Verification checklist (after changes)

```powershell
# Ledger + profiles
npm run pfm:seed
npm run pfm:profiles
npm run pfm:import-bank   # After updating bank CSV / All deposits.xlsx

# Reconciliation
npm run compare:bank

# Statements
npm run generate:may-2026
# Manually spot-check: Ejiro (₦995.59), Gbanju May deposit (₦170.12), distribution after February in table

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

1. Wire **Import tab** bank UI to call `import-bank-ledger` (CLI already works)
2. Import loan records + schedules when user provides data
3. Generalize month-from-bank script for June onward
4. Add Olawale / Kehinde profiles if applications supplied
5. Optional: single “monthly close” command — bank reconcile → update workbook → generate PDFs → refresh ledger → WinSCP upload

---

## 9. UI copy conventions (user-mandated)

Documented in `.cursor/rules/ui-copy-standards.mdc`. Apply to all new or edited user-facing text.

1. **Title Case** — Headers, paragraph hints, labels, buttons, badges, and section titles use Title Case (e.g. `Cooperative Books`, `Import Profiles`, `On File`).

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
