# Peer Finance Manager — User Guide (Simple)

**For:** Assurance Investment and Cooperative Inc. — administrators, staff, and members.

**Live website:** https://peer-finance-manager.netlify.app  
**Organization code:** `assurance`

---

## For members — view your account

1. Open: **https://peer-finance-manager.netlify.app/member**
2. Enter:
   - **Organization code:** `assurance`
   - **Username:** *(sent to you by the cooperative)*
   - **Password:** *(sent to you — temporary)*
3. Click **Sign In**

**What you can see:**
- Deposit account balance
- Transaction history with running balance
- Loan account (if you have a loan)
- Download **monthly statement PDF**

**First visit may be slow** (up to 30 seconds) if the server was idle — wait and try again.

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
| **Cooperative Books** | Income, expenses, deposits, loans summary |
| **Members & Accounts** | Member list, balances, profiles |
| **Statements** | Generate batch PDF statements |
| **Loans** | View and manage loans |
| **Record** | Add members, record deposits, fees, expenses |
| **Import** | Spreadsheet, bank, profiles |
| **Users** | Member login accounts and credentials |

---

## For staff — read-only access

1. Open: **https://peer-finance-manager.netlify.app/staff**
2. Sign in with your staff email and password.
3. You can **view** cooperative data — you cannot make changes.

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
| Numbers look wrong online | Cloud data may be old — admin may need to re-upload database (see UPDATE-AND-PUBLISH.md) |

---

## Who to contact

**Technical / admin issues:** Yinka Daramola — `yinka@eworkchop.com`

**Member credentials list (admin only):**  
`data/organizations/assurance/exports/member-credentials-2026-06-13.csv`

---

*Last updated: June 2026. For how to change and publish the app, see [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md).*
