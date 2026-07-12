# Manage Production Data (Coop Admin)

All production money and member data is managed in the **browser**. Cooperative admins do not use SFTP, SSH, Shell, or file-copy tools.

**Live Admin:** https://peer-finance-manager.netlify.app/admin

---

## Everyday tasks

| What you need | Where to click |
|---------------|----------------|
| Add this month’s bank activity | **Import → Import New Bank Activity** |
| Rebuild the full bank ledger | **Import → Full Ledger Refresh** |
| Download your ledger workbook | **Import → Download Xlsx Ledger** |
| Record deposits, loans, profiles | **Record**, **Members & Accounts** |
| Save a safety copy of your database | **Maintenance → Download Database Backup** |
| Put a known-good database back on live | **Maintenance → Restore Database** |
| Fix Title Case on names | **Maintenance → Normalize Profiles** |

---

## Backup (every Cooperative)

1. Sign in as Cooperative **admin**.
2. Open **Maintenance**.
3. Click **Download Database Backup**.
4. Store the `.db` file somewhere safe (OneDrive, USB, etc.).

Do this before major imports or at month-end.

---

## Restore (every Cooperative)

Use when live data is wrong or corrupted and you have a good backup file.

1. Sign in as Cooperative **admin**.
2. Open **Maintenance**.
3. Choose your `.db` backup file.
4. Click **Preview Restore** and check member / transaction counts.
5. Confirm **Restore Database**.

The site swaps the live database immediately. No Manual Deploy. Hard-refresh the browser, then open **Cooperative Books** to verify.

For **bank ledger** mistakes only, prefer **Import → Full Ledger Refresh** then **Import New Bank Activity** (keeps Bank Reconcile Status correct).

---

## First-time Cooperative on the live site

You do **not** copy folders to the server.

1. Open the live site and **Register** a Cooperative (or sign in if it already exists).
2. The app creates an empty database for that Cooperative automatically.
3. Optional: **Maintenance → Restore Database** if you already have a PC backup `.db` to load.
4. Or start fresh: add members, then **Import** your bank statement / ledger.

---

## Code vs data

| What changed | What to do |
|--------------|------------|
| Member money, bank ledger, profiles | **Admin** tabs above (browser) |
| App screens / buttons / features | Developer: `git push` (auto-deploys) |

Private data never goes through GitHub. Production data lives on the cloud disk and is managed only through Admin.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Balances look old after restore | Hard refresh; open **Maintenance** and check **Live Database Status** |
| Restore rejected | File must be a valid SQLite `peerfinance.db` backup |
| Cannot sign in / org missing | Contact platform operator (registry issue) |
| Ledger out of sync | **Import → Full Ledger Refresh** + **Import New Bank Activity** |

Routine code publish: [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md)  
User steps: [USER-GUIDE.md](./USER-GUIDE.md) §23 Maintenance

*Last updated: July 11, 2026*
