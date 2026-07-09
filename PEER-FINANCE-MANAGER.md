# Peer Finance Manager : What It Does

Peer Finance Manager is cloud software built for **member-owned Cooperatives** and **peer finance groups**. Each Cooperative gets its own secure space with its own members, books, and branding. Think of it as a digital back office plus a member portal : so treasurers stop wrestling with spreadsheets and members can see their own accounts anytime.

---

## Who It Is For

| Audience | How they use it |
|----------|-----------------|
| **Cooperative administrators** | Run the books, import bank activity, approve loans, publish reports, manage member logins |
| **Staff / board (read-only)** | Review finances and member accounts without changing anything |
| **Members** | View contributions, loans, statements, meeting notices, and Cooperative performance reports |
| **Platform operator** | Host many Cooperatives, manage subscriptions and billing |

---

## Sign-In and Roles

Everyone signs in through a **web browser** with an **organization code** (for example `assurance`).

- **Member Portal** : members see only their own profile and accounts
- **Staff Portal** : read-only view of Cooperative books, members, loans, and statements
- **Administrator Portal** : full management access
- **Register** : a new Cooperative can sign up and create its first administrator account
- **Platform Administration** : for the SaaS operator managing all tenants

Members with temporary passwords are asked to **set a new password** on first login.

---

## Cooperative Books (Financial Dashboard)

The dashboard is the administrator’s and staff’s home screen. It shows a live picture of the Cooperative’s finances with **clickable cards** that open detailed breakdowns.

### Activity at a glance
- Deposits this month
- Deposits year-to-date (with comparison to prior years)
- Loan repayments due this month

### Full financial picture
- Total member contribution accounts
- Contributions and withdrawals
- Registration income (one-time membership fees)
- CD interest income
- Loan interest income
- Total Cooperative income
- Cooperative expenses
- Distributions paid to members
- Net Cooperative income
- Expected future loan interest
- Loans outstanding (principal and count)
- Current bank checking balance
- Certificate of deposit balance and projected interest
- Cooperative investments
- Member profiles on file

Clicking a card opens tables : often **by member** : and you can jump straight to a member’s profile from there.

---

## Members and Accounts

Search members by **name or member number** (for example AIC-001).

Each member profile includes:
- Photo, contact details, address, Zelle name, emergency contact
- **Contributions account** : full history with running balance; monthly PDF statement
- **Loan account(s)** : schedule, repayments, outstanding balance; per-loan PDF statements

Administrators can edit full biodata. Members can update **emergency contact** and **profile photo** only.

---

## My Account (Member Portal)

Members see a simplified, mobile-friendly view of:
- Their profile and emergency contact
- Contributions balance and transaction history
- Downloadable monthly contribution statements (PDF)
- Active loans with repayment history and schedules
- Published **Cooperative performance reports**
- Announced **meetings**
- Links to public **About Us** and **Bylaws** pages when published

---

## Loans

### For administrators
- Create loans with borrower, **two guarantors**, principal, rate, term, and notes
- Built-in **eligibility rules** (for example minimum membership period; limits based on deposits)
- Record repayments manually
- Import a repayment schedule from Excel or CSV
- Late fee support in business rules
- Portfolio view of all loans with interest earned and amounts outstanding
- Generate loan statement PDFs

### For members
- View each loan’s balance, schedule, and repayment history in My Account

---

## Record (Day-to-Day Entry)

Administrators can enter transactions without spreadsheets:

- Register a new member (with optional registration fee)
- Update member profile / biodata
- Record registration fee for an existing member
- Update current **bank balance** and **CD balance** as of a date
- Member contribution or withdrawal
- Distribution to one member
- **Bulk distribution** from an Excel upload
- New loan and loan repayment
- Cooperative expense (with categories: Bank Fees, Administrative, Technology, Meeting/Event, Professional Services, Insurance, Other)

Recent expenses and distributions appear on the same screen for quick reference.

---

## Import (When You Already Have Files)

- **Cooperative spreadsheet** : contributions, withdrawals, fees, distributions
- **Membership applications** (WPForms CSV) : biodata linked to ledger names
- **Loan repayment schedule** : for a specific loan
- **Import New Bank Activity** (default monthly) : upload bank statement or PFM import template; preview New/Skipped/Review; append-only with fingerprint dedup; bank account and date format per Cooperative
- **Import Template** (CSV/xlsx) : historical catch-up; required columns Date, Description, Amount, Type; Member when type affects a member account
- **Full Ledger Refresh** (advanced) : master Excel/CSV replaces all bank-imported rows
  - Conflict warnings if manual entries would be lost
  - Tools to download or sort the reference file before upload

---

## Bank Ledger and Reconciliation

Cooperatives can import **new bank activity** each month without re-uploading the full master file. Append import classifies Type and Member, blocks ambiguous rows in preview, and never duplicates existing transactions. **Full Ledger Refresh** remains for master-file rebuilds. The dashboard **bank balance** card reflects checking activity. Pre-import checks help catch proxy mis-credits and contribution vs loan misclassification.

---

## Statements

- **Batch monthly PDF statements** for all members’ contribution accounts
- Optional distribution/interest column from a file
- **Per-loan PDF statements** from the Loans tab or member profile

---

## Monthly Performance Reports

- Auto-generated **PDF Cooperative performance report** at month-end
- Can auto-publish to the member portal
- Administrators can generate, publish, unpublish, or download manually
- Organization **time zone** setting drives report dates
- Expense lines can be labeled for cleaner report totals

---

## Meetings and Announcements

Administrators can schedule meetings (title, date, time, location, virtual link, agenda) and **announce** them to all members. Email reminders can be sent when email is configured. Members see upcoming meetings in My Account.

---

## Public Pages (No Login Required)

Each Cooperative can publish:

- **About Us** : mission, membership, leadership, photos
- **Bylaws** : readable HTML version plus optional PDF

Shareable links look like `/c/your-org-code/about` and `/c/your-org-code/bylaws`. Links also appear on login screens when published.

---

## Users and Access

Administrators can:
- Provision **all member logins** at once with temporary passwords
- Download a **credentials CSV** for distribution
- Create individual staff or member accounts
- See who has signed in and reset password status

---

## Subscription and Billing

Cooperatives pay a platform subscription (card via **Stripe**, or check by arrangement).

- Monthly, quarterly, or annual plans
- Grace period when payment lapses : viewing continues; **recording changes** may be blocked until active again
- Platform administrator can record check payments, extend grace, or grant legacy access

---

## Security and Data Isolation

- Each Cooperative’s data is **isolated** : separate database context per organization
- Role-based access: members see only themselves; staff read-only; admins write
- Subscription gate protects write operations when billing is inactive

---

## Automation (Background)

- Month-end report generation and optional auto-publish (scheduled)
- Meeting email reminders when SMTP is configured

---

## Desktop Option

A separate **Windows desktop** build exists for local administrator use (documented separately). It does not automatically sync to the cloud : the web app is the shared system of record for hosted Cooperatives.

---

## Quick Summary

Peer Finance Manager helps Cooperatives **track member money**, **manage loans**, **import bank activity**, **publish statements and reports**, **announce meetings**, and give **members a transparent view** of their own accounts : without everyone sharing one spreadsheet.

**Typical workflow:** register the Cooperative → add members → import or record transactions → use the dashboard daily → publish monthly reports → members log in to see their balances and download statements.
