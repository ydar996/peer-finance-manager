# Upload Your Data to Production (Simple Steps)

Use this when you change **member or money data on your PC** and want the **live website** to match.

Examples: bank import (`npm run pfm:import-bank`), new deposits, CD balance update, new members, credential changes, updated `bank-statement-2026.csv`.

**Your live site:** https://peer-finance-manager.netlify.app

> **AI agents:** After any edit to this guide or data-upload workflow, update [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) § Changelog in the same turn. See `.cursor/rules/continuous-documentation.mdc`.

---

## Code vs Data (Quick Reminder)

| What you changed | What to do |
|------------------|------------|
| **Data only** (imports, balances, members in `data/` folder) | Follow this guide (WinSCP + Manual Deploy) |
| **App code only** (screens, labels, features) | `git push` only (Netlify + Render update automatically) |
| **Both** | Do both: WinSCP upload **and** `git push` |

Data does **not** travel through GitHub. You must upload it by hand.

---

## What You Are Copying

**From your PC:**

```
C:\Users\yinka\Documents\AssurCoop\data
```

**To Render (cloud server):**

```
/var/data
```

Inside that folder you should have things like:
- `registry.db`
- `organizations` folder (with `assurance` inside, including `peerfinance.db`)
- `bank-statement-2026.csv` (if you use bank import)

---

## Step 1: Open WinSCP

1. If you do not have it, download **WinSCP** (free): https://winscp.net/eng/download.php
2. Open the WinSCP app

---

## Step 2: Connect to Render

1. Go to https://dashboard.render.com
2. Open your **peer-finance-manager** service
3. Click **Connect** (top right of the page)
4. Copy the SSH connection details shown

In WinSCP, click **New Site** and fill in:

| Field | What to enter |
|-------|----------------|
| **File protocol** | SFTP |
| **Host name** | e.g. `ssh.oregon.render.com` (the part after `@` in the SSH command) |
| **User name** | e.g. `srv-xxxxx` (numbers only; **do not** type `ssh` in this box) |
| **Password** | Leave blank |

**Private key (first time only):**

1. Click **Advanced** → **SSH** → **Authentication**
2. Browse to your private key file (`.ppk` format)
3. Click **OK**, then **Login**

Save the site so you can reconnect next time.

---

## Step 3: Upload the Data Folder

1. **Left panel (your PC):** navigate to  
   `C:\Users\yinka\Documents\AssurCoop\data`

2. **Right panel (Render):** navigate to  
   `var` → `data`  
   (full path: `/var/data`)

3. On the **left**, select everything:
   - `registry.db`
   - `organizations` folder
   - any other files in `data`

4. **Drag** from left to right

5. When asked to overwrite existing files, choose **Yes** or **Overwrite**

**Check:** On the right side, `registry.db` should sit **directly** inside `/var/data`, not inside an extra nested folder.

---

## Step 4: Remove stale database sidecar files (important)

SQLite keeps hidden helper files next to `peerfinance.db`:

- `peerfinance.db-wal`
- `peerfinance.db-shm`

If you upload a new `peerfinance.db` but these old files remain, the live site can keep showing **old balances** even though WinSCP shows the correct file size and date.

In WinSCP, on the **right** (Render) panel:

1. Open **Options → Preferences → Panels** → turn on **Show hidden files**
2. Go to `/var/data/organizations/assurance/`
3. Delete `peerfinance.db-wal` and `peerfinance.db-shm` if they are there
4. Delete **`peerfinance.seed.db`** if it is there (an old backup can undo your upload on restart)
5. Re-upload `peerfinance.db` from your PC if you are unsure

## Step 5: Restart the Server on Render (required)

**WinSCP alone never updates the live website.** The running server keeps the old database open in memory until it restarts. You must do this after every data upload (bank import, new profiles, balance changes).

1. Go back to the Render website (peer-finance-manager service page)
2. Click **Manual Deploy**
3. Choose **Deploy latest commit**
4. Wait until status shows **Live** (usually a few minutes)

You do **not** need to do anything on Netlify for data-only updates.

---

## Step 6: Check That It Worked

1. Open https://peer-finance-manager.netlify.app/admin
2. Sign in with your admin email and password
3. Open **Cooperative Books** or **Members & Profiles** and confirm numbers look right (new deposits, balances, biodata on file, etc.)

Optional health check:

- https://peer-finance-manager.onrender.com/api/health  
  Should show `"ok": true`

**Note:** If the site was idle, the first page load may take ~30 seconds while Render wakes up.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| WinSCP will not connect | Username is `srv-xxxxx` only (no `ssh` prefix). Check host name and `.ppk` key. |
| Live site still shows old numbers or missing profiles | WinSCP file looks correct but site unchanged → you skipped **Manual Deploy** (Step 5). Also delete stale `peerfinance.db-wal`, `.shm`, or `peerfinance.seed.db` if present, re-upload `peerfinance.db`, then **Manual Deploy** again. |
| Live site still shows old numbers | Turn on **hidden files** in WinSCP. Delete `peerfinance.db-wal` and `peerfinance.db-shm` in `/var/data/organizations/assurance/`, re-upload `peerfinance.db`, then **Manual Deploy**. Success = Member Contributions about **$38,857** (not $38,607). |
| "Organization not found" on login | Data folder missing or incomplete on Render. Re-upload `data` and deploy. |
| Upload looks nested wrong | On Render side you want `/var/data/registry.db`, not `/var/data/data/registry.db` |

First-time setup details (SSH key, disk, costs): see [DEPLOY-TODAY.md](./DEPLOY-TODAY.md).

Routine code updates: see [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md).

---

*Last updated: June 28, 2026*
