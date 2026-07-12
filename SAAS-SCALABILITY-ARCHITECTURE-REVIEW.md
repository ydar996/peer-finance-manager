# Peer Finance Manager: Can It Serve Thousands of Cooperatives?

**Plain-language review** · July 11, 2026  
**Audience:** owners and Cooperative admins (not engineers)  
**Related:** technical notes live in [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) (tasks 4i–4n)

---

## Short answer

**Today:** the product is ready for **day-to-day treasurer work in the browser**, and it can serve **a modest number of Cooperatives** (roughly tens, maybe up to around eighty if they are not all very busy at once).

**Not yet:** it is **not** ready to safely host **thousands** of Cooperatives on the current cloud setup. The *idea* of separate Cooperatives is solid. The *computer and storage* behind the live site are still sized like a small business tool, not a big shared platform.

---

## How the live system works (simple picture)

Think of three parts:

1. **The website** (Netlify)  
   What people see: login screens, buttons, tables.

2. **The office brain** (Render)  
   One shared computer that stores money records, passwords, and creates PDF statements.

3. **Each Cooperative’s filing cabinet**  
   Every Cooperative gets its **own database file**. Cooperatives do not share each other’s member money data. That separation is good and should stay.

**What Coop admins do today (no special tech tools):**

| Job | Where |
|-----|--------|
| Add bank activity | **Admin → Import** |
| Back up the database | **Admin → Maintenance → Download Database Backup** |
| Restore a good copy | **Admin → Maintenance → Restore Database** |
| Fix name capitalization | **Admin → Maintenance → Normalize Profiles** |

You no longer need WinSCP or copying files onto the server by hand. See [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md).

---

## What is already working well

- Each Cooperative’s money data is kept separate.
- Treasurers can import bank statements and fix ledger rows in the browser.
- Admins can download and restore a database backup themselves.
- New Cooperatives can register and get their own empty books.
- Billing (Stripe) and a platform “owner” console exist for the product business side.
- Public pages per Cooperative (`/c/your-name/...`) support branding and applications.

These are the right foundations. We do **not** need to throw away the product and start over.

---

## What gets in the way of “thousands of Cooperatives”

### 1. The hard drive is too small

The live server’s data disk is about **1 gigabyte** for **all** Cooperatives together (databases, uploads, PDFs, bank files).

That is like one small USB stick shared by every Cooperative. It fills up long before you reach thousands of groups.

**What to do:** buy more cloud disk space, watch usage, and later move large files (PDFs, uploads) to separate cloud storage.

### 2. One computer does everything

Right now **one** cloud computer handles:

- every login  
- every import  
- every PDF statement  
- overnight jobs for **all** Cooperatives  

If many Cooperatives generate statements at the same time, that one computer can slow down or crash. It is like one clerk serving every branch of a chain of banks.

**What to do:** move PDF printing and overnight jobs to a separate “worker” computer, and later add more capacity as you grow.

### 3. Backups are still mostly manual

Admins can download a backup from **Maintenance**. That is good for each Cooperative.

There is **not** yet an automatic nightly copy of **all** Cooperatives to a second safe place (like cloud storage). If the main cloud disk were lost or corrupted, recovery would depend on people having downloaded their own backups.

**What to do:** automatic nightly backups of every Cooperative (and the master registry) to off-site storage. This is the next big safety upgrade.

### 4. Anyone can open a new Cooperative (today)

Public registration can create a new Cooperative without enough gates (approval, invite, or strong spam limits). At large scale, that can fill the disk with junk accounts.

**What to do:** invite-only or platform approval, plus rate limits and spam protection.

### 5. Security defaults need tightening

Some default passwords and “reset on startup” patterns were built for early setup. They are not appropriate for a public multi-Cooperative product.

**What to do:** secrets only from secure settings; no hard-coded passwords in the product.

### 6. Email still looks like one brand

Meeting and reminder emails often send from **one** global “from” address (historically Assurance-branded). Other Cooperatives should send as **their own** name.

**What to do:** each Cooperative sets its own email display name and from-address in the product.

### 7. Some screens are still too “expert”

Bank import has two modes (add new activity vs full rebuild). Payment name mappings and reclassify/split are powerful but take training. New Cooperatives also start empty with little guided setup.

**What to do:** one clear “Import Bank Statement” path for most people; a short onboarding wizard; hide advanced rebuild tools unless support asks for them.

---

## Realistic size today

| Scale | Fit? |
|-------|------|
| **1–20 active Cooperatives** | Comfortable if disk and backups are watched |
| **~20–80** | Possible with care; risk rises with busy PDF/import days |
| **Hundreds** | Needs more disk, workers, and automatic backups first |
| **Thousands** | Needs a real platform plan (more machines or a bigger database design) |

These numbers are judgment from how the system is built today, not a sales promise.

---

## Plan of action (in plain English)

### Phase 1 — Make it safe for growth (first priority)

1. Automatic nightly backups to cloud storage  
2. More disk space and usage alerts  
3. Control who can create new Cooperatives  
4. Remove hard-coded passwords  
5. Each Cooperative gets its own email “from” name  
6. Keep the computer from holding every Cooperative’s database open forever in memory  

### Phase 2 — Make heavy work not freeze the website

1. Generate PDFs on a separate worker  
2. Run overnight reports off the main website computer  
3. Large bank imports show progress instead of hanging the browser  
4. Password reset and invite-by-email for members (less CSV hand-off)

### Phase 3 — Grow past hundreds

1. Store large files outside the small disk  
2. Split Cooperatives across more machines, **or** move to a larger shared database designed for many tenants  
3. A platform console so operators check health and backups without technical file tools  

### Phase 4 — Thousands and enterprise readiness

1. Multiple regions / higher availability  
2. Stronger audit logs and compliance posture  
3. Decide long-term: keep one database file per Cooperative on many small machines, or one big managed database with clear walls between Cooperatives  

---

## Architecture verdict (one paragraph)

**Nothing is “wrong” with the basic design of separate Cooperatives.** That part is correct. What is wrong for massive scale is running almost everything on **one small cloud computer with a tiny shared disk**, printing PDFs on that same computer, relying mainly on **manual** backups, and still carrying early-setup habits (open registration, shared email brand, expert-only import paths). Fix safety and capacity first; then simplify the treasurer experience; then grow the platform.

---

## What Coop admins should do right now

1. Use **Admin → Maintenance** to download a backup regularly (month-end is a good habit).  
2. Use **Admin → Import** for bank work; use **Maintenance → Restore** only when you need to put a known-good database back.  
3. Do **not** use SFTP, Shell, or file-copy tools for normal work.  
4. Tell the platform owner which Phase 1 item to build next if you want the product ready for many Cooperatives.

---

## Document history

| Date | Note |
|------|------|
| 2026-07-11 | First layman review written from the full architecture audit |

*Technical tracking: [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) tasks 4i–4n. Interactive canvas (optional): Cursor canvas `saas-scalability-architecture-review`.*
