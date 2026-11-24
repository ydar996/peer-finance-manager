# Peer Finance Manager — What the App Does (Nigeria Edition)

*A plain-language description of every feature, written for anyone — no
technical background needed. Last updated: November 24, 2026.*

---

## 1. What It Is, in One Paragraph

Peer Finance Manager is a bookkeeping and member-management system built
for member-owned cooperatives (co-ops, thrift societies, savings clubs,
cooperative societies). It replaces the spreadsheet a treasurer keeps: it
tracks every naira members put in or take out, runs loans and interest,
produces the financial reports an executive committee expects, and gives
each member a private login where they can see their own money. It is
sold as a subscription service — each cooperative gets its own private
space, and one cooperative can never see another's data.

**This edition covers the Nigeria setup:** naira (₦), dates written
DD/MM/YYYY, Nigerian banks and states in the picklists, district fields
labeled "LGA", and payment instructions labeled "Bank Transfer". A
separate document describes the United States edition.

---

## 2. Who Uses It

| Person | What they see |
|--------|---------------|
| **Cooperative Administrator** | The whole back office: books, members, imports, loans, reports, settings. Usually the treasurer or secretary. |
| **Staff** | Read-only access to the books, members, loans, statements, reports, and meetings. Can look, cannot change. |
| **Member** | A small personal portal: their own balances, loan status, statements, and messages from the cooperative. |
| **Prospective member** | A public application page — no login needed. |
| **Platform Administrator** | The product owner (us). Manages which cooperatives exist and their subscriptions. Never touches a cooperative's money. |

Everyone signs in with an email and password. A cooperative is identified
by an **Organization Code** (like `acme-coop`), so two people in
different cooperatives can never mix up their data. Members can also sign
in with a simple username.

---

## 3. The Money Model (How the App Thinks)

Everything in the app flows from one list: the **Bank Ledger** — a line
for every deposit, withdrawal, and charge in the cooperative's real bank
accounts. Each line is labeled with what the money actually was:

- **Member Contribution / Deposit** — a member paying money in
- **Share Capital** — a member buying ownership shares
- **Registration Fee** — the one-time fee to join (default ₦50,000, set
  per cooperative)
- **Loan Disbursement** — money lent out to a member
- **Loan Repayment** — a member paying a loan back
- **Interest Income** — interest earned (on loans or bank deposits)
- **Expense** — money the cooperative spent
- **Distribution** — money paid out to members from profits
- **Investment** — money moved into a fixed deposit or other investment
- **Transfer** — money moving between the cooperative's own accounts

Every number on every report is just these labeled lines, added up.
If a number looks wrong, the fix is always the same: find the mislabeled
line and relabel it. Nothing is ever "lost" — every naira is accounted
for on exactly one line.

Members also each have a **Contributions Account** (their savings with
the cooperative, default opening contribution ₦50,000) and may have a
**Share Capital** balance, both tracked separately from the bank ledger
so a member's personal total is always available.

---

## 4. Cooperative Books (the Dashboard)

The home screen is a wall of summary cards — the cooperative's finances
at a glance. Each card shows one number, and clicking it opens a detail
table listing every transaction behind that number, with a bold total
row at the bottom. Money going out is shown in parentheses, the way
accountants write it.

The cards cover:

- **Deposits This Month / This Year** — member money in, with a note
  comparing to last year's total
- **Member Contributions & Withdrawals** — net savings per member
- **Member Share Capital** — ownership shares per member
- **Registration Income, Other Income, Distributions, Expenses**
- **Loans Outstanding, Loan Interest, Expected Interest, Repayments Due**
- **Cooperative Investments** — net position (money currently invested)
- **Fixed Deposit** account and **FD Interest** earned
- **Bank Accounts** — every account and its balance, added up
- **Bank Ledger** — the full transaction list described above
- **Total Cooperative Income** and **Cooperative Net Income** — the
  profit-and-loss view: income lines, a Total Income subtotal, expenses
  subtracted, and the final net figure
- **Bank Reconcile Status** — a traffic-light check: does the app's
  balance for each account still match the last bank statement imported?

Rule of the house: **the column always adds up to the total.** If a
detail table's numbers cannot sum to its footer, that is a bug.

---

## 5. Members & Accounts

A full member directory. For each member the app keeps:

- Contact details, a profile photo, and a member number
- Their contributions account balance and share capital
- Their transaction history
- A membership **status**: Active, Resigned, Deceased, Expelled, or
  Suspended — non-active members keep their history but lose benefits
  and disappear from active lists
- Login credentials for the member portal, which can be reset with one
  click (see Security below)

New members are added one at a time, or in bulk from a spreadsheet
template during onboarding. The app can also recognize members inside
bank-statement narrations through **payment aliases** — alternate names
a member's transfers arrive under (a spouse's account, a business name).

---

## 6. Getting Bank Data In (the Import Tab)

The normal monthly routine: export the bank statement as a CSV or Excel
file, upload it, preview the new transactions, and confirm. The app:

- **Auto-detects the bank's file layout** — Nigerian exports often use
  Trans Date or Value Date, Narration, and separate Debit and Credit
  columns with DD/MM/YYYY dates; it recognizes those headers
  automatically
- **Knows your banks** — pick from a list of Nigerian institutions
  (GTBank, Zenith, Access, UBA, First Bank, Providus, and more), and it
  learns each bank's column format after the first import
- **Remembers aliases** — "GTB" and "Guaranty Trust Bank" are the same
  bank
- **Skips duplicates** — every line gets a fingerprint, so re-uploading
  the same statement never double-counts
- **Flags conflicts** — if a new file disagrees with something already
  recorded, it warns instead of silently overwriting
- **Anchors reconciliation** — the app marks the point each account was
  last confirmed against the bank, so the Reconcile card stays honest

Other import tools, used less often: a bulk **member import** template
for onboarding, loan schedule imports, and **Full Ledger Refresh** — an
advanced wipe-and-rebuild reserved for corrections.

---

## 7. Fixing Mistakes (Reclassify & Split)

When a bank line was auto-labeled wrong — say a loan repayment came in
as a generic deposit — the admin can:

- **Reclassify** it: move the whole entry to the correct category
- **Split** it: carve one entry into parts (part contribution, part loan
  payment, part fee — any mix that adds back to the original amount)

Every change is recorded in an **audit trail** (who changed what, when,
and why it used to say), so the books stay explainable later.

---

## 8. Record Tab (Manual Entries)

For money that never touched a bank import — cash deposits, a transfer
confirmed outside the statement, a manual adjustment — the admin types
it in directly. Manual entries join the same ledger and carry the same
categories as imported ones.

---

## 9. Loans

A complete small-loan workflow for lending to members:

- **Disburse a loan** to a member — principal, interest rate, term
- **Repayment plan** — the app builds the schedule of what is due and when
- **Track every payment** against principal and interest, with
  outstanding balance always visible
- **Payment policy per loan** — *flexible* (extra money prepays the loan)
  or *strict* (payments must match the schedule), plus optional late fees
- **Loan statements** — a clean PDF per member, per month
- **Due-date notices** — optional reminders to members as payments
  approach
- **Loan applications** — members apply through a web form (see Forms &
  Documents); the admin reviews, approves, sets terms, and disburses
- **Expected interest and repayments due** cards on the dashboard show
  what should arrive soon

---

## 10. Statements & Reports (the PDFs Members See)

- **Member Deposit Statements** — a monthly PDF per member showing their
  contributions in and out, like a bank statement. Can be generated one
  at a time or for everyone at once.
- **Loan Statements** — the same idea for loans: disbursements,
  payments, interest, balance.
- **Monthly Status Report** — the executive-committee document: a
  balance sheet (bank accounts + investments + fixed deposits = assets;
  member deposits + share capital = what the cooperative owes back), an
  income statement (income minus expenses = net income), bank balances
  per account, and a custom-labels section for operating expenses.
  Finished reports are **published** so members can read them in their
  portal.

---

## 11. Meetings

Schedule a cooperative meeting and the app handles the notification:
members get told when it is announced, reminded before it happens, and
told if it is cancelled. Notices arrive by email (if member emails are
switched on) and always inside the member's portal inbox.

---

## 12. Messages

Two-way in-app messaging between the cooperative and its members —
announcements from the admin, questions from members — without needing
anyone's phone number or a separate email thread or WhatsApp group.
Members see an inbox in their portal.

---

## 13. Public Pages & Applications

Each cooperative gets a public website at `/c/their-code` with:

- An **About** page and **Bylaws** page the admin can edit
- A **membership application form** — prospective members apply without
  an account; the admin reviews, approves, or declines, and approval can
  trigger the welcome flow automatically
- Links into the member portal

Applications (membership and loans) can also run through **FlexxForms**,
a companion forms product: the cooperative builds a form there, links it
in the app, and submissions arrive automatically with a full
review-approve-track workflow. Only the cooperative's own branding shows.

---

## 14. Users, Logins & Security Tab

- **Users tab**: create admin, staff, and member logins; reset anyone's
  password with one click; export a one-time credentials CSV for handing
  out member logins
- **Password resets are done by secure link** — a one-use, 24-hour
  "set your password" URL, not a password typed into an email
- **MFA (authenticator-app codes)** is available on the Security tab for
  admin and staff accounts
- **Members never see settings** — their portal is balances, statements,
  and messages only

---

## 15. Automated Messages & Email

The app can send email on the cooperative's behalf — welcome messages,
deposit confirmations, loan due notices, meeting announcements, annual
dues reminders, published-report alerts. Every template is editable by
the admin.

One master switch — **"Email Members Automatically"** at the top of the
Automated Messages tab — turns all member-facing email on or off. It
ships **off**: the cooperative opts in deliberately. Admin notifications
and member-requested password resets always work regardless. Every send
is recorded in an email audit log, including sends that were skipped.

**Annual dues**: the app tracks who has paid their yearly dues and can
send reminders to those behind — also gated by its own setting and the
master switch.

---

## 16. Subscription & Billing

The cooperative's own subscription to Peer Finance Manager:

- Plans: **monthly ₦40,343**, **quarterly ₦119,818**, or **annual
  ₦464,744** (paying longer costs less)
- Pay online by card (Stripe) or record a bank-transfer payment manually
- A grace period keeps access running if a payment is late
- Status, plan, and renewal date are always visible on the tab

---

## 17. Maintenance (Backups & Restore)

- **Download an encrypted backup** — the whole database, protected by a
  passphrase of your choosing (AES-256 encryption). Even if the file is
  lost, nobody can open it without the passphrase.
- **Plain backup** is also available for convenience.
- **Restore** accepts either file type, verifies the file is a genuine
  database before touching anything, and **saves a copy of the current
  data first** — a restore can be undone.
- Member credential exports are kept to the most recent file, so
  passwords do not accumulate on the server.

---

## 18. Under the Hood (for the Curious)

Layman version of the safety features:

- Each cooperative's data lives in its **own separate database file** —
  there is no way for one co-op's numbers to leak into another's
- Passwords are **scrambled** with an industry-standard algorithm; the
  app stores the scramble, never the password
- Login pages **slow down repeat guessers** automatically, and the
  limits survive server restarts
- Sessions ride in **browser-protected cookies** that no webpage script
  can read; changing a password kills every other login immediately
- **MFA** via standard authenticator apps is available for admin/staff
- Payment webhooks (Stripe, FlexxForms) verify cryptographic signatures
- A weekly automated check watches for newly published security flaws in
  the app's building blocks
- The app also runs **offline on a PC** as a desktop install, for
  cooperatives that prefer to keep data at home

---

## 19. The Daily Picture

A treasurer's month with the app:

1. Import the bank statement → new transactions preview → confirm
2. Fix any mislabeled lines with reclassify/split
3. Watch the dashboard cards update themselves
4. Disburse approved loans, record repayments as they arrive
5. Generate member statements and the Monthly Status Report
6. Publish the report, remind about the meeting, done

Everything else — dues notices, application reviews, member questions —
lands in the tabs described above.
