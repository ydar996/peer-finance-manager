# Turn On Member Email Notifications (Simple Steps)

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
| **SendGrid / Mailgun / Brevo** (free tier) | You want a dedicated sending service instead of your inbox |

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
| You click **Publish to Members** | All members with an email on file |
| Last calendar day of the month | Same (reminder to check reports) |

The app will **not** send the same notification twice for the same event (it keeps a simple log).

If SMTP is not set up, the app still works — it just **skips** sending email (no error for members).

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `emailConfigured` is false | Add `SMTP_HOST` and `SMTP_FROM`, save, **Manual Deploy** |
| No emails after publish | Confirm members have email in **Members & Profiles**; check Render **Logs** for “Email skipped” or SMTP errors |
| “Authentication failed” | Double-check username/password; some hosts require the full email as username |
| Port / connection errors | Try port `587` first; if provider says `465`, set `SMTP_PORT=465` and `SMTP_SECURE=true` |
| Emails go to spam | Use a real `@assurancecoop.org` (or your domain) sender; ask members to check spam once |

---

## You Do Not Need To

- Use Gmail (any SMTP provider works).  
- Change anything on **Netlify** for email (only Render).  
- Upload data via WinSCP for email settings.  
- Run any command on your PC for production email.

---

*Last updated: June 18, 2026*
