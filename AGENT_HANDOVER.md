# Agent Handover — Peer Finance Manager (AssurCoop)

This document gives the next developer or AI agent enough context to continue work without re-discovering the project from scratch.

**Last updated:** June 19, 2026  
**Organization:** Assurance Investment and Cooperative Inc. (slug: `assurance`)  
**Workspace:** `C:\Users\yinka\Documents\AssurCoop`  
**Production:** https://peer-finance-manager.netlify.app (UI) + https://peer-finance-manager.onrender.com (API)  
**GitHub:** `ydar996/peer-finance-manager`

---

## 0. IMMUTABLE AGENT INSTRUCTIONS (always follow)

**Every agent session that changes code, config, or operations MUST update project documentation before finishing.**

### Required documentation updates (checklist)

| When you change… | Update these files |
|------------------|-------------------|
| Any feature, bug fix, or behavior | **AGENT_HANDOVER.md** — § Changelog + § Outstanding tasks |
| User-visible screens, login, or workflows | **USER-GUIDE.md** |
| Deploy, cloud, Git push, or data upload | **UPDATE-AND-PUBLISH.md** and/or **DEPLOY-TODAY.md** |
| Architecture, ports, stack, folder layout | **README.md** — Architecture + Project layout |
| UI labels/buttons (Title Case rules) | `.cursor/rules/ui-copy-standards.mdc` and **UI-COPY-STANDARDS.md** if conventions change |
| Data upload to production (WinSCP) | **UPLOAD-DATA-TO-PRODUCTION.md** |

### Changelog rule

Append a dated bullet under **§ Changelog** in this file:

```
- **YYYY-MM-DD** — What changed, why, and any production/deploy notes.
```

### Outstanding tasks rule

- Mark completed items ✅ or remove them.
- Add new tasks discovered during the session.
- Keep **High / Medium / Low** priorities current.

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
| [DEPLOY-TODAY.md](./DEPLOY-TODAY.md) | Yinka | First-time cloud setup (already done) |
| [README.md](./README.md) | Developers | Technical overview |
| **AGENT_HANDOVER.md** | Agents | Background, architecture, tasks, changelog |

---

## Changelog

- **2026-06-19** — Fixed Gbanju alias (`GBANJU P ARUWAYOOBE`); CD balance updated to $7,211.82 with term metrics and **Expected CD Interest** dashboard card; bank re-import now 0 skipped rows (57 loan repayments).
- **2026-06-19** — Bank import through 2026-06-16: merged 3 new BoA deposits (Lolu $50, Mutiu $100.04, Clement $100.02) into `data/bank-statement-2026.csv`; ran `import-bank-ledger.js` (450 bank_import txs, last date 2026-06-16). **Production:** WinSCP upload `data/` → Render `/var/data` + Manual Deploy required.
- **2026-06-19** — Added USER-GUIDE, UPDATE-AND-PUBLISH, immutable doc rules (§0). Production live on Netlify + Render.
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
- Spreadsheet import dates deposits on **last day of month** (placeholder until real bank dates used)

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
| ✅ Done | Manual Record tab: register member, profile edit, membership fee |
| ✅ Done | Cooperative Books dashboard |
| ✅ Done | **Production:** Netlify (static UI) + Render (Express API + SQLite on disk) |
| ✅ Done | Member credential export CSV |
| ✅ Done | Puppeteer PDF on Render (Chrome installed at build) |
| 🟡 Partial | Bank import — preview only |
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
| `stmt (1).csv` | User's BoA export (Feb–Jun 2026); not in repo by default — in Downloads |

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

Bank CSV ──► bank-statement-parser.js ──► month columns / compare scripts
                (not yet fully wired into PFM bank-import)
```

### Critical files — read these first

| Priority | File | Why |
|----------|------|-----|
| 1 | `lib/statement-generator.js` | All statement logic, balance edge cases, PDF HTML |
| 2 | `peer-finance-manager/lib/import-spreadsheet.js` | How workbook maps to ledger |
| 3 | `lib/bank-statement-parser.js` | BoA CSV + Narrative + name aliases |
| 4 | `peer-finance-manager/lib/member-name-match.js` | Application ↔ ledger names |
| 5 | `peer-finance-manager/db/schema.sql` | DB shape |

### Ports

- **3457** — **Assurance Cooperative Manager** — `npm start` or double-click **`PeerFinanceManager.exe`**
- **3456** — Legacy statement-only server (`npm run statements:legacy-server`) — deprecated

**Exe locations:** `PeerFinanceManager.exe` (project root) and `peer-finance-manager/dist/PeerFinanceManager.exe`. Rebuild with `npm run pfm:build`. Build copies `lib/statement-generator.js` and `styles.css` beside the exe for PDF generation.

### npm scripts reference

```powershell
npm start                  # Statement Generator
npm run pfm                # PeerFinanceManager
npm run pfm:seed           # Ledger from spreadsheet
npm run pfm:profiles       # WPForms → profiles
npm run generate:may-2026  # Bank + workbook → May PDFs
npm run compare:bank       # Workbook vs bank CSV
npm run pfm:build          # Package PFM as .exe
```

---

## 4. Outstanding tasks (prioritized)

### High — operational / product

| # | Task | Notes |
|---|------|-------|
| 1 | **Load active loans** | Framework exists; bank activity documented. User to provide schedules. |
| 2 | **Wire full bank import into PFM** | Reuse `lib/bank-statement-parser.js` in `bank-import.js`. |
| 3 | **Cooperative expenses** | Table exists; no UI/import. |
| 4 | **Profiles for Olawale George & Kehinde Agboola** | No WPForms row. |
| 5 | **PC ↔ cloud data sync** | Manual WinSCP only today; document after each local data change. |
| 6 | **Verify PDF statements on production** | After Puppeteer Chrome deploy; member monthly download. |

### High — user said they will provide info later

| # | Task | Notes |
|---|------|-------|
| 7 | **Member photos** | `photo_path` NULL; placeholder SVG. |

### Medium — operational

| # | Task | Notes |
|---|------|-------|
| 6 | **June 2026 statements** | Bank CSV already has June deposits (partial month). Generalize `generate-may-2026-from-bank.js` → `generate-month-from-bank.js` with month argument. |
| 7 | **April distribution on statements** | May statements use February distribution column (workbook fallback). Confirm when April/May distribution amounts are finalized. |
| 8 | **January 2026 verification** | Workbook has Jan 2026 column (₦800.58 total); bank CSV starts 2 Feb 2026 — cannot reconcile January from current export. |
| 9 | **Regenerate April PDFs** | After distribution layout fix (Feb placement), April folder may still have old layout if not re-run. |
| 10 | **Real transaction dates in ledger** | Spreadsheet import uses last-day-of-month placeholders. Bank CSV has actual dates — import should use them. |
| 11 | **Currency display consistency** | Statements use NGN; PFM UI uses USD formatter. Cosmetic unless user wants one currency. |

### Low — engineering hygiene

| # | Task | Notes |
|---|------|-------|
| 12 | **Unify bank parsers** | Root `bank-statement-parser.js` vs PFM `bank-import.js` duplication. |
| 13 | **PFM bank-import tests** | No automated tests yet. |
| 14 | **Rebuild PFM exe** | After schema/profile changes. |
| 15 | **Ejiro / withdrawal regression** | Always verify Ejiro balance when touching `statement-generator.js`. |

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

10. **User rules** — Do not git commit unless asked. Use `gh` for PRs. Real shell environment.

---

## 6. Verification checklist (after changes)

```powershell
# Ledger + profiles
npm run pfm:seed
npm run pfm:profiles

# Reconciliation
npm run compare:bank

# Statements
npm run generate:may-2026
# Manually spot-check: Ejiro (₦995.59), Gbanju May deposit (₦170.12), distribution after February in table

# Apps start
npm start   # → http://localhost:3456/generator.html
npm run pfm # → http://localhost:3457
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

When the user returns with loan/expense data:

1. Import loan records + schedules into PFM
2. Complete bank import: deposits → transactions, repayments → loan installments, expenses → expenses table
3. Generalize month-from-bank script for June onward
4. Add Olawale / Kehinde profiles if applications supplied
5. Optional: single “monthly close” command — bank reconcile → update workbook → generate PDFs → refresh ledger

---

## 9. UI copy conventions (user-mandated)

Documented in `.cursor/rules/ui-copy-standards.mdc`. Apply to all new or edited user-facing text.

1. **Title Case** — Headers, paragraph hints, labels, buttons, badges, and section titles use Title Case (e.g. `Cooperative Books`, `Import Profiles`, `On File`).

2. **Slash compounds — no spaces** — When joining terms with `/`, do not space around the slash:
   - `Deposit Account/Loan Account` (not `Deposit Account / Loan Account`)
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
| DB tables | `peer-finance-manager/db/schema.sql` |

---

*End of handover. UI copy rules: `.cursor/rules/ui-copy-standards.mdc`.*

**User docs:** [USER-GUIDE.md](./USER-GUIDE.md) · **Publish updates:** [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) · **Technical:** [README.md](./README.md)
