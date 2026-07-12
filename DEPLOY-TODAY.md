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

---

## Step 0 — Have a database backup ready (optional)

If you already run the app on your PC and want that data on the live site:

1. On your PC, copy `data/organizations/<your-slug>/peerfinance.db` somewhere safe, **or**
2. After the live site is up, sign in as admin → **Maintenance → Download Database Backup** anytime.

You load that file onto production later with **Maintenance → Restore Database** (browser). No file-copy tools.

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

**Add your Cooperative data (browser only):**

Empty cloud disk is fine. The app creates `registry.db` and each Cooperative’s database when you register or sign in. **Do not use SFTP, SSH, or file-copy tools.**

1. Wait until Render shows **Live**.
2. Open the live Admin site and **Register** your Cooperative (or sign in).
3. If you already have a database backup from your PC (`peerfinance.db`):
   - Sign in as that Cooperative’s admin
   - **Maintenance → Restore Database** → preview → confirm
4. If you are starting fresh: add members, then use **Import** for the bank ledger.
5. Verify **Cooperative Books** and **Maintenance → Live Database Status**.

Full guide: [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md).

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
| “Organization not found” | Register the Cooperative on the live site, or restore via **Admin → Maintenance** |
| API health fails | Render logs → **Logs** tab |
| Statements won’t download | First request may be slow; Render free tier sleeps after 15 min idle — first visit wakes it (~30 sec) |
| Still works on your PC | Yes — `PeerFinanceManager.exe` is unchanged |

---

## What stays on your computer

- **PeerFinanceManager.exe** — still works offline for admin work.
- **data/** folder — local copy. Prefer **Admin → Maintenance → Download Database Backup** on live for the canonical cloud copy.

PC and live site do **not** auto-sync. Move data with **Maintenance → Restore** (upload a `.db`) or rebuild the ledger with **Import**.
