# Send Member Emails Through Bluehost Only (No SendGrid)

Use this when **Render cannot connect to Bluehost SMTP** and you do **not** want another mail vendor.

**How it works:** a tiny PHP file lives on your **existing Bluehost** site. Render calls it over normal web HTTPS (port 443). Bluehost sends the email from your real address (e.g. `assurancecooperative@eworkchop.com`). **No monthly fee to a third party.**

**Cost:** $0 beyond hosting you already pay (Bluehost + Render).

---

## What you need

| Item | Example |
|------|---------|
| Bluehost site for your domain | `eworkchop.com` |
| A real mailbox on that domain | `assurancecooperative@eworkchop.com` |
| Render access | peer-finance-manager → Environment |
| App code deployed | `git push` (after relay support is in the repo) |

You can **cancel the SendGrid trial** and **remove the SendGrid DNS rows** you added if you are not using SendGrid. That will not affect this setup.

---

## Part 1: Upload the relay file to Bluehost

1. On your PC, open this file in the project:

   `peer-finance-manager/bluehost-relay/pfm-mail-relay.php`

2. Near the top, change this line to a **long random password** (copy it somewhere safe):

   ```php
   const PFM_RELAY_SECRET = 'paste-a-long-random-secret-here';
   ```

   Example: 32 random letters and numbers. You will paste the **same** secret on Render.

3. Log in to **Bluehost** → **Hosting** → **File Manager** (for the account that hosts `eworkchop.com`).

4. Open **`public_html`** (your website root).

5. **Upload** `pfm-mail-relay.php` into `public_html`.

6. Note the URL:

   `https://eworkchop.com/pfm-mail-relay.php`

   (If your site uses `www`, test both; use whichever loads.)

---

## Part 2: Settings on Render

1. https://dashboard.render.com → **peer-finance-manager** → **Environment**.

2. **Remove** old Bluehost SMTP variables if they fail (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`). You do not need them for the relay.

3. **Add or update:**

   | Name | Value |
   |------|--------|
   | `EMAIL_RELAY_URL` | `https://eworkchop.com/pfm-mail-relay.php` |
   | `EMAIL_RELAY_SECRET` | same secret as in the PHP file |
   | `SMTP_FROM` | `assurancecooperative@eworkchop.com` |
   | `SMTP_FROM_NAME` | `Assurance Investment and Cooperative Inc.` |
   | `MEMBER_PORTAL_URL` | `https://peer-finance-manager.netlify.app/member` |

4. **Save Changes** → **Manual Deploy** → wait until **Live**.

---

## Part 3: Confirm

1. Open https://peer-finance-manager.onrender.com/api/health  
   → `"emailConfigured": true`

2. Admin → **Cooperative Books** → **Meetings** → **Resend Email** (or publish a report).

3. Check a member inbox (and spam once).

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `Forbidden` | `EMAIL_RELAY_SECRET` on Render must **exactly** match `PFM_RELAY_SECRET` in the PHP file |
| `mail() failed on server` | Confirm `assurancecooperative@eworkchop.com` exists in Bluehost → **Email Accounts** |
| `Relay HTTP 404` | Wrong URL; confirm file is in `public_html` and opens in a browser (should say Method not allowed for GET, not 404) |
| Mail in spam | Normal for first sends; members can mark as not spam |
| Still using SendGrid vars | Remove `SMTP_HOST` / SendGrid API key so the app uses the relay |

**Quick URL test:** open `https://eworkchop.com/pfm-mail-relay.php` in a browser. You should see JSON like `Method not allowed` — that means the file is reachable.

---

## Security note

The secret is like a password. Only Render should know it. Do not share the PHP file publicly with the real secret in git; edit the secret **on the server copy** after upload if needed.

---

*Last updated: July 6, 2026*
