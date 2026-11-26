# Owner Action Checklist

**Last Updated:** 2026-11-26
**Who this is for:** the platform owner (you). No technical background needed.
Each item below is written as click-by-click steps. Work through them in order;
each one is independent, so you can stop and resume anytime.

Estimated effort: items 1-4 are under an hour total. Item 5 is a longer
business process (weeks to months) and is explained at the end.

---

## Item 1: Set Up Free Uptime Monitoring

**Why:** if the site goes down at 3am, you find out from a text/email instead
of an angry customer. Auditors also like seeing uptime evidence.

**What you need:** a free UptimeRobot account and 5 minutes.

1. Go to **https://uptimerobot.com** and click **Register for FREE**.
2. Sign up with your email, confirm the verification email.
3. In the dashboard, click **+ Add New Monitor**.
4. Fill in:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `Peer Finance Manager API`
   - **URL:** `https://peerfinancemanager.com/api/health`
   - **Monitoring Interval:** 5 minutes (free tier default)
5. Click **Create Monitor**.
6. Click your account name (top right) > **Alert Contacts** > **Add Alert
   Contact** > choose **Email** (or SMS if offered on free tier) and save.
7. Done. You will now get an email within minutes if the health endpoint
   stops answering.

**Optional second monitor:** add another monitor for
`https://peerfinancemanager.com/` (the homepage) so you catch frontend-only
failures too.

---

## Item 2: Accept DPAs And Create Security Mailboxes

### Part A: Accept Data Processing Agreements (DPAs)

A DPA is a standard legal document each vendor offers saying "we protect
your data properly." Accepting it takes about 2 minutes per vendor. Do all
four:

**Render (hosts the app and database)**
1. Go to **https://dashboard.render.com** and log in.
2. Click your avatar (top right) > **Account Settings**.
3. Look for **Data Processing Agreement** or **Compliance** in the left
   menu. If present, click **Accept** / **Sign**.
4. If you cannot find it, email Render support: "Please enable the Data
   Processing Agreement on our account." They will turn it on.

**Netlify (hosts the website)**
1. Go to **https://app.netlify.com** and log in.
2. Click **Team settings** (or your avatar > **User settings** > your team).
3. Look for **Privacy** or **Data Processing** and accept the DPA.
4. If not visible, open a support ticket asking them to execute the DPA.

**Stripe (payments)**
1. Go to **https://dashboard.stripe.com** and log in.
2. Click **Settings** (gear icon, bottom left) > **Privacy** or
   **Data Processing**.
3. Accept the DPA if offered. Stripe's standard terms already cover most
   cases; accepting the DPA just formalizes it.

**Supabase (FlexxForms database)**
1. Go to **https://supabase.com/dashboard** and log in.
2. Open the FlexxForms project.
3. Go to **Project Settings** (gear icon) > **Privacy** or
   **Data Processing** and accept the DPA.

**Bluehost (email sending)**
1. Email is low-volume transactional mail; no DPA is typically required at
   your scale. No action needed unless Bluehost offers one in your client
   area — if so, accept it.

**Record what you did:** open `docs/security/SUBPROCESSORS.md` and update
the "DPA Status" column with today's date for each vendor you completed.

### Part B: Set Up the Three Email Addresses (Namecheap, Free)

Your domain peerfinancemanager.com is at Namecheap, which includes free
email forwarding: mail sent to security@, privacy@, and legal@
peerfinancemanager.com lands in an inbox you already use (e.g. Gmail).
Replies will come from that inbox's address, which is fine at this stage.

1. Go to https://www.namecheap.com and log in.
2. Click Domain List (left menu) > find peerfinancemanager.com >
   click Manage.
3. Find Email Forwarding (under Advanced DNS, or Private Email >
   Forwarding).
4. For each of the three addresses, click Add Forward:
   - security  -> your main email (e.g. you@gmail.com)
   - privacy   -> same destination
   - legal     -> same destination
5. Namecheap emails a verification link to the destination; click it for
   each of the three.
6. Test: send an email from another account to
   privacy@peerfinancemanager.com and confirm it arrives (allow up to an
   hour for DNS).

#### Sending AS @peerfinancemanager.com for Free (Gmail "Send mail as")

Forwarding only *receives*. To *reply from* privacy@/security@/legal@
peerfinancemanager.com without paying for mailboxes, add them as send-as
aliases in Gmail. This is free and is almost certainly how other small
apps handle it.

1. Go to **https://mail.google.com** > gear icon > **See all settings** >
   **Accounts and Import** tab.
2. In **Send mail as**, click **Add another email address**.
3. Enter the address (e.g. `privacy@peerfinancemanager.com`), uncheck
   "Treat as an alias" is NOT what you want — leave defaults, click
   **Next Step**.
4. For SMTP server, enter `smtp.gmail.com`, port `587`, username = your
   Gmail address, password = a Gmail **App Password**
   (myaccount.google.com > Security > 2-Step Verification > App
   passwords — you need 2FA on your Google account first).
5. Gmail sends a verification email to `privacy@peerfinancemanager.com` —
   it arrives via your Namecheap forwarding in the same Gmail inbox.
   Click the confirmation link/code.
6. Repeat for `security@` and `legal@` (you can reuse the same app
   password).
7. To send as one: compose a new email > click the **From** dropdown >
   pick the @peerfinancemanager.com address.

**Caveat:** occasional replies may land in the recipient's spam folder
because the domain is not fully authenticated for Google sending. For
low-volume contact addresses this is acceptable; if deliverability ever
matters (e.g. a privacy request), Private Email below is the fix.

**If an app (not a human) needs to send as the domain:** use a free SMTP
relay instead — Brevo (300 emails/day free) or SMTP2GO (1,000/month
free). Sign up, verify `peerfinancemanager.com` by adding the DNS records
they provide in Namecheap **Advanced DNS**, then send via their SMTP
credentials with `From: privacy@peerfinancemanager.com`. The Peer Finance
Manager app itself does not need this — its system emails already send
through the existing relay.

#### Option B — Namecheap Private Email (real mailboxes, ~$42/year, 30-day free trial)

This is Namecheap's own mailbox product — everything stays inside your
existing Namecheap account, no third party. You get three real
@peerfinancemanager.com mailboxes you can log into at privateemail.com
and reply from. There is a 30-day free trial, so you can test it before
paying anything.

**Cost:** Expand plan = 3 mailboxes included, $41.88/year (~$3.49/month).
Launch plan = 1 mailbox + aliases, $14.88/year (all three addresses can
be aliases of the one mailbox if you want the cheapest real-mailbox
option). Scale = 5 mailboxes, $71.88/year (more than you need).

**Step-by-step:**

1. Go to https://www.namecheap.com and log in.
2. In the top menu click **Email** > **Private Email** (direct link:
   https://www.namecheap.com/hosting/email/private-email/).
3. Click **Get Private Email** (or **Order Now**) and choose the
   **Expand** plan — it includes exactly 3 mailboxes. If a promo code is
   pre-filled, leave it; the first-year price will be lower than the
   renewal price shown.
4. When asked for the domain, select **"Use a domain I own with
   Namecheap"** and pick **peerfinancemanager.com** from the list.
   Because the domain is registered with Namecheap, DNS setup is
   automatic — no manual MX record work needed.
5. Continue to checkout. The 30-day free trial means you can start using
   it immediately; billing kicks in after the trial unless you cancel.
6. **Remove the old forwarding first** so the two do not conflict:
   go to **Domain List** > peerfinancemanager.com > **Manage** >
   **Advanced DNS** tab and delete any **Email Forwarding** entries you
   created in Option A (or that already exist). Private Email manages
   its own MX records.
7. Wait for activation — usually a few minutes, up to 4 hours. You will
   see the subscription status change to Active under **Email** >
   **Private Email** in the left menu.
8. Click **Manage** next to peerfinancemanager.com to open the Private
   Email dashboard.
9. Click **Create Mailbox** and create each of the three:
   - Mailbox name: `security` (enter just this — the domain is appended
     automatically, so it becomes security@peerfinancemanager.com)
   - Password: a strong unique one, stored in your password manager
   - Storage: keep the default
   - Click **Save changes**. Repeat for `privacy` and `legal`.
   You will see "Success! Mailbox ... has been set up" for each.
10. **Add the DKIM record** (required so your outgoing mail does not
    land in spam): in the Private Email dashboard, look for **DNS
    Records** / **Email Deliverability** / **DKIM** and copy the TXT
    value shown. Then go to **Domain List** > peerfinancemanager.com >
    **Manage** > **Advanced DNS** > **Add New Record**: Type `TXT`,
    Host `privateemail._domainkey`, Value = the copied string, Save.
    If Namecheap already added it automatically during activation,
    skip this step — check Advanced DNS first.
11. **Log in to webmail:** click the **Login** button next to any
    mailbox in the Private Email dashboard, or go to
    https://privateemail.com and sign in with the full address
    (security@peerfinancemanager.com) + password. The Namecheap Mail
    mobile app also works with these credentials.
12. **Test both directions:** send an email from another account to
    privacy@peerfinancemanager.com (should arrive in webmail within
    minutes), then reply from webmail to confirm outgoing works and
    check it does not land in spam at the destination.

**Optional later — system emails from the domain:** the app currently
sends notifications through its existing relay. To make dues
reminders/welcome emails come *from* @peerfinancemanager.com instead,
update SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM in Render env vars using
the IMAP/SMTP settings shown in the Private Email dashboard. Not
required now.


## Item 3: Designate A Second Trusted Operator

**Why:** right now you are the only person who can keep the service alive
or respond to an emergency (biggest remaining risk in the register, R15).
Pick someone you trust completely — a technical co-founder, senior
developer, or managed-service provider.

**What to give them (least privilege that still covers emergencies):**

1. **GitHub:** invite them as a collaborator on the repo
   (github.com/ydar996/peer-finance-manager > Settings > Collaborators).
   They can propose changes but cannot bypass branch protection.
2. **Render:** invite them to the Render workspace with **Member** (not
   Owner) role. They can view logs and redeploy but cannot delete the
   service.
3. **Netlify:** invite to the site with **Editor** or **Admin** role.
4. **Password manager:** share the vault entries for Render/Netlify/Stripe
   dashboards (or give them their own accounts with MFA — better).
5. **Do NOT give them:** Stripe secret keys, database files, member data
   exports, or the platform admin password.

**Record it:** add their name and grant date to
`docs/security/ACCESS-REVIEWS.md` under a new review entry.

---

## Item 4: Set Up Error Alert Webhook (Optional But Recommended)

**Why:** the app now logs errors to a file on the server. A webhook pushes
critical ones to your phone/chat instantly instead of you checking files.

Pick ONE of these — Discord is easiest:

### Option A: Discord (free, 5 minutes)

1. Open Discord, go to your server (or create a private one called
   "PFM Alerts").
2. Server Settings (gear next to server name) > **Integrations** >
   **Webhooks** > **New Webhook**.
3. Name it "PFM Errors", pick a channel, click **Copy Webhook URL**.
4. The URL looks like `https://discord.com/api/webhooks/...` — keep it
   secret; anyone with it can post to your channel.

### Option B: Slack (if you use it)

1. In Slack: your workspace > **Apps** > search "Incoming Webhooks" >
   **Add to Slack** > choose a channel > **Allow**.
2. Copy the webhook URL (`https://hooks.slack.com/services/...`).

### Then set it in Render

1. Go to **https://dashboard.render.com** > your service >
   **Environment**.
2. Click **Add Environment Variable**.
3. Key: `SECURITY_ALERT_WEBHOOK_URL` — Value: paste your webhook URL.
4. Click **Save Changes**. Render restarts the app automatically.
5. Done. Critical errors now appear in your Discord channel/Slack within
   about a minute of happening.

---

## Item 5: The Certification Path (Phase D)

This is the paid, longer process. Here is what it actually involves, in
plain terms, so you can decide when and how to start.

### Step 1: Penetration Test (do this first)

- **What:** hire an ethical-hacking firm to attack your app and try to
  break in. They deliver a report listing every weakness found.
- **Who:** search "web application penetration testing" — reputable firms
  include Cobalt, Bishop Fox, NCC Group, or smaller regional firms. Expect
  roughly $5,000–$25,000 depending on scope.
- **What to do with results:** fix every critical/high finding, keep the
  report and your fix evidence — SOC 2 and ISO auditors will ask for both.

### Step 2: SOC 2 Type I

- **What:** a CPA audit firm checks that your security controls are
  designed correctly. You get a report you can show customers under NDA.
- **Who:** firms like A-LIGN, Johanson Group, Sensiba, or any CPA firm with
  a SOC practice. Expect $10,000–$40,000+.
- **Before you book:** do a "readiness assessment" (many firms offer one)
  or use the free AICPA criteria checklist. Our docs/security/ folder was
  built to answer most of it.

### Step 3: SOC 2 Type II

- **What:** the same audit, but the firm watches your controls operating
  over a period (usually 3–12 months). They will ask for evidence from that
  period: access review records, security event logs, incident records,
  change approvals.
- **Important:** your controls must be genuinely running during the window
  — the quarterly access reviews, weekly security-event scans, and
  change-management PR flow we set up are exactly the evidence they sample.
- **Cost:** typically $20,000–$60,000+.

### Step 4: ISO 27001 (optional, do after SOC 2)

- **What:** a certificate proving you run a formal security management
  system. Our docs/security/ ISMS set is the documentation foundation.
- **Who:** accredited certification bodies (search "ISO 27001 certification
  body"). Stage 1 reviews documents; Stage 2 audits implementation.
- **Do you need it?** Mostly matters for international/enterprise buyers.
  SOC 2 satisfies most customer security questionnaires already.

### Realistic Sequence

1. Penetration test now-ish (after items 1-4 are done).
2. Fix findings.
3. SOC 2 readiness review -> Type I -> Type II.
4. ISO 27001 only if a customer or market requires it.

**Budget reality:** plan for roughly $40,000–$100,000 all-in for pentest +
SOC 2 Type II. Many SaaS companies defer this until a deal requires it —
your documentation is already audit-ready when that day comes.
