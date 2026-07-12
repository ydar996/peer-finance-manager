# Upload Your Data to Production

> **Routine workflow:** Do treasurer and ledger work on the **live Admin site** (https://peer-finance-manager.netlify.app/admin). **Do not use WinSCP** for bank ledger, profiles, or balance updates.

> **Backup / restore:** **Admin → Maintenance** → **Download Database Backup** or **Restore Database**. No SFTP, no Manual Deploy.

This guide is **legacy / break-glass only** if the Maintenance tab is unavailable.

---

## What to use instead of WinSCP

| Task | Where |
|------|--------|
| Monthly bank activity | **Import → Import New Bank Activity** |
| Full ledger rebuild | **Import → Full Ledger Refresh** (upload xlsx) |
| Download reference xlsx | **Import → Download Xlsx Ledger** |
| Member money, profiles, loans | **Record**, **Members & Accounts** |
| Database backup | **Maintenance → Download Database Backup** |
| Database restore | **Maintenance → Restore Database** |
| Title Case profile backfill | **Maintenance → Normalize Profiles** |
| App code changes | `git push` only (Netlify + Render auto-deploy) |

---

## Code vs data

| What changed | What to do |
|--------------|------------|
| **Bank ledger** | **Admin → Import** (browser) |
| **Database backup/restore** | **Admin → Maintenance** (browser) |
| **App code** | `git push` |
| **WinSCP** | **Not used** for normal operations |

Data in `data/` on your PC does **not** travel through GitHub. Production data lives on Render at `/var/data` and is managed through the Admin UI.

---

## Break-glass: WinSCP (emergency only)

Use only when **Maintenance restore** cannot run (e.g. total admin lockout) and you have a known-good `peerfinance.db` on your PC.

### Connect

1. Render dashboard → **peer-finance-manager** → **Connect** → copy SSH details
2. WinSCP: SFTP, host `ssh.<region>.render.com`, user `srv-xxxxx`, private key `.ppk`

### Upload path

| From (PC) | To (Render) |
|-----------|-------------|
| `C:\Users\yinka\Documents\AssurCoop\data\organizations\<slug>\peerfinance.db` | `/var/data/organizations/<slug>/peerfinance.db` |

### After upload (required)

1. Delete stale `peerfinance.db-wal`, `peerfinance.db-shm`, and `peerfinance.seed.db` in the same folder
2. Render → **Manual Deploy** → **Deploy latest commit**
3. Sign in and verify **Cooperative Books**

**Prefer Maintenance restore** when the admin site works: it closes the live DB handle and swaps the file without a full platform restart.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Live site shows old balances after Maintenance restore | Hard refresh; open **Maintenance** and confirm row counts |
| Restore rejected | Upload must be a valid SQLite `.db` file that passes integrity check |
| "Organization not found" on login | Registry or org folder missing on Render: contact ops |

Routine publish: [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md)

*Last updated: July 11, 2026*
