# Go Live Today — Simple Steps

> **Status:** First-time cloud setup is **complete** (June 2026). For routine code and data updates, use [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) and [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md). Keep this file for reference or rebuilding from scratch.

Your app needs **two free websites** working together:

| Piece | Service | What it does |
|-------|---------|--------------|
| **Website members open** | [Netlify](https://netlify.com) | Login screens, buttons, tables |
| **Brain / data** | [Render](https://render.com) | Saves members, money, passwords |

**Supabase** is optional today (backup for later). The live app still uses your existing data on Render.

**Time:** about 30–45 minutes. Mostly clicking and pasting.

---

## What I already prepared for you

- Cloud-ready server code
- `render.yaml` — Render setup file
- `netlify.toml` — Netlify setup file
- `cloud-data-bundle.zip` — your cooperative data (run step 0 if missing)

---

## Step 0 — Pack your data (2 minutes)

1. Close **PeerFinanceManager.exe** if it is running.
2. Open PowerShell in your project folder (`AssurCoop`).
3. Run:

```powershell
npm run bundle:cloud-data
```

You should see: `Created: cloud-data-bundle.zip`

---

## Step 1 — Put code on GitHub (10 minutes)

You need a GitHub account. [github.com/signup](https://github.com/signup)

1. On GitHub, click **New repository**.
2. Name it something like `peer-finance-manager`.
3. Leave it **Private** if you prefer.
4. **Do not** add README or .gitignore (we already have files).
5. Copy the repo URL GitHub shows (ends in `.git`).

On your PC, in PowerShell inside `AssurCoop`:

```powershell
git init
git add .
git commit -m "Prepare Peer Finance Manager for cloud deployment"
git branch -M main
git remote add origin https://github.com/ydar996/peer-finance-manager.git
git push -u origin main
```

If Git asks you to sign in, follow the browser login it opens.

---

## Step 2 — Start the API on Render (10 minutes)

### What this costs (roughly)

| Item | Cost | Why you need it |
|------|------|-----------------|
| **Render Web Service (Starter)** | **~$7/month** | Keeps the API running (free tier sleeps after 15 min idle) |
| **1 GB data disk** | **~$0.25/month** | Stores your member/money database |
| **Netlify (website)** | **$0** on free tier | Login pages for members |
| **GitHub** | **$0** | Holds your code |

**Total: about $7–8/month** for Render. You’ll need a credit card on file; Render may do a $1 verification charge and refund it.

**Important:** Do **not** use the page that says “Create a new Service” with tiles for Static Sites / Postgres / etc.  
Use **Blueprint** instead — it reads our `render.yaml` file and sets up the server + data disk automatically.

1. On [dashboard.render.com](https://dashboard.render.com), click **+ New** → **Blueprint**.
2. **Blueprint Name:** type `peer-finance-manager` (the field must not be empty).
3. **Branch:** `main` (already correct).
4. **Blueprint Path:** leave as `render.yaml`.
5. Click **Retry** if you previously saw “Blueprint file was found, but there was an issue.”
6. You should now see a preview: 1 web service + 1 disk. Click **Apply**.
7. Wait until the service shows **Live** (green). Copy the URL — looks like `https://peer-finance-manager-xxxx.onrender.com`.
8. Test: `https://YOUR-APP.onrender.com/api/health` → `{"ok":true,"name":"Peer Finance Manager"}`

**If you don’t see “Blueprint”** in the + New menu, use **Web Service** instead and set these manually:

| Field | Value |
|-------|--------|
| Name | `peer-finance-manager` |
| Root Directory | *(leave blank)* |
| Build Command | `npm install` |
| Start Command | `node peer-finance-manager/server.js` |
| Plan | **Starter** (required for disk) |

Then add a **Disk**: name `pfm-data`, mount path `/var/data`, 1 GB.  
Environment variables: `NODE_ENV=production`, `PFM_DATA_DIR=/var/data`  
(Do **not** set `PFM_COOP_ROOT` on Render — it breaks module loading.)

**Add your data (important):**

Think of this like **copying a folder from your PC onto Render’s hard drive**.  
The browser **Shell** tab cannot drag-and-drop files — you use a free app called **WinSCP** (like USB, but over the internet).

#### A — On your PC first (2 minutes)

1. Find `cloud-data-bundle.zip` in your `AssurCoop` folder.
2. **Right-click → Extract All** to your Desktop.
3. You should get a folder with things like `registry.db` and `organizations` inside.

#### B — One-time: give Render your “digital key” (5 minutes, only once)

1. Open PowerShell and run:

```powershell
New-Item -ItemType Directory -Force -Path $env:USERPROFILE\.ssh
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\render_key -N '""'
```

Press Enter for any questions. (If you see “No such file or directory”, the first line creates the missing `.ssh` folder.)

2. Show your public key:

```powershell
Get-Content $env:USERPROFILE\.ssh\render_key.pub
```

3. Copy the whole line it prints.
4. On Render: click your **profile icon** (top right) → **Account Settings** → **SSH Public Keys** → **Add SSH Public Key** → paste → Save.

#### C — Install WinSCP and connect (5 minutes)

1. Download and install [WinSCP](https://winscp.net/eng/download.php) (free).
2. On Render: open **peer-finance-manager** service → click **Connect** (top right).
3. Copy the **SSH** command shown (looks like `ssh srv-xxxxx@ssh.oregon.render.com`).
4. In WinSCP, click **New Site** and fill in:
   - **File protocol:** SFTP
   - **Host name:** the part after `@` (e.g. `ssh.oregon.render.com`)
   - **User name:** the part before `@` (e.g. `srv-xxxxx`)
   - **Advanced** → **SSH** → **Authentication** → **Private key file:** browse to `C:\Users\YOURNAME\.ssh\render_key`
5. Click **Login** (say Yes if it asks about converting the key).

#### D — Copy your data (2 minutes)

1. **Left side** (your PC): open the folder you unzipped on your Desktop.
2. **Right side** (Render): double-click into **`var`** → then **`data`** (full path: `/var/data`).
3. Select everything on the left (`registry.db`, `organizations` folder, etc.).
4. **Drag** to the right side.

You should end up with `registry.db` directly inside `/var/data` — not inside another subfolder.

#### E — Check it worked

1. Back on Render → **Shell** tab, run:

```bash
ls /var/data
ls /var/data/organizations/assurance
```

You should see `registry.db` and `peerfinance.db`.

2. Click **Manual Deploy** → **Deploy latest commit**.

**Alternative (if WinSCP is painful):** In Render Shell, you can download the zip from a private link:

```bash
cd /var/data
curl -L -o bundle.zip "PASTE_YOUR_ONEDRIVE_OR_DROPBOX_LINK_HERE"
apt-get update && apt-get install -y unzip
unzip -o bundle.zip
ls /var/data
```

Only use a **private** share link you delete afterward — this file has member passwords.

---

## Step 3 — Put the website on Netlify (10 minutes)

1. Go to [netlify.com](https://netlify.com) → sign up.
2. **Add new site** → **Import an existing project** → **GitHub** → same repo.
3. Netlify should detect settings from `netlify.toml`. Click **Deploy**.
4. When deploy finishes, copy your site URL — like `https://something.netlify.app`.

**Connect Netlify to Render:**

1. Netlify → **Site configuration** → **Environment variables**.
2. Add:

| Name | Value |
|------|--------|
| `RENDER_API_URL` | Your Render URL (no trailing slash), e.g. `https://peer-finance-manager-xxxx.onrender.com` |

3. **Deploys** → **Trigger deploy** → **Deploy site** (rebuilds with the API link).

**Tell Render to accept your Netlify site:**

1. Render → your service → **Environment**.
2. Add or edit:

| Name | Value |
|------|--------|
| `ALLOWED_ORIGINS` | Your Netlify URL, e.g. `https://something.netlify.app` |

3. Save — Render redeploys automatically.

---

## Step 4 — Test (5 minutes)

| Who | Open this URL | Org code | Login |
|-----|---------------|----------|--------|
| **Member** | `https://YOUR-SITE.netlify.app/member` | `assurance` | Username from your credentials CSV |
| **Admin (you)** | `https://YOUR-SITE.netlify.app/admin` | `assurance` | `yinka@eworkchop.com` / `123456789` |
| **Staff** | `https://YOUR-SITE.netlify.app/staff` | `assurance` | staff email + password |

Member passwords CSV (on your PC):  
`data/organizations/assurance/exports/member-credentials-2026-06-13.csv`

---

## Step 5 — Share with members

Send them:

> **Peer Finance Manager — My Account**  
> Link: `https://YOUR-SITE.netlify.app/member`  
> Organization code: **assurance**  
> Username: *(their username)*  
> Password: *(from the list you gave them)*

You can rename the Netlify site or add a custom domain later in Netlify settings.

---

## Optional — Supabase backup (not required to go live)

Supabase stores a **copy** of your data in the cloud for backup / future upgrades. It does **not** power the website today.

1. [supabase.com](https://supabase.com) → new project.
2. **SQL Editor** → run the file `supabase/migrations/001_schema.sql`.
3. Keep your project URL and service role key somewhere safe (`.env` — never commit).

Full automatic sync from SQLite to Supabase is a later step.

---

## If something breaks

| Problem | Fix |
|---------|-----|
| Blank page / login fails | Check `RENDER_API_URL` on Netlify and redeploy |
| “Organization not found” | Data not uploaded to `/var/data` on Render |
| API health fails | Render logs → **Logs** tab |
| Statements won’t download | First request may be slow; Render free tier sleeps after 15 min idle — first visit wakes it (~30 sec) |
| Still works on your PC | Yes — `PeerFinanceManager.exe` is unchanged |

---

## What stays on your computer

- **PeerFinanceManager.exe** — still works offline for admin work.
- **data/** folder — your master copy. Back it up to USB or OneDrive regularly.

After cloud is live, you can use either the website or the exe; they share the same structure but **won’t auto-sync** until you upload fresh data to Render again.
