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
**Member/money data** does **not** auto-sync — only when you manually upload (WinSCP).

---

## Safe update workflow (screens and buttons)

### Step 1 — Make changes on your PC

- Edit with Cursor/agent, or ask the agent to implement features.
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

If you added deposits, members, bank imports, or other edits **only on your PC**:

**Full step-by-step guide:** [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md)

Short version:

1. Open **WinSCP** (same connection as before)
2. Left: `C:\Users\yinka\Documents\AssurCoop\data`
3. Right: `/var/data`
4. Drag everything → **overwrite**
5. Render → **Manual Deploy** → **Deploy latest commit**

**You do not need to touch Netlify for data-only updates.**

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
| Commit `data/` or `.db` files to Git | Private member data — stays local + WinSCP only |
| Panic if first login is slow | Render wakes from idle (~30 sec) |

---

## If something breaks after a push

1. Read **Render → Logs** (last 20 lines)
2. Read **Netlify → Deploy log**
3. Ask the agent — paste the error
4. Or **Rollback** to previous deploy on Render

---

## Costs (unchanged)

- **Render:** ~$7–8/month (API + data disk)
- **Netlify:** free tier for this site
- **GitHub:** free

---

*Last updated: June 2026. First-time setup: [DEPLOY-TODAY.md](./DEPLOY-TODAY.md).*
