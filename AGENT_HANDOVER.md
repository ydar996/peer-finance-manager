# Agent Handover — Assurance Cooperative (AssurCoop)

This document gives the next developer or AI agent enough context to continue work without re-discovering the project from scratch.

**Last updated:** June 2026  
**Organization:** Assurance Investment and Cooperative Inc.  
**Workspace:** `C:\Users\yinka\Documents\AssurCoop`

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

### PeerFinanceManager (port 3457)

| Status | Item |
|--------|------|
| ✅ Done | SQLite schema: members, transactions, distributions, loans, installments, expenses, bank_imports |
| ✅ Done | Spreadsheet seed import (24 members, 366 transactions from April 2026 sheet) |
| ✅ Done | Member banking profiles from WPForms CSV (22/24 linked) |
| ✅ Done | Profile UI with photo placeholder |
| ✅ Done | Loan validation/create/schedule-import APIs |
| 🟡 Partial | Bank import — preview only (`lib/bank-import.js` stub) |
| 🟡 Partial | PFM `bank-import.js` does not use root `lib/bank-statement-parser.js` yet |
| ❌ Not done | Expenses UI / import |
| ❌ Not done | Active loans loaded into system |
| ❌ Not done | Windows `.exe` may need rebuild after recent changes (`npm run pfm:build`) |

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

### Single app (unified June 2026)

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

### High — user said they will provide info later

| # | Task | Notes |
|---|------|-------|
| 1 | **Load active loans** | User to provide loan details (borrowers, amounts, schedules). Framework exists: `createLoan`, schedule CSV import. Known bank activity: checks 1187 (−₦8,400), 1190 (−₦5,000) disbursements; multiple Zelle loan repayments (Gbanju, Oluwabiyi, Yomi, Taiwo proxy). |
| 2 | **Wire full bank import into PFM** | Reuse `lib/bank-statement-parser.js` in `peer-finance-manager/lib/bank-import.js`. Match deposits to members, repayments to loans, flag expenses. User mentioned BoA template may come later. |
| 3 | **Cooperative expenses** | `expenses` table exists; no UI or import. User to clarify categories and sample data. |
| 4 | **Profiles for Olawale George & Kehinde Agboola** | Applications not in WPForms export; user may supply separately. |
| 5 | **Member photos** | `member_profiles.photo_path` is NULL; placeholder SVG in use. Need upload UI or manual path. |

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

*End of handover. UI copy rules: `.cursor/rules/ui-copy-standards.mdc`. For user-facing usage, see [README.md](./README.md).*
