# Turn On Member Email Notifications (Simple Steps)

## Where You Left Off

**Good news:** the email feature is already built and running on the live site.

**SMTP is connected** (`emailConfigured: true` on production), but if Bluehost SMTP fails from Render, use the **free Bluehost relay** (no SendGrid): **[BLUEHOST-EMAIL-RELAY-SETUP.md](BLUEHOST-EMAIL-RELAY-SETUP.md)**.

You do **not** need to change Netlify, upload data, or run anything on your PC.

---

The app can email members automatically when:

1. **You publish** a cooperative monthly status report, or  
2. It is the **last day of the month** (reminder to sign in and check their reports), or  
3. **You announce a cooperative meeting** (and again as an automatic reminder before the meeting, if enabled under Meetings & Announcements).

Emails go to members who have an **email on file** (profile email or member login email).

**This is not automatic until you connect an email sender on Render.** Code is already deployed; you only add settings there.

---

## Before You Start

You need an **email account that is allowed to send mail** for the cooperative. You do **not** need Gmail.

| Option | Good if… |
|--------|----------|
| **Your business email** (e.g. `@assurancecoop.org` from your web host or Microsoft 365) | You already have cooperative email — **use this if you can** |
| **Bluehost HTTPS relay** | Render cannot use Bluehost SMTP; you already pay for Bluehost | **Recommended — [BLUEHOST-EMAIL-RELAY-SETUP.md](BLUEHOST-EMAIL-RELAY-SETUP.md)** |
| **SendGrid / Brevo** | Optional; many new SendGrid accounts are trial-only, not free long-term | See SendGrid section below (optional) |

Ask whoever manages your email (host, IT, or the provider’s help docs) for **SMTP settings**:

- Server host (e.g. `mail.assurancecoop.org` or `smtp.office365.com`)
- Port (`587` is most common; some use `465`)
- Username and password for sending
- Whether the “From” address must match the login username

---

## Step 1: Open Render

1. Go to https://dashboard.render.com  
2. Open your **peer-finance-manager** service (the API / “brain”, not Netlify).

---

## Step 2: Add Email Settings (Environment Variables)

1. Click **Environment** in the left menu.  
2. Click **Add Environment Variable** for each row below.

Use the **exact values from your email provider** — not examples from another service.

| Name | Example (yours will differ) | What it is |
|------|-----------------------------|------------|
| `SMTP_HOST` | `mail.assurancecoop.org` | Mail server address from your provider |
| `SMTP_PORT` | `587` | Usually `587`; use `465` only if your provider says so |
| `SMTP_USER` | `notifications@assurancecoop.org` | Login username for sending |
| `SMTP_PASS` | *(your password)* | Password for that mailbox — **not** shown to members |
| `SMTP_FROM` | `notifications@assurancecoop.org` | “From” address members will see (often same as `SMTP_USER`) |
| `SMTP_FROM_NAME` | `Assurance Investment and Cooperative Inc.` | Friendly sender name |
| `MEMBER_PORTAL_URL` | `https://peer-finance-manager.netlify.app/member` | Link in the email (sign-in page) |

**Optional:** If your provider uses port `465`, also add:

| Name | Value |
|------|-------|
| `SMTP_SECURE` | `true` |

3. Click **Save Changes**.

**Where to find SMTP for common setups**

- **Web host (cPanel, Hostinger, etc.):** Email → Email Accounts → your mailbox → **Connect Devices** / **Configure Mail Client** → copy **Outgoing (SMTP)** settings.  
- **Microsoft 365:** Host is usually `smtp.office365.com`, port `587`, username is the full email address.  
- **SendGrid / Mailgun:** Use the SMTP credentials from their dashboard (not your normal inbox password).

---

## Step 3: Restart the Server

1. Still on the peer-finance-manager page in Render.  
2. Click **Manual Deploy** → **Deploy latest commit**.  
3. Wait until status is **Live** (green).

---

## Step 4: Confirm It Worked

1. Open in your browser:  
   https://peer-finance-manager.onrender.com/api/health  

2. Look for:

   ```json
   "emailConfigured": true
   ```

   If you see `false` or it is missing, check that `SMTP_HOST` and `SMTP_FROM` are set, then **Manual Deploy** again.

---

## Step 5: Send a Test Email (Optional but Recommended)

1. Sign in to https://peer-finance-manager.netlify.app/admin  
2. Open **Cooperative Books** → **Monthly Status Report**.  
3. **Generate Report** (if needed), then **Publish to Members**.  

Members with an email on file should receive a message within a few minutes. Check your own member account if you have one.

---

## When Emails Go Out Automatically

| Event | Who gets email |
|-------|----------------|
| You click **Publish to Members** (Cooperative Books → Monthly Status Report) | All members with an email on file |
| Last calendar day of the month | Same (reminder to check reports) |
| You **announce** a cooperative meeting (Cooperative Books → Meetings & Announcements) | All members with an email on file |
| Automatic meeting reminder (if enabled in meeting settings) | Same, before the meeting date |

The app will **not** send the same notification twice for the same event (it keeps a simple log).

If SMTP is not set up, the app still works — it just **skips** sending email (no error for members).

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `emailConfigured` is false | Add `SMTP_HOST` and `SMTP_FROM`, save, **Manual Deploy** |
| **`ECONNREFUSED` … `:587` or `:465`** | Often **Render’s free plan** blocks outbound SMTP (not Bluehost). See **Fix: Connection Refused** below. |
| No emails after publish | Confirm members have email in **Members & Profiles**; check Render **Logs** for “Email skipped” or SMTP errors |
| “Authentication failed” | Double-check username/password; some hosts require the full email as username |
| Port / connection errors | Try port `587` first; if provider says `465`, set `SMTP_PORT=465` and `SMTP_SECURE=true` |
| Emails go to spam | Use a real `@assurancecoop.org` (or your domain) sender; ask members to check spam once |

### Fix: Connection Refused (`ECONNREFUSED`)

If you see **`connect ECONNREFUSED 162.241.30.68:587`** or **`:465`**:

| Your setup | Likely cause |
|------------|----------------|
| **Render free plan** | Render blocks outbound ports **25, 465, 587**. Upgrade Render or use a relay (below). |
| **Render paid plan** (your case) | Render can reach the internet on those ports, but **Bluehost is refusing** the connection. Bluehost shared mail often accepts Outlook/phones from home networks but **blocks or rejects datacenter IPs** (Render, AWS, etc.). |

Your PC connecting fine while Render gets `ECONNREFUSED` is the classic sign of **Bluehost blocking cloud servers**, not bad passwords.

#### Still worth checking on Render → Environment

1. `SMTP_HOST` = `mail.assurancecoop.org` (hostname from cPanel, **not** `162.241.30.68`)
2. `SMTP_USER` = full email address (e.g. `notifications@assurancecoop.org`)
3. Port **587** first: `SMTP_PORT=587`, remove `SMTP_SECURE` or set it `false`
4. If 587 fails, try **465**: `SMTP_PORT=465`, `SMTP_SECURE=true`
5. Save → **Manual Deploy** → test again

If both ports still refuse, Bluehost is not allowing SMTP from Render.

#### Option A: Ask Bluehost support (no new vendor)

Open a ticket or chat:

> “I run an app on Render.com that needs to send mail through my Bluehost mailbox (`notifications@assurancecoop.org`) via `mail.assurancecoop.org` on port 587 with SMTP authentication. Connections from Render get **connection refused**. Can you allow authenticated SMTP submission from external cloud servers, or tell me the correct settings?”

They may say no on shared hosting. If they give specific settings, use those on Render.

#### Option B: Bluehost HTTPS relay (recommended — no extra vendor)

**Full guide:** **[BLUEHOST-EMAIL-RELAY-SETUP.md](BLUEHOST-EMAIL-RELAY-SETUP.md)**

Upload `peer-finance-manager/bluehost-relay/pfm-mail-relay.php` to Bluehost; set `EMAIL_RELAY_URL` + `EMAIL_RELAY_SECRET` on Render. Mail still sends from your `@eworkchop.com` mailbox.

#### Option C: SendGrid (optional paid/trial vendor)

Full layman walkthrough: **[SendGrid setup for `assurancecooperative@eworkchop.com`](#sendgrid-setup-for-assurancecooperativeeworkchopcom)** below.

#### Bluehost SMTP reference (direct SMTP, if Bluehost allows it)

In cPanel → **Email Accounts** → **Connect Devices** → **Outgoing Server**:

| Setting | Typical Bluehost value |
|---------|------------------------|
| `SMTP_HOST` | `mail.assurancecoop.org` (not the raw IP) |
| `SMTP_PORT` | `465` with `SMTP_SECURE=true`, or `587` without |
| `SMTP_USER` | full mailbox address (e.g. `notifications@assurancecoop.org`) |
| `SMTP_PASS` | that mailbox’s password |
| `SMTP_FROM` | same mailbox address |

**Good sign it worked:** no error popup; members receive mail within a few minutes.

---

## SendGrid Setup for `assurancecooperative@eworkchop.com`

Use this path when Bluehost mail cannot be reached from Render. Your sender will be **`assurancecooperative@eworkchop.com`** with display name **Assurance Investment and Cooperative Inc.**

### Will Step 2 (DNS) break my normal email?

**No — not if you only add what SendGrid tells you.**

Think of it this way:

| What you use today | What it uses | Does SendGrid change it? |
|--------------------|--------------|---------------------------|
| Reading mail in Outlook, phone, webmail | **MX records** (where mail is delivered) | **No** — do not delete or edit existing MX records |
| Sending from Outlook/phone via your host | Your host’s SMTP (`mail.…`) | **No** — SendGrid does not change your mailbox password or server |
| **New:** app sends member notices from Render | SendGrid | **Add-only** — you paste **new** DNS rows SendGrid gives you |

SendGrid’s DNS step adds **extra** rows (usually CNAME) so the world trusts mail **sent through SendGrid**. It is like adding a spare key for SendGrid to sign outbound app mail. Your inbox and normal sending keep working.

**Only avoid:** deleting existing MX, SPF, or DKIM rows you do not recognize. **Add** SendGrid’s rows; do not wipe the DNS zone.

---

### Part 1: SendGrid account and domain (about 10 minutes)

1. Sign in at https://app.sendgrid.com (or finish signup).
2. When you see **Set up Sending** (or go to **Settings → Sender Authentication → Authenticate Your Domain**):
   - Domain: **`eworkchop.com`**
   - Link branding: **No** (fine for now)
   - **Use automated security:** leave **checked**
   - **Use custom return path:** leave **unchecked**
3. Click **Next**. SendGrid shows a table of **DNS records** to add (often 3 CNAME rows). **Leave this tab open.**

---

### Part 2: Add DNS records in Bluehost (for `eworkchop.com`)

1. Log in to **Bluehost** → **Domains** → select **`eworkchop.com`** → open **DNS** / **Advanced DNS**.
2. Read the yellow **Caution** box: it warns about changing DNS in general. You are only **adding** new rows SendGrid gives you — **do not delete** existing **MX** rows or mail-related records you already have.
3. Click **+ ADD RECORD**.

SendGrid shows a table with columns like **Type**, **Host**, and **Value** (sometimes labeled **Points to**). Map them to Bluehost’s **Add Advanced DNS Record** form like this:

| SendGrid column | Bluehost field | What to enter |
|-----------------|----------------|---------------|
| **Type** (CNAME) | **Type** | **CNAME** |
| *(leave default)* | **Refers to** | **Other Host** |
| **Host** | **Host Name** | Only the **left part before** `.eworkchop.com` (see examples below) |
| **Value** / **Points to** | **Alias to** | The SendGrid target (usually ends in **`.sendgrid.net`**) — **not** your own `@eworkchop.com` address |
| *(default)* | **TTL** | **4 Hours** is fine |

**Example (your numbers will differ):**

If SendGrid shows:

| Type | Host | Value |
|------|------|-------|
| CNAME | `em6813.eworkchop.com` | `u12345678.wl.sendgrid.net` |

Then in Bluehost:

- **Host Name:** `em6813` (Bluehost already shows `.eworkchop.com` beside the box)
- **Alias to:** `u12345678.wl.sendgrid.net`

**Wrong (what blocks the ADD button or fails verify):**

- **Host Name** empty, **Alias to** = `em6813.eworkchop.com` ← that belongs in **Host**, not **Alias to**
- **Alias to** = anything on `eworkchop.com` — it must point **out** to SendGrid (`.sendgrid.net`)

4. Click **ADD**. Repeat **+ ADD RECORD** for **every row** in SendGrid’s table (usually **three** CNAME records: one `em…` row and two `s1._domainkey` / `s2._domainkey` rows).
5. Back in SendGrid → **Verify**. If it fails, wait 15–30 minutes and verify again.

**If Bluehost rejects the host name:** some panels want the full host from SendGrid without the domain suffix; others want only `em6813`. Try the short form first (`em6813`); if verify fails, remove the record and try the full host SendGrid shows.

---

### Part 3: Create a SendGrid API key

1. SendGrid → **Settings** → **API Keys**.
2. **Create API Key** → name it e.g. `Peer Finance Manager`.
3. Permission: **Restricted Access** → turn on **Mail Send** only (or **Full Access** if you prefer).
4. **Create & View** → copy the key (long string starting with `SG.`). **You cannot see it again** — paste it somewhere safe temporarily.

This key is **not** your email password. It only lets the app send through SendGrid.

---

### Part 4: Put settings on Render

1. https://dashboard.render.com → **peer-finance-manager** → **Environment**.
2. Set or update these (replace old Bluehost mail values):

   | Name | Value |
   |------|--------|
   | `SMTP_HOST` | `smtp.sendgrid.net` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | `apikey` (literally the word apikey) |
   | `SMTP_PASS` | your SendGrid API key (`SG.…`) |
   | `SMTP_FROM` | `assurancecooperative@eworkchop.com` |
   | `SMTP_FROM_NAME` | `Assurance Investment and Cooperative Inc.` |
   | `MEMBER_PORTAL_URL` | `https://peer-finance-manager.netlify.app/member` |

3. Remove `SMTP_SECURE` if it was set for Bluehost port 465 (not needed for SendGrid on 587).
4. **Save Changes** → **Manual Deploy** → wait until **Live**.

---

### Part 5: Test

1. Open https://peer-finance-manager.onrender.com/api/health → `"emailConfigured": true`
2. Admin → **Cooperative Books** → **Meetings & Announcements** → **Resend Email** on a meeting (or **Publish to Members** on a report).
3. Check your own member inbox (and spam once). No error popup = success.

---

### SendGrid troubleshooting

| Problem | What to try |
|---------|-------------|
| DNS verify fails | Wait 30+ minutes; confirm Host/Value copied exactly; no extra spaces |
| “Authentication failed” on Render | `SMTP_USER` must be `apikey`; `SMTP_PASS` is the API key, not mailbox password |
| Mail not received | Check spam; confirm domain shows **Verified** in SendGrid |
| Normal Outlook mail broke | Rare — usually a deleted MX record; restore MX from a backup or host support |
| “From address not verified” | Domain must be verified in SendGrid, or add **Single Sender** for `assurancecooperative@eworkchop.com` under **Settings → Sender Authentication** |

---

## You Do Not Need To

- Use Gmail (any SMTP provider works).  
- Change anything on **Netlify** for email (only Render).  
- Upload database files for email settings (use **Admin → Maintenance** if needed).  
- Run any command on your PC for production email.

---

*Last updated: July 6, 2026 (SendGrid + eworkchop.com layman guide)*
