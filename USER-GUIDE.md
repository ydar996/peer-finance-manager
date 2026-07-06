# Peer Finance Manager — User Guide (Simple)

**For:** Assurance Investment and Cooperative Inc. — administrators, staff, and members.

**Live website:** https://peer-finance-manager.netlify.app  
**Organization code:** `assurance`

---

## For members — view your account

1. Open: **https://peer-finance-manager.netlify.app/member**
2. Enter:
   - **Organization code:** `assurance`
   - **Username:** *(sent to you by the Cooperative)*
   - **Password:** *(sent to you — temporary)*
3. Click **Sign In**

**What you can see on My Account:**

- **My Profile** — expand **Membership Biodata** to review your details (read-only; contact the Cooperative to change other fields)
- **Emergency Contact** — expand to view or update your emergency contact (optional)
- **Profile Photo** — optional upload or update (members can change a photo the Cooperative already added)
- Contributions account balance and transaction history with running balance
- Loan account (if you have a loan): expand **Loan Account** to see each loan; **Actual Repayments** show a running **Balance** after each payment; paid loans are collapsed by default
- Download **monthly statement PDF**
- **Cooperative Status Reports** — when the administrator publishes the month-end Cooperative summary, it appears here for download (PDF)
- **Cooperative Meetings** — when the administrator announces a meeting, date, time, location, and agenda appear here (and by email if configured)

**On a phone:** the header hides the long Cooperative subtitle and your name/role line; use the **power icon** (top right) to sign out. There is no **My Account** tab — you land directly on your profile and balances after sign-in. Transaction tables hide the **Description** column by default so dates and amounts fit better. Tap **Show Descriptions** at the top of My Account if you need the full detail. Tap **Hide Descriptions** to collapse again. Swipe sideways on a table if you need to see every column. Each transaction stays on one line.

**First visit may be slow** (up to 30 seconds) if the server was idle — wait and try again.

### Apply for membership (public)

Prospective members can learn about the Cooperative and apply without signing in:

1. **About Us:** **https://peer-finance-manager.netlify.app/c/assurance/about**
2. **Bylaws:** **https://peer-finance-manager.netlify.app/c/assurance/bylaws**
3. **Apply for Membership:** **https://peer-finance-manager.netlify.app/c/assurance/apply**

Each page includes **Apply for Membership** buttons that link to the online application. The apply page loads the FlexxForms membership form via **embed.js** (no login required). A **Signing Tip** at the top asks you to rotate your phone to **landscape** when you reach the signature field. After a successful submit, a confirmation message appears on the page; your application also flows to administrators automatically.

Legacy deep link (still works): **https://peer-finance-manager.netlify.app/?apply=assurance** redirects to the apply page above.

After you submit, the Cooperative receives your application automatically. An administrator will review it after your **membership fee** and **initial contribution** are confirmed.

---

## For administrators — full control

1. Open: **https://peer-finance-manager.netlify.app/admin**
2. Enter:
   - **Organization code:** `assurance`
   - **Email:** `yinka@eworkchop.com`
   - **Password:** *(your admin password)*

**Main tabs:**

| Tab | What it does |
|-----|----------------|
| **Cooperative Books** | Income, expenses, member contributions, loans summary; CD balance and **Expected CD Interest**. Click a card for detail. |
| **Members & Accounts** | Member list, balances, full profiles; select a member to **Upload Photo** (admin) |
| **Statements** | Generate batch PDF statements |
| **Loans** | View and manage loans |
| **Record** | Add members, record contributions, fees, expenses (each form collapsed until expanded) |
| **Import** | **Bank Ledger Import** on live site (upload `cooperative-bank-ledger-reference.xlsx`); spreadsheet, profiles; optional CLI `npm run pfm:import-bank` on PC. Import shows **Ledger warnings** for proxy Zelle mis-credits before you confirm. |
| **Status Report** | Monthly Cooperative status PDF: generate, publish to member portal, download; organization time zone and auto-publish settings (admin) |
| **Meetings** | Schedule meetings, announce to members (portal + email), cancel, reminder settings (admin) |
| **Public Pages** | Publish About Us HTML and Bylaws PDF for prospective members (admin) |
| **Forms & Documents** | FlexxForms setup, membership/loan form ids, review and approve membership applications (admin) |
| **Subscription** | Peer Finance Manager SaaS billing: Stripe or check (admin) |
| **Users** | Member login accounts and credentials |

**Forms & Documents** tab (admin):

- **Public membership application link** — share **https://peer-finance-manager.netlify.app/c/assurance/apply** (also linked from About Us and Bylaws pages). Legacy `/?apply=assurance` redirects to the same page.
- **Membership Applications** — each FlexxForms submission creates a **Pending Approval** member profile automatically.
- Before you click **Approve Member**, record on that profile:
  1. **Membership fee** ($100) — use **Record** or existing fee workflow.
  2. **Initial contribution** ($100 deposit) — use **Record** to post a deposit for the applicant.
- When both are recorded, status becomes **Ready for Approval** and **Approve Member** activates the account.

---

## For staff — read-only access

1. Open: **https://peer-finance-manager.netlify.app/staff**
2. Sign in with your staff email and password.
3. You can **view** Cooperative data — you cannot make changes.

---

## On your computer (offline app)

You can still use **PeerFinanceManager.exe** on your PC (double-click in the `AssurCoop` folder).

- Works without internet
- Good for admin work at your desk
- **Does not auto-sync** with the live website — see [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) if you need cloud data updated

---

## Common problems

| Problem | What to try |
|---------|-------------|
| "Invalid username or password" | Check org code `assurance`, username, and password (case-sensitive) |
| Blank page or login spins | Wait 30 seconds and refresh — server may be waking up |
| PDF download fails | Wait for admin to confirm Render deploy is Live; try again in a minute |
| Numbers look wrong online | **Bank ledger:** Admin → Import — upload corrected master xlsx; read **Ledger warnings**. Other data: see [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md) |
| Birthday or date off by one day | Fixed in latest app code — admin should `git push` to deploy |

---

## Who to contact

**Technical / admin issues:** Yinka Daramola — `yinka@eworkchop.com`

**Member credentials list (admin only):**  
`data/organizations/assurance/exports/member-credentials-2026-06-13.csv`

---

*Last updated: July 1, 2026. For how to change and publish the app, see [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md).*
