# Peer Finance Manager — Complete User Guide

**Simple language · Every feature · Every Cooperative**

This guide explains how to use Peer Finance Manager (PFM) without technical jargon. It applies to **every Cooperative** on the platform. Your data stays in your organization's private account.

**Live app:** https://peer-finance-manager.netlify.app  
**Example organization code:** `assurance` (Assurance Investment and Cooperative Inc.)

---

## Table of Contents

1. [Who Signs In Where](#1-who-signs-in-where)
2. [Words We Use](#2-words-we-use)
3. [Members — My Account](#3-members--my-account)
4. [Prospective Members — Apply Without Signing In](#4-prospective-members--apply-without-signing-in)
5. [Staff — Read-Only Access](#5-staff--read-only-access)
6. [Administrators — Overview](#6-administrators--overview)
7. [Cooperative Books Tab](#7-cooperative-books-tab)
8. [Members & Accounts Tab](#8-members--accounts-tab)
9. [Record Tab — Enter Transactions by Hand](#9-record-tab--enter-transactions-by-hand)
10. [Import Tab — Bank Statements and Bulk Data](#10-import-tab--bank-statements-and-bulk-data)
11. [Statements Tab — Member PDFs](#11-statements-tab--member-pdfs)
12. [Loans Tab](#12-loans-tab)
13. [Monthly Status Report Tab](#13-monthly-status-report-tab)
14. [Meetings Tab](#14-meetings-tab)
15. [Public Pages Tab](#15-public-pages-tab)
16. [Forms & Documents Tab](#16-forms--documents-tab)
17. [Users Tab — Logins and Passwords](#17-users-tab--logins-and-passwords)
18. [Subscription Tab](#18-subscription-tab)
19. [Common Monthly Workflows](#19-common-monthly-workflows)
20. [Fix a Misclassified Bank Entry](#20-fix-a-misclassified-bank-entry)
21. [When Numbers Look Wrong](#21-when-numbers-look-wrong)
22. [Common Problems](#22-common-problems)
23. [Offline App on Your PC](#23-offline-app-on-your-pc)
24. [Getting Help](#24-getting-help)

---

## 1. Who Signs In Where

| Role | URL | What you enter |
|------|-----|----------------|
| **Member** | `/member` | Organization code, **username**, password |
| **Staff** | `/staff` | Organization code, email, password |
| **Administrator** | `/admin` | Organization code, email, password |
| **New Cooperative** | `/register` | Register a new organization on the platform |

**Tip:** If Sign In seems to do nothing, hard-refresh the page (**Ctrl+Shift+R** on Windows). The first visit after idle can take up to 30 seconds while the server wakes up.

Members and staff **cannot** use each other's login page. Each Cooperative has its own organization code (for example `assurance`).

---

## 2. Words We Use

| Term | Plain meaning |
|------|----------------|
| **Cooperative** | Your member-owned organization (the group using PFM). |
| **Contributions Account** | A member's savings/contribution balance (deposits, withdrawals, distributions, fees). |
| **Loan Account** | Money a member borrowed and is paying back (separate from Contributions). |
| **Cooperative Books** | The treasurer's view of all income, expenses, bank balance, and member totals. |
| **Ledger** | The official list of all money movements in your Cooperative. |
| **Full Ledger Refresh** | Replace all bank-imported rows from a master file. **Advanced** — not for normal months. |
| **Import New Bank Activity** | Add **only new** rows from a bank statement. **Normal monthly workflow.** |
| **Skipped** | A bank line already in the ledger; PFM will not add it again. |
| **New** | A bank line not yet in the ledger; PFM will add it when you click **Add New Transactions**. |
| **Review** | PFM needs you to set **Type** and **Member** before it can add the row. |
| **Category** | How a member transaction is classified (Member Deposit, Loan Repayment, etc.). |
| **Reclassify** | Change the Category of one existing row. |
| **Split** | Divide one payment into two or more parts (e.g. part loan, part contribution). |
| **Master ledger file** | Your reconciled historical spreadsheet through a past date (used for Full Ledger Refresh). |
| **Pending Approval** | A membership applicant not yet active on **Members & Accounts**. |
| **Former Member** | Resigned, Deceased, Expelled, or Suspended: off the active list and member emails; ledger history kept. |
| **Membership Status** | Admin-selected type: Active, Resigned, Deceased, Expelled, or Suspended. |

---

## 3. Members — My Account

### Sign in

1. Open **https://peer-finance-manager.netlify.app/member**
2. Enter your **Organization Code**, **Username**, and **Password** (from credentials your Cooperative sent).
3. Click **Sign In**.

First-time users must change the temporary password when prompted.

### What you can do

| Section | What it shows |
|---------|----------------|
| **My Profile** | Your biodata (mostly read-only; contact the Cooperative to change other fields). |
| **Emergency Contact** | View or update your emergency contact. |
| **Profile Photo** | Upload or change your photo. |
| **Contributions Account** | Balance and transaction history with running balance. |
| **Loan Account** | Each loan you have; expand to see repayments and balance after each payment. Paid loans are collapsed by default. |
| **Monthly statement PDF** | Download your contributions statement. |
| **Cooperative Status Reports** | Month-end Cooperative summary PDF when the administrator publishes it. |
| **Cooperative Meetings** | Meeting date, time, location, and agenda when announced (email too, if configured). |

### On a phone

- Use the **power icon** (top right) to sign out.
- Transaction tables hide **Description** by default. Tap **Show Descriptions** if you need full detail.
- Swipe sideways on wide tables if needed.

---

## 4. Prospective Members — Apply Without Signing In

Your Cooperative can share public pages (no login):

| Page | Typical URL |
|------|-------------|
| **About Us** | `/c/{your-org-code}/about` |
| **Bylaws** | `/c/{your-org-code}/bylaws` |
| **Apply for Membership** | Linked from About Us or Bylaws |

On a phone, rotate to **landscape** for a wider signature area. The page header and footer hide automatically while you sign.

After you submit an application, it goes to administrators automatically.

---

## 5. Staff — Read-Only Access

1. Open **https://peer-finance-manager.netlify.app/staff**
2. Sign in with organization code, staff email, and password.
3. You can **view** Cooperative data. You **cannot** change anything.

---

## 6. Administrators — Overview

### Sign in

1. Open **https://peer-finance-manager.netlify.app/admin**
2. Enter organization code, admin email, and password.
3. Click **Sign In**.

### Admin tabs at a glance

| Tab | Use it for |
|-----|------------|
| **Cooperative Books** | Dashboard: income, expenses, bank balance, member totals. Click any card for detail. |
| **Members & Accounts** | Member list, profiles, balances, photos, reclassify/split transactions. |
| **Statements** | Generate monthly PDF statements for all members. |
| **Loans** | Loan portfolio, repayments, loan PDFs, loan agreements. |
| **Record** | Register members, post contributions, fees, loans, expenses by hand. |
| **Import** | Bank statements, bulk spreadsheets, Full Ledger Refresh (advanced). |
| **Status Report** | Month-end Cooperative performance PDF; publish to members. |
| **Meetings** | Schedule meetings; email and portal announcements. |
| **Public Pages** | Publish About Us and Bylaws for prospective members. |
| **Forms & Documents** | FlexxForms setup; review and approve membership applications. |
| **Subscription** | PFM platform billing (Stripe or check). |
| **Users** | Member logins, staff accounts, download credentials. |

Most sections use **expandable panels** (click the header to open). You only open what you need.

---

## 7. Cooperative Books Tab

The home dashboard for treasurers.

### Summary cards

Click any card to see a detailed table. Common cards:

| Card | Meaning |
|------|---------|
| **Ledger Checking Balance** | Bank balance from imported/manual ledger activity. |
| **Bank Reconcile Status** | **Reconciled** when live ledger still matches the last successful bank import; **Out of Sync** if the cash balance at the verified date drifted. A **Split** can raise the internal row count by 1 while the bank balance stays the same; the app realigns that row count when the balance still matches. **Not Verified** until the first post-deploy import. |
| **Member Contributions Accounts (Total)** | Sum of all member contribution balances. |
| **Member Contributions & Withdrawals** | Contributions minus withdrawals (excludes distributions and fees). |
| **Registration Income** | Membership fees collected. |
| **Cooperative Expenses** | Operating costs. |
| **Distributions Paid** | Profit/interest paid to members. |
| **Cooperative Net Income** | Income minus expenses. |
| **Loans Outstanding** | Principal still owed on active loans. |
| **CD Account / Expected CD Interest** | Certificate of deposit balance and interest (if used). |

Click **Refresh** to reload after imports or manual entries.

---

## 8. Members & Accounts Tab

### Find a member

- Search by **name** or **member number** (e.g. AIC-001).
- Click a row to open their profile on the right.
- Default list shows **Active** members only.
- Turn on **Show Former Members** to see Resigned, Deceased, Expelled, or Suspended accounts (ledger history still available).

### Member profile sections

| Section | Contents |
|---------|----------|
| **Membership Biodata** | Name, contact, address, joined date, etc. |
| **Membership Status** | Admin sets status **type** (Active, Resigned, Deceased, Expelled, Suspended). |
| **Contributions Account** | Balance and transaction history. |
| **Loan Account** | Active and paid loans with repayment history. |
| **Upload Photo** | Admin can add or change profile photo. |

**Pending Approval** applicants do **not** appear here until approved (see [Forms & Documents](#16-forms--documents-tab)).

### Membership ends (resign, death, expulsion, suspension)

Membership does not only end by resignation. Admins choose the **status type** that matches how membership ceased:

| Status Type | Typical use |
|-------------|-------------|
| **Resigned** | Written resignation (e.g. Assurance bylaws Art. 4.1). |
| **Deceased** | Membership ends on death (Art. 4.2). |
| **Expelled** | Expulsion after required notice and vote (Art. 4.3). |
| **Suspended** | Suspension under expulsion/suspension procedures. |
| **Active** | Reinstate someone who should be back on the active list. |

**Procedure (example: Sonia Udom cash-out / resignation at Assurance):**

1. Settle the Member Account (withdrawal / payout; clear loans and debts).
2. Keep written resignation (or other governance record) on file outside the app as required by bylaws.
3. Open **Members & Accounts** → select the member → under **Membership Status**, choose the correct **Status Type** (e.g. **Resigned**), optional effective date and note.
4. Optionally attach a **Resignation/Termination Document** (PDF or image of the written notice) → **Update Membership Status**.
5. Later, use **Download Document** on that form to retrieve the file on record.

**What the system does:**

- Removes them from the default **active** member list.
- Keeps their ledger history (do **not** delete the member).
- Stores the uploaded notice (PDF/JPEG/PNG/WebP/GIF) on the member profile.
- Excludes them from Cooperative **member emails** (meetings, monthly report notices).
- Blocks member portal login until status is set back to **Active**.

Use **Show Former Members** when you need to open a former account for history or corrections.

### Register a new member from here

Click **Register Member** (shortcut to the **Record** tab).

---

## 9. Record Tab — Enter Transactions by Hand

Use **Record** for one-off entries. Use **Import** when you have a bank file or spreadsheet.

Each form is collapsed until you expand it.

| Section | When to use it |
|---------|----------------|
| **Register New Member** | Add a member to the ledger; optional biodata and $100 registration fee. Includes **Gender** (Male, Female, Decline to Specify). |
| **Update Member Profile** | Change phone, email, address, gender, emergency contact, etc. |
| **Registration Fee** | Post the one-time $100 fee for an existing member. |
| **Current Bank Balance** | Update checking balance from a bank statement (reference point). |
| **CD Account Balance** | Update CD balance from a bank statement. |
| **Member Contributions Account** | Post a **Contribution** or **Withdrawal** for one member. |
| **Member Distribution** | Credit one member with profit/interest (distribution). |
| **Bulk Distribution (Excel)** | Upload a sheet with member names and amounts for a batch distribution. |
| **New Loan** | Create a loan (borrower, two guarantors, principal, rate, term). |
| **Loan Repayment** | Record a payment against a specific loan. |
| **Cooperative Expense** | Record an operating expense (category, description, amount, date). |
| **Recent Expenses / Recent Distributions** | Quick view of latest entries. |

Every form has its own **Save** or **Record** button. Changes apply immediately when you submit.

---

## 10. Import Tab — Bank Statements and Bulk Data

**Prefer xlsx?** Upload and download xlsx throughout; csv is optional and used for bank statement exports.

### A. Import New Bank Activity (normal monthly workflow)

**Use this every month** (and anytime you want interim balance updates).

Upload a **cumulative** bank export: **period start through today**. PFM skips rows already imported and adds only **New** ones.

1. Open **Import** → expand **Import New Bank Activity**.
2. Choose **Bank account**.
3. Upload `.csv`, `.xlsx`, or `.ofx`/`.qfx`.
4. Click **Preview**.
5. Review the table:

| Status | Meaning |
|--------|---------|
| **New** | Will be added. Fix **Type** and **Member** dropdowns if wrong. |
| **Skipped** | Already in the ledger. Safe to ignore on re-upload. |
| **Review** | Set **Type** and **Member** before applying. |

6. Read the **balance check** line:
   - **Red Blocked:** fix the issue before applying (see [When Numbers Look Wrong](#21-when-numbers-look-wrong)).
   - **Green note** (ledger above statement beginning): normal for re-uploads; duplicates will be Skipped.
7. Click **Add New Transactions**.
8. Check **Cooperative Books** : **Bank Reconcile Status** should show **Reconciled** after a successful import.

**Re-upload the same file anytime.** Duplicates are never added twice.

### B. Bank Accounts and Import Settings (first-time setup)

Expand **Bank Accounts and Import Settings**:

1. **Registered Bank Accounts** — see your accounts.
2. **Add Bank Account** — label, institution, currency, statement format.
3. **Edit Selected Account** — institution, format, active dates, and:
   - **Classification Rules** — keywords PFM uses to recognize contributions and loans on bank lines.
   - **Payment Name Mappings** — map Zelle/bank names to members. Set **Default Type** when the bank line has no keyword (e.g. payer name only → Loan Repayment).

Pick the correct bank account before each import.

### C. Other import sections (use when needed)

| Section | Purpose |
|---------|---------|
| **Download Import Template** | Blank CSV/xlsx for manual transaction lists. |
| **Cooperative Spreadsheet** | Bulk load contributions, withdrawals, fees, distributions. |
| **Membership Applications (WPForms CSV)** | Import biodata and payment names from a CSV export. |
| **Loan Repayment Schedule** | Upload installment schedule for a specific loan. |
| **Full Ledger Refresh (Advanced)** | Rebuild **all** bank-imported rows from a master ledger file. **Not for monthly use.** |

### D. Full Ledger Refresh (advanced only)

Use when the **base ledger is wrong** or you are rebuilding from your master historical file.

1. Expand **Full Ledger Refresh (Advanced)**.
2. Choose master ledger `.csv` or `.xlsx`.
3. Click **Preview** — check row count and ending balance.
4. Click **Import Bank Ledger**.
5. Optionally **Download Csv Ledger** / **Download Xlsx Ledger** from live books.

**Standard two-step reset** (any Cooperative):

1. **Full Ledger Refresh** with master file (historical through your last reconciled date).
2. **Import New Bank Activity** with the current month's cumulative bank export.

No special scripts required: both steps are in the admin UI.

---

## 11. Statements Tab — Member PDFs

Generate monthly **Contributions Account** PDF statements for all members.

1. Open **Statements**.
2. Under **Monthly Workbook**, select your Assurance Status-style workbook (`.xlsx`).
3. Optional: choose or upload a **Distribution/Interest** file for the period.
4. Click **Generate PDF Statements**.
5. PDFs save under `statements/YYYY-MM/` on the server.

**Loan statements:** use **Statement** on the **Loans** tab or on the member's **Loan Account** profile (one PDF per loan).

---

## 12. Loans Tab

View the full **Loan Portfolio**:

| Column | Meaning |
|--------|---------|
| **Principal / Repaid / Outstanding** | Loan amounts and progress. |
| **Repayments** | Open repayment history. |
| **Statement** | Generate loan PDF. |
| **Agreements** | Create guarantor or borrower agreements (FlexxForms). |

### Loan Payment Policy (Admin)

Under **Loans → Loan Payment Policy**, choose how repayment timing works for **new loans only**:

| Mode | Behavior |
|------|----------|
| **Flexible: Pay Within Loan Term (No Late Fee)** | Default. Payments apply to the agreed schedule whenever they arrive during the loan term. No late fee. |
| **Strict Timelines: Late Fee When Past Due** | Admin sets interest terms and a schedule with due dates (New Loan or Import Schedule). A payment after its due date adds a flat late fee (default **$25**, editable) in addition to the expected installment. |

Changing the toggle does **not** change past loans. Each loan keeps the policy in effect when it was started.

Create new loans on the **Record** tab → **New Loan**.

Record repayments on **Record** → **Loan Repayment**, or via bank import when classified as **Loan Repayment**.

---

## 13. Monthly Status Report Tab

Cooperative-wide performance PDF for members.

| Action | What it does |
|--------|--------------|
| **Generate Report** | Build PDF from current ledger. |
| **Publish to Members** | Makes it visible on member portals. |
| **Download PDF** | Save a copy locally. |
| **Unpublish** | Remove from member view. |

**Organization & Report Settings** (admin):

- Cooperative **time zone** (default Pacific).
- **Auto-generate** and **auto-publish** at month-end (on by default).
- Optional organization website on the cover.

**Operational Expense Labels:** assign report labels to expense lines so the PDF groups them cleanly.

---

## 14. Meetings Tab

| Action | Steps |
|--------|-------|
| **Schedule a meeting** | Expand **Schedule a Meeting** → title, date, time, location, agenda → **Save Draft** → announce when ready. |
| **Member view** | Announced meetings appear on every member's portal. |
| **Email reminders** | Configure under **Meeting Reminder Settings** (requires email setup). |
| **Email Send Audit** | **Refresh Audit** to see which notification emails were sent or failed. |

---

## 15. Public Pages Tab

Publish content for **prospective members** (no login required).

| Section | Options |
|---------|---------|
| **About Us Page** | Paste plain text (PFM formats it), upload images, or link to an external About URL. Toggle **Publish**. Click **Save About Page**. |
| **Bylaws Page** | Paste text, upload PDF, or link to external bylaws URL. Toggle **Publish**. Click **Save Bylaws Page**. |

Public links appear at the top of this tab to copy and share.

---

## 16. Forms & Documents Tab

### FlexxForms integration

- **Open FlexxForms** to build membership and loan forms.
- Assign **Membership Form Id**, **Loan Form Id**, and agreement document ids.
- Click **Save Form & Document Ids**.

### Membership applications workflow

1. Applicant submits via public **Apply for Membership** link.
2. Application appears under **Membership Applications** as **Pending Approval**.
3. Applicant does **not** appear on **Members & Accounts** yet.
4. Before **Approve Member**, record on their profile:
   - **Membership fee** ($100) — **Record** tab or fee workflow.
   - **Initial contribution** ($100 deposit) — **Record** → **Member Contributions Account**.
5. When both are recorded, status becomes **Ready for Approval**.
6. Click **Approve Member** to activate the account.

**Delete** removes a test or mistaken application (only if still Pending Approval with no ledger activity).

---

## 17. Users Tab — Logins and Passwords

| Task | How |
|------|-----|
| **Create staff or member login** | **Create Account** form (role, email, password; link member for member role). |
| **Provision all members at once** | **Generate Member Credentials** → **Download Credentials CSV**. |
| **Portal URLs** | Listed under **Sign-In Pages** (/member, /staff, /admin). |

Members sign in with **username** (not always email). Staff and admins use **email**.

Temporary passwords must be changed on first member sign-in.

---

## 18. Subscription Tab

Manage your Cooperative's **Peer Finance Manager** platform subscription (Stripe or check payment). Admin only.

---

## 19. Common Monthly Workflows

### Treasurer month-end checklist

1. **Import New Bank Activity** — cumulative statement through today.
2. Fix any **Review** rows in preview; confirm balance check is green.
3. Click **Add New Transactions**.
4. Open **Cooperative Books** → confirm **Ledger Checking Balance** matches your bank.
5. Spot-check a few members on **Members & Accounts**.
6. **Generate PDF Statements** (Statements tab).
7. **Generate** and **Publish** Monthly Status Report (optional: auto-publish is on by default).
8. Announce next **Meeting** if needed.

### Approve a new member

1. Confirm application in **Forms & Documents**.
2. **Record** registration fee and initial contribution.
3. **Approve Member**.
4. **Users** → ensure they have login credentials (or **Generate Member Credentials**).

### Disburse a loan

1. **Record** → **New Loan** (borrower, guarantors, terms).
2. Record disbursement via bank import or manual entry.
3. **Loans** tab → create agreements if needed.

---

## 20. Fix a Misclassified Bank Entry

On **Members & Accounts**, open the member → expand **Contributions Account** or **Loan Account**.

Every adjustable bank row has a **Category** dropdown and a **Split** button. There is **no Save Changes button on the table**.

**Contributions Account:** Member Deposit, Withdrawal, Distribution, Registration Fee, and cross-classifications (e.g. deposit → Loan Repayment).

**Loan Account:** Use **Bank Ledger Rows (Split or Reclassify)** for full bank amounts, or the per-loan repayment table (same **Split** / **Category** controls). Works the same for every Cooperative and every member.

### Reclassify (move whole entry to another category)

1. Change the **Category** dropdown (e.g. Member Deposit → **Loan Repayment**).
2. Click **OK** on the confirm dialog (or **Cancel** to undo).
3. Balances update immediately. The row moves to the correct account section.

### Split (part contribution, part loan, expense, or any mix)

1. Click **Split** on the row.
2. In the **Split Transaction** dialog, set **Category**, **Member** (when required), and **Amount** on each line.
3. Use **Add Line** for a third, fourth, or more parts. Mix contributions, loans, expenses, CD, and investment categories as needed.
4. Line amounts must total the original bank amount exactly. **Save Split** stays disabled until they do.
5. Click **Save Split**.
6. Download the updated **Xlsx** / **Csv** ledger from the prompt and replace your local master so PC and cloud stay aligned.

After a split, **Current Bank Balance** is unchanged when the math is correct. **Bank Reconcile Status** realigns when only the internal row count rose (any number of split lines) and the verified cash balance still matches.

### After reclassify or split

A green **Ledger Updated** banner offers **Download Xlsx Ledger** / **Download Csv Ledger**, plus a notice to replace your local master. Adjustments are saved per tenant and re-applied on every **Full Ledger Refresh**.

**Not adjustable here:** rows showing **:** in Category (Cooperative-level ledger types, not member bank rows).

---

## 21. When Numbers Look Wrong

| Situation | What to do |
|-----------|------------|
| **Bank balance wrong after import** | Check preview **Review** rows. Re-upload cumulative stmt; Skipped rows are fine. |
| **Import blocked (ledger below statement beginning)** | Ledger is missing history. **Full Ledger Refresh** with master file, then import stmt again. |
| **Import blocked (ending mismatch)** | Fix **Type**/**Member** on **New** rows in preview, or fix base ledger first. |
| **One member's row wrong** | [Reclassify or split](#20-fix-a-misclassified-bank-entry) on **Contributions Account** or **Loan Account** (Bank Ledger Rows). |
| **Payment covers loan and contribution** | **Split** on the full bank row: set lines and **Save Split** (Coop Admin). |
| **Whole ledger corrupted** | **Full Ledger Refresh** (master) + **Import New Bank Activity** (current month stmt). |
| **Bank Reconcile Status: Out of Sync** | Cash balance at the verified date drifted, or an older build flagged a split’s extra ledger row. Prefer **Full Ledger Refresh** + cumulative stmt import if the **balance** is wrong. If only the row count changed after a Split and the bank balance is still correct, deploy the classification row-align fix (or Refresh Cooperative Books after that deploy). |

---

## 22. Common Problems

| Problem | What to try |
|---------|-------------|
| Invalid username or password | Check organization code, username/email, and password (case-sensitive). |
| Blank page or login spins | Wait 30 seconds; hard-refresh (**Ctrl+Shift+R**). |
| PDF download fails | Wait one minute after a deploy; try again. |
| Birthday or date off by one day | Ensure latest app version is deployed. |
| Applicant not on Members list | They are **Pending Approval** until you approve them. |
| Dropdown change did nothing | You may have clicked **Cancel** on the reclassify confirm dialog. |

---

## 23. Maintenance Tab (Backup, Restore, Profile Tools)

**Admin → Maintenance** is where Cooperative admins back up, restore, and normalize profiles on the live site.

| Section | Purpose |
|---------|---------|
| **Database Backup** | Download `peerfinance.db` for this Cooperative (archive or before risky changes). |
| **Database Restore** | Upload a `.db` backup, preview row counts, then restore. Replaces live data; no Manual Deploy required. |
| **Normalize Profiles (Title Case)** | Preview and apply formatting to member profiles and ledger names on production. |
| **Live Database Status** | Row counts, integrity, and reconcile snapshot. |

**When to use restore:** disaster recovery or copying a known-good backup onto production. For bank ledger corrections, prefer **Import → Full Ledger Refresh** + **Import New Bank Activity** so reconcile anchor stays correct.

---

## 24. Offline App on Your PC

**PeerFinanceManager.exe** in the AssurCoop folder works without internet for desk work.

It does **not** auto-sync with the live website. See [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) for publishing changes.

---

## 25. Getting Help

| Need | Contact |
|------|---------|
| **Technical / admin issues** | Your Cooperative administrator (e.g. Yinka Daramola — `yinka@eworkchop.com` for Assurance). |
| **Deploy and publish app changes** | [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) |
| **Database backup or restore** | **Admin → Maintenance** (see §23) |
| **Email notifications setup** | [EMAIL-NOTIFICATIONS-SETUP.md](./EMAIL-NOTIFICATIONS-SETUP.md) or [BLUEHOST-EMAIL-RELAY-SETUP.md](./BLUEHOST-EMAIL-RELAY-SETUP.md) |

---

*Last updated: July 11, 2026. This guide covers all admin tabs and member workflows for every Cooperative tenant on Peer Finance Manager.*
