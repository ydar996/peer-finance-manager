# Peer Finance Manager — Project Documentation

**Assurance Investment and Cooperative Inc.** is a mutual-benefit cooperative that tracks member deposits, distributions, withdrawals, loans, and monthly account statements.

**Live (production):** https://peer-finance-manager.netlify.app  
**Local app:** `PeerFinanceManager.exe` on port **3457**

| Doc | Who it's for |
|-----|----------------|
| **[USER-GUIDE.md](./USER-GUIDE.md)** | Members, staff, admin — simple how-to |
| **[UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md)** | Yinka: change app & publish safely |
| **[UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md)** | Coop admins: backup, restore, and ledger on live Admin (browser only) |
| **[SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md](./SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md)** | Layman review: can PFM serve thousands of Cooperatives? |
| **[DEPLOY-TODAY.md](./DEPLOY-TODAY.md)** | First-time cloud setup (done) |
| **[AGENT_HANDOVER.md](./AGENT_HANDOVER.md)** | Developers / AI agents — **read first**; changelog + tasks; **auto-update docs every change** (§0) |

> **AI agents:** Read [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) §0 and `.cursor/rules/continuous-documentation.mdc` first. Update documentation in the **same turn** as every code change. The user must never have to ask for doc updates.

---

## Quick start

### Prerequisites

- **Node.js** (v18 or newer recommended)
- **Google Chrome** or **Microsoft Edge** (used by Puppeteer to render PDFs)
- Windows is the primary development environment; paths in scripts assume Windows defaults

### Install

```powershell
cd C:\Users\yinka\Documents\AssurCoop
npm install
```

### Launch (double-click)

**Double-click this file:**

```
C:\Users\yinka\Documents\AssurCoop\PeerFinanceManager.exe
```

(or the copy in `peer-finance-manager\dist\PeerFinanceManager.exe`)

- A console window opens — **keep it open** while you use the app
- Your browser opens automatically to **http://localhost:3457**
- Use the **Statements** tab to generate monthly PDF reports
- Close the console window to stop the app

**Or from the command line:**

```powershell
npm start
```

After code changes, rebuild the exe:

```powershell
npm run pfm:build
```

### First-time PeerFinanceManager setup

```powershell
npm run pfm:seed       # Import members & transactions from the April 2026 spreadsheet
npm run pfm:profiles   # Import membership application profiles from WPForms CSV
```

---

## The cooperative data model (plain language)

### Members

There are **24 active members** on the ledger. Each has:

- A **display name** on the spreadsheet (e.g. `Adedayo Tolani`, `Yomi Salami`)
- Monthly **deposit** amounts per calendar month
- A one-time **registration fee** of ₦100 (shown as a deduction)
- Optional **distribution** credits (profit/interest payouts)
- Occasionally **withdrawals** (negative values in a month column)

### The master spreadsheet

The source of truth for statements is the **Assurance Status** Excel workbook, e.g.:

- `Assurance Status 4 2026.xlsx` — accurate through **April 2026**
- `Assurance Status 5 2026.xlsx` — includes **May 2026** deposits filled from the bank CSV

Each statement month is a **sheet** named like `April 2026` or `May 2026`.

**Sheet layout:**

| Row | Content |
|-----|---------|
| 1 | Year labels above each month column |
| 2 | Headers: `Member Name`, `Total Deposits`, `Registration Income`, `Account Balance`, then month columns |
| 3+ | One row per member |

**Important rules:**

- **Positive** month values = deposits
- **Negative** month values = withdrawals
- `Total Deposits` = cumulative deposits across all months
- `Account Balance` = `Total Deposits` + `Registration Income` (registration is −100)
- Distribution columns look like `* Distribution - February` and are **credits** added at statement time

### Bank statement CSV

Bank of America exports include a **`Narrative`** column that classifies each transaction:

| Narrative | Meaning |
|-----------|---------|
| `Member Deposit` | Regular cooperative contribution |
| `Member Withdrawal` | Cash paid out to a member |
| `Loan Repayment` | Loan payment (not a deposit) |
| `Loan Disbursement` | Loan paid out from the account |

The bank CSV is used to **fill monthly deposit columns** and to **reconcile** against the workbook. Some bank rows are mislabeled (loan payments tagged as `Member Deposit`); the workbook is trusted when they disagree.

### Name matching

Bank and application names often differ from ledger names. The system maps variants automatically, for example:

| Bank / application name | Ledger name |
|-------------------------|-------------|
| KAMORU TOLANI | Adedayo Tolani |
| SAHEED SALAMI | Yomi Salami |
| OMOLOLU ADANRI | Lolu Adanri |
| AWOYINKA DARAMOLA | Yinka Daramola |
| GBANJU ARUWAYO… | Gbanju Aruwayo-Obe |

---

## Periodic statements (PDF reports)

### What it does

Reads the cooperative workbook, builds an HTML statement for each member, and saves a **PDF** per person.

### How to use (Statements tab)

1. Launch the app (`PeerFinanceManager.exe` or `npm start`).
2. Open the **Statements** tab.
3. Select the `.xlsx` workbook from the project folder.
4. The app picks the statement sheet (e.g. `May 2026`).
5. Optionally attach a separate **distribution file** — if the workbook already has a distribution column, that is used automatically.
6. Click **Generate PDF statements**. Progress is shown per member.
7. PDFs are saved under `statements/YYYY-MM/` (e.g. `statements/2026-05/`).

### Statement layout

Each PDF includes:

**Summary cards:** Total deposits, registration, per-year totals, distribution credit, current-month deposit/withdrawal, account balance.

**Period table:** Year totals, then each month from January through the statement month. The **distribution row appears directly after the February deposit** (by design). Withdrawals appear under their month.

**Special balance rule — members who withdrew in the statement period:**

If a member has a withdrawal in any month covered by the statement (e.g. Ejiro in April 2026), the closing balance is:

`Total Deposits + withdrawals` (registration and distribution are still **shown** but not double-counted).

Ejiro’s correct balance after the April withdrawal is **₦995.59**.

### Command-line generation

```powershell
# May 2026: build workbook from bank CSV, then generate PDFs
npm run generate:may-2026

# Compare April workbook against bank CSV
npm run compare:bank

# Other months (if scripts exist)
npm run generate:jan-2026
npm run generate:feb-2026
```

### Key files

| File | Role |
|------|------|
| `server.js` | Web server, upload, generation job API |
| `generator.html` | Statement generation UI |
| `lib/statement-generator.js` | Parse workbook, build HTML, render PDFs via Puppeteer |
| `lib/bank-statement-parser.js` | Parse BoA CSV with Narrative column |
| `scripts/run-generation-worker.js` | Background worker for PDF batch jobs |
| `scripts/generate-may-2026-from-bank.js` | May 2026 bank → workbook → PDFs pipeline |
| `scripts/compare-workbook-bank.js` | Reconciliation report |
| `styles.css` | Statement and UI styling |
| `statements/` | Generated PDF output folders |

---

## Member accounts, imports & loans

### What the app manages

- **Member ledger** — deposits, withdrawals, fees, distributions as transactions
- **Member banking profiles** — contact, address, next of kin, Zelle name (from WPForms applications); member portal self-service (biodata view, emergency contact edit, photo upload)
- **Periodic PDF statements** — Statements tab (see above)
- **Loans framework** — rules, validation, schedule import (no live loans loaded yet)
- **Bank ledger import** — **Import New Bank Activity** (append-only, preview, dedup) for monthly statements; **Full Ledger Refresh** (advanced) for master ledger replace; downloadable **Import Template** for catch-up; CLI `npm run pfm:import-bank` for local PC
- **Cooperative Books** — dashboard with CD balance and **Expected CD Interest** card
- **Expenses** — database table ready; UI not built

### How to use (web UI)

1. Launch the app and open **http://localhost:3457**.
2. **Members tab** — view balances; click **Profile** for full banking profile (photo placeholder or uploaded photo); click **Transactions** for ledger entries.
3. **Cooperative Books tab** — income, expenses, deposits, loans summary; CD balance and expected interest.
4. **Statements tab** — generate monthly PDF account statements.
5. **Loans tab** — view loans (empty until loans are added).
6. **Import tab:**
   - **Cooperative spreadsheet** — seeds/replaces the SQLite ledger from an Assurance Status workbook
   - **WPForms CSV** — imports membership application profiles
   - **Loan schedule** — CSV/Excel installment import for a loan ID
   - **Import New Bank Activity** — upload bank statement or PFM import template; preview New/Skipped/Review; append-only (monthly default)
   - **Full Ledger Refresh** — advanced master ledger replace with **Ledger warnings**
   - **Import Template** — download CSV/xlsx for historical catch-up
   - CLI `npm run pfm:import-bank` on PC

### Member portal (production: `/member`)

Members can sign in and use **My Account** to:

- View deposit and loan balances with transaction history (running balance)
- Expand **Membership Biodata** (read-only) and **Emergency Contact** (editable)
- Upload an optional profile photo
- Download monthly statement PDFs
- Open **Messages** (dedicated inbox) for two-way notes with the Cooperative admin; unread badge flashes on My Account
- On mobile: **Description** column hidden by default; tap **Show Descriptions** to expand

Admins use the **Messages** tab to broadcast to all members, a subset, or one member (per-tenant inbox in each org SQLite DB).

### Loan rules (configured, not yet populated)

| Rule | Value |
|------|-------|
| Guarantors required | 2 |
| Minimum membership before borrowing | 6 months |
| Default annual rate | 8% |
| Default term | 12 months |
| Maximum loan amount | Lesser of borrower deposits or combined guarantor deposits |
| Late fee | $25 after the 22nd of the month |

### Data storage

| Path | Contents |
|------|----------|
| `data/registry.db` | Multi-org registry (auth, org list) |
| `data/organizations/assurance/peerfinance.db` | Assurance ledger + profiles |
| `data/organizations/assurance/exports/` | Credential CSV, profile JSON exports |
| `data/bank-statement-2026.csv` | BoA export for bank import (local, gitignored) |

Exports: `data/organizations/assurance/exports/member-profiles.json`

### Key files

| File | Role |
|------|------|
| `peer-finance-manager/server.js` | API and static UI server |
| `peer-finance-manager/db/schema.sql` | Database schema |
| `peer-finance-manager/lib/import-spreadsheet.js` | Spreadsheet → ledger import |
| `peer-finance-manager/lib/import-wpforms-profiles.js` | WPForms CSV → member profiles |
| `peer-finance-manager/lib/member-profile-service.js` | Profile queries |
| `peer-finance-manager/lib/member-name-match.js` | Application ↔ ledger name mapping |
| `peer-finance-manager/lib/balance-service.js` | Balances and transactions |
| `peer-finance-manager/lib/loan-service.js` | Loan eligibility and lifecycle |
| `peer-finance-manager/lib/import-bank-ledger.js` | Bank CSV + xlsx → ledger import |
| `peer-finance-manager/lib/parse-bank-sources.js` | Merges BoA CSV with All deposits.xlsx |
| `peer-finance-manager/lib/member-self-service.js` | Member portal profile, photo, emergency contact |
| `peer-finance-manager/lib/cooperative-books.js` | Cooperative Books dashboard |
| `peer-finance-manager/lib/bank-import.js` | Bank import preview (UI) |
| `peer-finance-manager/public/` | Web UI |

### npm scripts (PeerFinanceManager)

| Script | Action |
|--------|--------|
| `npm run pfm` | Start the web app (same as `npm start`, port 3457) |
| `npm run pfm:seed` | Import ledger from `Assurance Status 4 2026.xlsx` / April 2026 |
| `npm run pfm:profiles` | Import profiles from WPForms CSV in project root |
| `npm run pfm:import-bank` | Import bank transactions from CSV + All deposits.xlsx |
| `npm run pfm:build` | Build standalone Windows `.exe` (optional) |

---

## Member profiles

**22 of 24** ledger members have profiles from the WPForms membership application CSV:

`wpforms-5-Assurance-Investment-and-Cooperative-Inc.-New-Membership-Application-2025-09-17-17-31-51.csv`

**No application on file:**

- **Olawale George** — active depositor; application missing from export
- **Kehinde Agboola** — on ledger; application missing from export

Each profile stores demographics, address, next of kin, Zelle/bank display name, application signature date, and an optional **profile photo** (upload via member portal or admin). Placeholder SVG shown when no photo uploaded.

---

## Generated statements (as of last run)

| Month | Source | Output folder |
|-------|--------|---------------|
| March 2026 | `Assurance Status 1 2025.xlsx` | `statements/2026-03/` |
| April 2026 | `Assurance Status 4 2026.xlsx` | `statements/2026-04/` |
| May 2026 | Bank CSV + `Assurance Status 5 2026.xlsx` | `statements/2026-05/` |

May 2026 had **10 members** with bank deposits; **14** had no May payment. All **24** received statements. April distribution credit is included on May statements.

---

## Architecture overview

### Production (live)

- **Netlify** — website (login UI) at `peer-finance-manager.netlify.app`
- **Render** — API + SQLite database on persistent disk (`/var/data`)
- **GitHub** — `ydar996/peer-finance-manager` — push code to deploy

See [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) for routine updates.

### Local development

```
┌─────────────────────────────────────────────────────────────────┐
│                     Assurance Status .xlsx                       │
│              (master cooperative spreadsheet)                    │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│           Assurance Cooperative Manager (port 3457)              │
│  • SQLite ledger & member profiles                               │
│  • Imports (spreadsheet, WPForms, bank ledger CLI)              │
│  • Loans framework                                               │
│  • Periodic PDF statements (Puppeteer) → statements/YYYY-MM/   │
│  • Member portal (profile, emergency contact, mobile UX)        │
└─────────────────────────────────────────────────────────────────┘

             ┌───────────────────┐
             │  Bank CSV (BoA)   │
             │  + All deposits   │
             │  + Narrative col  │
             └─────────┬─────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
  pfm:import-bank              compare-workbook-bank
  (ledger import)              generate-may-2026-from-bank
```

**Technology stack:** Node.js, Express, SheetJS (`xlsx`), Puppeteer, better-sqlite3, plain HTML/CSS/JS front ends. No React framework.

**Currency:** Statements display **NGN (₦)**. PeerFinanceManager ledger UI uses **USD ($)** formatting — amounts are the same numeric values from the spreadsheet.

---

## Troubleshooting

| Problem | Likely fix |
|---------|------------|
| Port already in use | Scripts run `kill-port.js` automatically; or close the other terminal |
| PDF generation fails | Install Chrome/Edge; or set `PUPPETEER_EXECUTABLE_PATH` |
| Sheet not found | Sheet must be named exactly `Month YYYY` (e.g. `May 2026`) |
| Distribution missing | Check for `* Distribution - {month}` column in workbook, or upload a distribution file |
| Profile shows “Missing” | Run `npm run pfm:profiles` |
| Bank vs workbook mismatch | Run `npm run compare:bank`; trust workbook for mislabeled loan rows |
| Date shows one day early | Known timezone bug — fixed in `formatDate()`; push latest code |
| Docs out of date | Read and update [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) first every session |

---

## Project layout (top level)

```
AssurCoop/
├── README.md                    ← Technical overview
├── USER-GUIDE.md                ← Simple user manual (members/admin)
├── UPDATE-AND-PUBLISH.md        ← How to change & publish safely
├── DEPLOY-TODAY.md              ← First-time cloud setup
├── AGENT_HANDOVER.md            ← Agent handover + changelog + tasks (read first)
├── UPLOAD-DATA-TO-PRODUCTION.md ← Coop admin data ops (Maintenance / Import; browser only)
├── SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md ← Layman scale / architecture review
├── UI-COPY-STANDARDS.md         ← Title Case, no em dashes
├── data/                        ← SQLite + bank CSV (gitignored; backup via Admin → Maintenance)
├── server.js                    ← Statement Generator server
├── generator.html               ← Statement UI
├── lib/
│   ├── statement-generator.js
│   └── bank-statement-parser.js
├── scripts/                     ← CLI tools and generation workers
├── statements/                  ← Generated PDFs by month
├── peer-finance-manager/        ← Ledger app
├── Assurance Status *.xlsx      ← Cooperative workbooks
├── Distributions/               ← Optional distribution files
└── wpforms-*.csv                ← Membership applications
```

---

## Further reading

- **User guide (simple):** [USER-GUIDE.md](./USER-GUIDE.md)
- **Update & publish:** [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md)
- **Agent / developer handover:** [AGENT_HANDOVER.md](./AGENT_HANDOVER.md)
- **First-time deploy:** [DEPLOY-TODAY.md](./DEPLOY-TODAY.md)
- **Port usage notes:** `Ports in Use by Applications.md`
