# Upload Your Data to Production (Simple Steps)

Use this when you change **member or money data on your PC** and want the **live website** to match.

Examples: bank import, new deposits, CD balance update, new members, credential changes.

**Your live site:** https://peer-finance-manager.netlify.app

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
- `organizations` folder (with `assurance` inside)

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

## Step 4: Restart the Server on Render

Uploading files is not enough. The running app must reload them.

1. Go back to the Render website (peer-finance-manager service page)
2. Click **Manual Deploy**
3. Choose **Deploy latest commit**
4. Wait until status shows **Live** (usually a few minutes)

You do **not** need to do anything on Netlify for data-only updates.

---

## Step 5: Check That It Worked

1. Open https://peer-finance-manager.netlify.app/admin
2. Sign in with your admin email and password
3. Open **Cooperative Books** or **Members** and confirm numbers look right (new deposits, balances, etc.)

Optional health check:

- https://peer-finance-manager.onrender.com/api/health  
  Should show `"ok": true`

**Note:** If the site was idle, the first page load may take ~30 seconds while Render wakes up.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| WinSCP will not connect | Username is `srv-xxxxx` only (no `ssh` prefix). Check host name and `.ppk` key. |
| Live site still shows old numbers | Confirm upload went to `/var/data` (not a subfolder). Run **Manual Deploy** again. |
| "Organization not found" on login | Data folder missing or incomplete on Render. Re-upload `data` and deploy. |
| Upload looks nested wrong | On Render side you want `/var/data/registry.db`, not `/var/data/data/registry.db` |

First-time setup details (SSH key, disk, costs): see [DEPLOY-TODAY.md](./DEPLOY-TODAY.md).

Routine code updates: see [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md).

---

*Last updated: June 2026*
