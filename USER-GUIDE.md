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
3. **Apply for Membership:** opens `/c/{slug}/apply?from=about` or `?from=bylaws` depending on which page you started from. The form loads on the Cooperative site; after you submit, you return to that page. A short thank-you message appears once and does not stay after you refresh.

Each page includes **Apply for Membership** buttons that open the online application. After a successful submit, your application flows to administrators automatically via the FlexxForms webhook.

Legacy deep link (still works): **https://peer-finance-manager.netlify.app/?apply=assurance** redirects to the apply page.

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
| **Import** | All sections collapsed by default (expand when needed). **Import New Bank Activity** (append-only; CSV/xlsx/OFX; preview with balance check). **Bank Accounts and Import Settings** (format, rules, aliases). **Full Ledger Refresh** (advanced). Spreadsheet, profiles. |
| **Status Report** | Monthly Cooperative status PDF: generate, publish to member portal, download; organization time zone and auto-publish settings (admin) |
| **Meetings** | Schedule meetings, announce to members (portal + email), cancel, reminder settings (admin). **Email Send Audit** (admin): on-demand history of notification batches with recipient Sent/Failed detail and the current eligible recipient list. |
| **Public Pages** | Publish About Us HTML and Bylaws PDF for prospective members (admin) |
| **Forms & Documents** | FlexxForms setup, membership/loan form ids, review and approve membership applications (admin) |
| **Subscription** | Peer Finance Manager SaaS billing: Stripe or check (admin) |
| **Users** | Member login accounts and credentials |

**Forms & Documents** tab (admin):

- **Public membership application link** — share **https://peer-finance-manager.netlify.app/c/assurance/apply** (shown in **Forms & Documents** and linked from About Us and Bylaws). Applicants return to the page they started from after submit.
- **Membership Applications** — each FlexxForms submission creates a **Pending Approval** member profile automatically.
- Before you click **Approve Member**, record on that profile:
  1. **Membership fee** ($100) — use **Record** or existing fee workflow.
  2. **Initial contribution** ($100 deposit) — use **Record** to post a deposit for the applicant.
- When both are recorded, status becomes **Ready for Approval** and **Approve Member** activates the account.
- **Delete** (test or mistaken submissions): removes the application from the list. If the linked profile is still **Pending Approval** with no deposits, fees, or loans on the ledger, the prospective member profile is removed too. Approved members cannot be deleted here.

### Import bank activity (admin)

The **Import** tab keeps every section collapsed until you expand it. Each header shows a short hint for what that section does.

Use **Import New Bank Activity** for normal monthly updates. Use **Full Ledger Refresh** only when replacing the entire master ledger.

**Monthly bank statement (recommended):**

1. Open **Import**.
2. Expand **Import New Bank Activity**.
3. Choose your **Bank account** (e.g. Main Operating Account).
4. Upload the bank export (`.csv`, `.xlsx`, or `.ofx`/`.qfx`).
5. Click **Preview**. Check the table:
   - **New** — will be added. Use the **Type** and **Member** dropdowns if auto-classification is wrong.
   - **Skipped** — already in the ledger (cannot change here; use **Full Ledger Refresh** to correct).
   - **Review** — set **Type** and **Member** in the preview before applying.
6. Read **Detected format** and the **balance check** line (statement beginning/ending vs ledger). A red warning means **new rows** do not tie to statement ending. A pre-period gap note means the ledger opening differs from statement beginning before these rows: that is not caused by the rows in this preview.
7. Click **Add New Transactions**.
8. Confirm balances on **Cooperative Books** and affected members.

Re-uploading the same statement adds nothing (duplicates are skipped automatically).

**Historical catch-up or migration:**

1. Expand **Import New Bank Activity**.
2. Expand **Download Import Template** and click **CSV** or **Xlsx**.
3. Fill rows: **Date**, **Description**, **Amount**, **Type** on every line; **Member** when the type affects a member account.
4. Upload the completed file through **Import New Bank Activity** → Preview → Add.

**Bank account, format, and date settings:**

1. Expand **Bank Accounts and Import Settings**.
2. Expand **Registered Bank Accounts** to review the table, **Add Bank Account** to create one, or **Edit Selected Account** for changes (nested **Account Details** and **Classification Rules** inside edit).
3. **First-time setup:** select the account under **Edit Selected Account**, set **Institution name** (e.g. Bank of America), confirm **Account label** and **Currency**, pick **Statement format** (or leave **Auto-detect**), set cooperative **Date format**, then **Save Account and Settings**.
4. **Statement format:** choose a profile that matches your bank export, or **Custom Column Mapping** and fill column header names (Date, Description, Amount, etc.).
5. **Classification rules (Cooperative-wide):** under **Classification Rules**, edit contribution and loan keywords (plain phrases, comma-separated).
6. **Payment name mappings:** map each member to the name as it appears on Zelle or the bank statement (comma-separated if more than one). No regex or code required.
7. **Add another bank or account:** use **Add Bank Account** (label, institution, currency, format). Check **Set as primary account** if this becomes your main operating account.
8. **Change banks:** add the new account with an **Active from** date; on the old account set **Active to** to the last day you used it. Imports then go to the new account only.
9. When importing, pick the matching account in **Import New Bank Activity** before you upload the statement.

**Other Import sections:** expand **Cooperative Spreadsheet**, **Membership Applications (WPForms CSV)**, or **Loan Repayment Schedule** only when you need bulk loads outside bank activity.

**Full Ledger Refresh (advanced):** replaces all bank-imported rows from a master ledger file. Use only for a full rebuild, not monthly updates.

1. Expand **Full Ledger Refresh (Advanced)**.
2. Choose your master ledger file (`.csv` or `.xlsx`).
3. Hover the **i** next to each button if you are unsure what it does.
4. Click **Preview** to see row count, ending balance, and any **Ledger warnings** before importing.
5. Fix issues in your file if needed, then click **Import Bank Ledger**.
6. After import, warnings (if any) stay visible in **Ledger warnings** below the status line.
7. **Download Csv Ledger** / **Download Xlsx Ledger** pull from live Cooperative Books (after import). **Sort & Download Csv Ledger** sorts the file you chose locally without importing.

**If append is blocked (opening balance mismatch):** the live ledger does not match your statement beginning. Do **not** force the import. Run **Full Ledger Refresh** with your cooperative's master ledger file, confirm the row count and ending balance match your records, then append the monthly statement again.

**Ops script (any tenant on production):**

```powershell
node peer-finance-manager/scripts/restore-ledger-production.js --org <slug> --ledger <path-to-master.xlsx> [--stmt <path-to-statement.csv>]
```

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
| Numbers look wrong online | **Bank activity:** Admin → Import → **Import New Bank Activity** (monthly) or **Full Ledger Refresh** (advanced). Read preview **Review** rows. Other data: see [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md) |
| Birthday or date off by one day | Fixed in latest app code — admin should `git push` to deploy |

---

## Who to contact

**Technical / admin issues:** Yinka Daramola — `yinka@eworkchop.com`

**Member credentials list (admin only):**  
`data/organizations/assurance/exports/member-credentials-2026-06-13.csv`

---

*Last updated: July 8, 2026. For how to change and publish the app, see [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md).*
