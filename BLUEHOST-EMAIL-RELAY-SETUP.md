# Send Member Emails Through Bluehost (Step-by-Step, Non-Technical)

This turns on automatic emails from **Peer Finance Manager** (meeting notices, report publish, month-end reminders) using **Bluehost only**. No SendGrid. No extra monthly mail fee.

**Your sender address:** `assurancecooperative@eworkchop.com`  
**How it works:** a small file on your Bluehost website sends mail. Render talks to that file over normal web HTTPS.

**Time needed:** about 30–45 minutes the first time.

---

## Before You Start (Checklist)

- [ ] You can log in to **Bluehost** (host for `eworkchop.com`).
- [ ] You can log in to **Render** (hosts the API at `peer-finance-manager.onrender.com`).
- [ ] The mailbox **`assurancecooperative@eworkchop.com`** already exists in Bluehost (Email Accounts). If not, create it first (Part 0 below).
- [ ] Deploy **`43f3865`** or later is live on Render (you ran `git push`).

---

## Part 0: Confirm the Email Mailbox Exists (Bluehost)

Skip if you already send/receive as `assurancecooperative@eworkchop.com`.

1. Open a browser. Go to **https://www.bluehost.com**
2. Click **Log In** (top right). Sign in.
3. Open **Hosting** or **My Sites** for **`eworkchop.com`**.
4. Open **Email** or **Email Accounts**.
5. Look for **`assurancecooperative@eworkchop.com`** in the list.
6. If it is **missing:** click **Create** / **Add Email Account**, choose that address, set a password, finish the wizard.
7. Write down that you confirmed the mailbox exists.

---

## Part 1: Make a Secret Password (Both Places Will Use the Same One)

This secret stops strangers from using your mail relay. Only Render and your PHP file will know it.

1. Open **Notepad** on your PC (Windows key, type `Notepad`, Enter).
2. Type a long random string **with no spaces**, at least **32 characters**. Example shape (do **not** use this exact one):

   `Kp9mX2vL8nQ4wR7tY1uH5jF0cB6aD3sZ`

   Tips: mix upper and lower case letters and numbers.
3. Select all (Ctrl+A). Copy (Ctrl+C).
4. Paste into a password manager or a private note you will keep open for Part 2 and Part 3.
5. Leave Notepad open until both parts are done.

---

## Part 2: Prepare and Upload the Relay File (Bluehost)

### 2A. Edit the file on your PC

1. Open **File Explorer**.
2. Go to:

   `C:\Users\yinka\Documents\AssurCoop\peer-finance-manager\bluehost-relay`

3. Right-click **`pfm-mail-relay.php`** → **Open with** → **Notepad** (or Cursor/VS Code).
4. Find this line near the top (around line 17):

   ```php
   const PFM_RELAY_SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET';
   ```

5. Replace **`CHANGE_ME_TO_A_LONG_RANDOM_SECRET`** with your secret from Part 1. Keep the **single quotes** around it. Example:

   ```php
   const PFM_RELAY_SECRET = 'Kp9mX2vL8nQ4wR7tY1uH5jF0cB6aD3sZ';
   ```

6. **File** → **Save** (Ctrl+S). Close the editor.

### 2B. Upload to Bluehost

1. Browser → **https://www.bluehost.com** → log in.
2. Open hosting for **`eworkchop.com`**.
3. Click **Advanced** or **cPanel** or **File Manager** (wording varies; pick the tool that shows website files).
4. Open the folder **`public_html`** (this is your live website root).
5. Click **Upload** (top menu).
6. Click **Select File** or drag **`pfm-mail-relay.php`** from your PC folder into the upload area.
7. Wait until upload shows **100%** or **Complete**.
8. Back in **`public_html`**, confirm you see **`pfm-mail-relay.php`** in the file list.

### 2C. Quick browser test (important)

1. Open a **new browser tab**.
2. In the address bar, type exactly:

   `https://eworkchop.com/pfm-mail-relay.php`

3. Press **Enter**.

**What you should see:** plain text like:

   `{"ok":false,"error":"Method not allowed"}`

That is **good**. It means the file is online.

**Bad signs:**

| What you see | Meaning |
|--------------|---------|
| **404 Not Found** | File not in `public_html` or wrong domain |
| **403 Forbidden** with `"Forbidden"` | Secret still says `CHANGE_ME...` on the **server** copy; re-edit and re-upload |
| Blank page / download prompt | Wrong file type; re-upload the `.php` file |

If **`www.eworkchop.com`** is your main site, also try:

   `https://www.eworkchop.com/pfm-mail-relay.php`

Use whichever URL worked in the test for Part 3.

---

## Part 3: Tell Render How to Send Mail

All of this is on **Render**, not Netlify.

### 3A. Open the right service

1. Go to **https://dashboard.render.com**
2. Log in.
3. Click your service named **`peer-finance-manager`** (the API / backend).

### 3B. Remove old mail settings that failed

1. Click **Environment** in the left sidebar.
2. Scroll through the list. For each of these names, if present, click the **trash** icon or **Delete** on that row:

   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_SECURE`

   (These were for direct Bluehost SMTP, which Render could not reach.)

3. Do **not** delete unrelated variables (Stripe, FlexxForms, etc.).

### 3C. Add the relay settings

Click **Add Environment Variable** (or **+ Add**) for **each** row below. Type the **Key** exactly. Paste the **Value** exactly. No extra spaces before or after.

| Key (type exactly) | Value (your copy) |
|--------------------|-------------------|
| `EMAIL_RELAY_URL` | `https://eworkchop.com/pfm-mail-relay.php` (or `https://www.eworkchop.com/...` if that was the URL that worked in Part 2C) |
| `EMAIL_RELAY_SECRET` | Same secret as inside `pfm-mail-relay.php` (Part 1) |
| `SMTP_FROM` | `assurancecooperative@eworkchop.com` |
| `SMTP_FROM_NAME` | `Assurance Investment and Cooperative Inc.` |
| `MEMBER_PORTAL_URL` | `https://peer-finance-manager.netlify.app/member` |

**If a key already exists:** click it, change the value, save that row.

**Double-check:**

- `EMAIL_RELAY_SECRET` on Render = `PFM_RELAY_SECRET` in the PHP file (character for character).
- `SMTP_FROM` is the full email address, not a password.

### 3D. Save and restart the server

1. Click **Save Changes** (bottom of Environment page).
2. Render may offer to redeploy; if not: open **Manual Deploy** (top or right) → **Deploy latest commit**.
3. Wait until status shows **Live** (green). This often takes **3–10 minutes**.

---

## Part 4: Confirm Email Is On

### 4A. Health check

1. New browser tab:

   `https://peer-finance-manager.onrender.com/api/health`

2. Press Ctrl+F and search for: `emailConfigured`

3. You want:

   `"emailConfigured": true`

If **`false`:** check that `SMTP_FROM` and `EMAIL_RELAY_URL` are set on Render, then **Manual Deploy** again.

### 4B. Send a real test

1. Go to **https://peer-finance-manager.netlify.app/admin**
2. Log in as admin.
3. Open **Cooperative Books** → **Meetings & Announcements**.
4. Pick an **announced** meeting.
5. Click **Resend Email**.
6. You should **not** get a red error popup.
7. Check a member inbox (and **Spam** once). Mail may take **1–5 minutes**.

**Alternative test:** Cooperative Books → **Monthly Status Report** → **Publish to Members**.

### 4C: Audit from the admin screen (after Email Send Audit is deployed)

1. Admin → **Meetings**
2. Expand **Email Send Audit**
3. Click **Refresh Audit**
4. Click **View Recipients** on the latest batch to see each member email and Sent/Failed status

Older sends (before this feature) may show only a total count, not every recipient name.

---

## Part 5: Optional Cleanup (SendGrid)

Only if you started SendGrid and are not using it.

1. **SendGrid website:** cancel or ignore the trial so you are not charged.
2. **Bluehost DNS** (Domains → DNS for `eworkchop.com`): you may delete these **SendGrid-only** rows if you added them:

   - CNAME `em6813`
   - CNAME `s1._domainkey`
   - CNAME `s2._domainkey`
   - TXT `_dmarc` (only if you added it for SendGrid)

   Deleting these does **not** break normal email or this relay.

---

## When Emails Go Out Automatically (After Setup)

| When | Who gets email |
|------|----------------|
| You click **Publish to Members** on a status report | Members with email on file |
| Last day of the month | Reminder to check reports |
| You announce a meeting | All members with email |
| Meeting reminder (if enabled) | Same, before the meeting |

Members need an email in **Members & Profiles** (profile or login email).

---

## Troubleshooting (Plain English)

| What happened | What to do |
|---------------|------------|
| Popup says **Forbidden** | Secret on Render does not match secret in PHP file. Fix one side, save, redeploy Render. |
| Popup says **mail() failed** | Mailbox `assurancecooperative@eworkchop.com` missing in Bluehost Email Accounts. |
| Popup says **404** or **Relay HTTP 404** | Wrong `EMAIL_RELAY_URL`. Re-test Part 2C in browser. |
| `emailConfigured` is false | Add `SMTP_FROM` and `EMAIL_RELAY_URL`; Manual Deploy. |
| No mail, no error | Check member has email on file; check Spam; wait 5 minutes. |
| Mail only in Spam | Normal at first; mark **Not spam** once. |

---

## What You Never Need to Do

- Change anything on **Netlify** for email.
- Pay for SendGrid or another mail company (for this setup).
- Upload database files for email (use **Admin → Maintenance** if needed).
- Run commands on your PC after the PHP file is uploaded.

---

*Last updated: July 7, 2026*
