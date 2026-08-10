# How to Change the App and Publish (Simple)

**You do not need to redo the whole Render/Netlify setup every time.**  
Once live, updates are mostly: **change code → push to GitHub → wait**.

---

## The two worlds (important)

| Where | What lives there |
|-------|------------------|
| **Your PC** (`AssurCoop` folder) | Code + your master database (`data/`) |
| **Cloud** | Copy of code (GitHub → Netlify + Render) + copy of database on Render disk |

**Code updates** travel via **Git push**.  
**Member/money data** does **not** auto-sync with Git — use the **live Admin site**: **Import** (ledger), **Maintenance** (backup/restore, normalize profiles).

---

## Safe update workflow (screens and buttons)

### Step 1 — Make changes on your PC

- Edit with Cursor/agent, or ask the agent to implement features.
- **Agents must update docs immediately** (same turn as the change): [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) changelog + tasks, and [USER-GUIDE.md](./USER-GUIDE.md) when screens/workflows change. See `.cursor/rules/continuous-documentation.mdc`. You should never need to ask for this.
- Test locally when you can:
  ```powershell
  npm start
  ```
  Open http://localhost:3457/admin

### Step 2 — Push to GitHub (this updates the live site)

In PowerShell, inside `AssurCoop`:

```powershell
git add .
git commit -m "Short description of what you changed"
git push
```

**One line version:**

```powershell
git add .; git commit -m "Your message here"; git push
```

### Step 3 — Wait for automatic deploy (~5–15 minutes)

| Service | What happens |
|---------|----------------|
| **Netlify** | Rebuilds the website (login pages, buttons) |
| **Render** | Rebuilds the API (data, logins, PDFs) |

Check:
- Render dashboard → **peer-finance-manager** → status **Live** (green)
- Netlify dashboard → latest deploy **Published**

### Step 4 — Test live

- Admin: https://peer-finance-manager.netlify.app/admin
- Member: https://peer-finance-manager.netlify.app/member
- Health: https://peer-finance-manager.onrender.com/api/health → `{"ok":true,...}`

---

## When you change MEMBER DATA (not code)

| What changed | What to do |
|--------------|------------|
| **Bank ledger** | **Admin → Import** on live site |
| **Database backup or restore** | **Admin → Maintenance** on live site |
| **Title Case profile backfill** | **Admin → Maintenance → Normalize Profiles** |
| **Migrate PC database to live** | **Admin → Maintenance → Restore Database** (upload `.db`) |

**Full guide:** [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md)

---

## What you will NOT break

- Pushing code **does not delete** the database on Render (it lives on a separate disk).
- A failed deploy shows **red** on Render/Netlify — the old version usually keeps running until fixed.
- You can **roll back** on Render: **Deploys** → pick an older **Live** deploy → **Rollback**.

---

## What to avoid

| Don't | Why |
|-------|-----|
| Delete `/var/data` on Render | Loses all member data |
| Set `PFM_COOP_ROOT` on Render | Breaks the app (documented bug — leave unset) |
| Commit `data/` or `.db` files to Git | Private member data — stays local; production copies via **Admin → Maintenance** |
| Panic if first login is slow | Render wakes from idle (~30 sec) |
| Forget to update docs after changes | **Session failure** — agents auto-update via `.cursor/rules/continuous-documentation.mdc` in the same turn as every change; see [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) §0 |

---

## If something breaks after a push

1. Read **Render → Logs** (last 20 lines)
2. Read **Netlify → Deploy log**
3. Ask the agent — paste the error
4. Or **Rollback** to previous deploy on Render

---

## Moving to another computer

1. On the **old** PC: commit and `git push` so GitHub has the latest code + docs. Optionally download a live DB backup via **Admin → Maintenance** if you need local data later.
2. On the **new** PC: `git clone` (or copy the folder **without** relying on untracked junk) → `npm install` → read [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) **Machine transfer snapshot**.
3. Recreate `.env` / remember Render env vars separately (never in Git).
4. Do **not** commit or depend on `tmp-live-app.js` or other untracked scratch files.
5. Production keeps running from GitHub; the new PC only needs Git + Node to continue development.

Full checklist: [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) → **Machine transfer snapshot**.

---

## Costs (unchanged)

- **Render:** ~$7–8/month (API + data disk)
- **Netlify:** free tier for this site
- **GitHub:** free
- **Cooperative SaaS fee (PFM product):** **$29.99**/month; quarterly **$89.07** (1% off); annual **$345.48** (4% off)

---

*Last updated: August 9, 2026. First-time setup: [DEPLOY-TODAY.md](./DEPLOY-TODAY.md). Data upload: [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md). Machine move: [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) Machine transfer snapshot.*
