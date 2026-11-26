# Owner Action Checklist

**Last Updated:** 2026-11-25
**Who this is for:** the platform owner (you). No technical background needed.
Each item below is written as click-by-click steps. Work through them in order;
each one is independent, so you can stop and resume anytime.

Estimated effort: items 1-4 are under an hour total. Item 5 is a longer
business process (weeks to months) and is explained at the end.

---

## Item 1: Set Up Free Uptime Monitoring — DONE 2026-11-25

**Status:** Complete. UptimeRobot monitor "Peer Finance Manager API" checks
https://peerfinancemanager.com/api/health every 5 minutes; email alerts
enabled. Steps below kept for reference.

**Why:** if the site goes down at 3am, you find out from a text/email instead
of an angry customer. Auditors also like seeing uptime evidence.

**What you need:** a free UptimeRobot account and 5 minutes.

1. Go to **https://uptimerobot.com** and click **Register for FREE**.
2. The signup form asks for the website first — enter
   `peerfinancemanager.com/api/health` in **Website to monitor**, then
   your email under **Create your account**, and click **Register**
   (or sign up with the Google button).
3. UptimeRobot may show a "Here is what we found for you" screen listing
   auto-detected pages (e.g. /admin, /register, or an onrender.com
   address). **Uncheck all of them** — you only want one monitor on the
   health endpoint; the auto-detected pages cause false "down" alerts.
   Click **Create monitors** or **Skip onboarding**.
4. Confirm the verification email, then log in.
5. Open the monitor that was created (click it, or **Edit**) and
   check/fill in:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `Peer Finance Manager API`
   - **URL:** `https://peerfinancemanager.com/api/health`
   - **Monitoring Interval:** 5 minutes (free tier default)
   If it auto-created a monitor on a different address (like
   peer-finance-manager.onrender.com), edit that monitor and change the
   URL to the one above — do not leave extra monitors running.
6. If no monitor was created during signup, click **+ Add New Monitor**
   and fill in the same fields, then **Create Monitor**.
7. Click your account name (top right) > **Alert Contacts** > **Add Alert
   Contact** > choose **Email** (or SMS if offered on free tier) and save
   — or skip this if "Email alerts" was already enabled during signup.
8. Done. You will now get an email within minutes if the health endpoint
   stops answering.

**Optional second monitor:** add another monitor for
`https://peerfinancemanager.com/` (the homepage) so you catch frontend-only
failures too.

---

## Item 2: Accept DPAs And Create Security Mailboxes — DONE 2026-11-25

**Status:** Complete. DPAs confirmed/saved (Render downloaded from Document
Center; Netlify, Stripe, Supabase automatic via sign-up terms). Contact
email addresses set up. Steps below kept for reference.

### Part A: Data Processing Agreements (DPAs)

A DPA is a standard legal document each vendor offers saying "we protect
your data properly." Good news first: **Netlify, Stripe, and Supabase all
include their DPA automatically inside the terms you accepted at
sign-up** — there is no button to click for those three. Only Render
needs a small action (download their DPA once). Total time: about 5
minutes.

**Render (hosts the app and database) — action needed**
1. Go to **https://dashboard.render.com** and log in.
2. Click the **?** (help/question mark) icon in the top-right corner of
   the dashboard — it is next to the Upgrade button.
3. Choose **Compliance and Documents** (Document Center).
4. Find **GDPR DPA** in the list — every workspace can download this
   (paid documents like the SOC 2 report are optional; the DPA is free).
   Download it and save the copy in the repo at
   `docs/security/vendor-dpas/` — done for the Render DPA already.
5. If the DPA is not listed there, request it at
   **https://trust.render.com** or email **support@render.com**:
   "Please send us the Data Processing Addendum for our workspace."

**Netlify (hosts the website) — automatic, just save a copy**
1. Netlify's DPA is already part of the subscription agreement you
   accepted at sign-up — it applies automatically, nothing to click.
2. For your records, download the PDF at
   **https://www.netlify.com/pdf/netlify-dpa.pdf** (also available on
   Netlify's Trust Center page at https://www.netlify.com/trust-center/)
   and save it to `docs/security/vendor-dpas/`.

**Stripe (payments) — automatic, just save a copy**
1. Stripe's DPA is already incorporated into the Stripe Services
   Agreement you accepted at sign-up — nothing to click.
2. For your records, view/download it at
   **https://stripe.com/legal/dpa** (click "Need a copy of this Data
   Processing Agreement? Click here" on that page) and save it to
   `docs/security/vendor-dpas/`.

**Supabase (FlexxForms database) — automatic, just save a copy**
1. Supabase's Data Processing Addendum is part of their Terms of Service
   (since August 2026) — it applies automatically, nothing to click.
   Supabase removed the old separate signing step.
2. For your records, view it at
   **https://supabase.com/legal/customer-resources/data-processing-addendum**
   — or in the dashboard, open your organization and look under
   **Documents**, where the DPA card has a **View DPA** link. Save a
   copy to `docs/security/vendor-dpas/` if you want it on file.

**Bluehost (email sending)**
1. Email is low-volume transactional mail; no DPA is typically required at
   your scale. No action needed unless Bluehost offers one in your client
   area — if so, accept it.

**Record what you did:** open `docs/security/SUBPROCESSORS.md` and update
the "DPA Status" column with today's date for each vendor — mark the
automatic ones as "Automatic (incorporated in terms), copy saved".

### Part B: Set Up the Three Email Addresses (Namecheap Only)

Your domain peerfinancemanager.com is at Namecheap, so everything below
stays inside your existing Namecheap account — no third-party email
service needed. Pick ONE of the two options:

- **Option A — Free Forwarding ($0):** the three addresses receive mail
  into your existing inbox (e.g. Gmail). Replies you send come from that
  inbox's address, not @peerfinancemanager.com. Good enough to start.
- **Option B — Private Email Launch ($14.88/year, 30-day free trial):**
  one real mailbox plus aliases, all inside Namecheap. You can both
  receive AND send as security@, privacy@, and legal@
  @peerfinancemanager.com. This is the recommended option — it is one
  login, one inbox, and replies come from the correct domain address.

#### Option A — Free Forwarding ($0)

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

#### Option B — Namecheap Private Email Launch ($14.88/year, 30-day free trial)

This is Namecheap's own mailbox product — everything stays inside your
existing Namecheap account. The **Launch** plan gives you ONE real
mailbox plus **10 aliases**, and aliases work for BOTH receiving and
sending. That means one login covers all three addresses at the lowest
price. There is a 30-day free trial, so you can test it before paying.

**Why Launch and not Expand:** Expand ($41.88/year) gives you 3 separate
mailboxes — only needed if different people must log in separately. For
you, one person checking one inbox, Launch + aliases does the same job
for $14.88/year.

**Step-by-step:**

1. Go to https://www.namecheap.com and log in.
2. In the top menu click **Email** > **Private Email** (direct link:
   https://www.namecheap.com/hosting/email/private-email/).
3. Click **Get Private Email** (or **Order Now**) and choose the
   **Launch** plan — $14.88/year, 1 mailbox included. If a promo code is
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
9. **Create the main mailbox:** click **Create Mailbox**, enter a name
   like `contact` (becomes contact@peerfinancemanager.com — the domain
   is appended automatically), set a strong password, keep default
   storage, click **Save changes**.
10. **Add the three aliases:** in the Private Email dashboard, find the
    mailbox you just created, open its **Manage Aliases** menu, click
    **Add Alias**, and create each of these one at a time:
    `security`, `privacy`, `legal`.
    All mail to those addresses lands in your one inbox, and you can
    send FROM any of them.
11. **Add the DKIM record** (required so your outgoing mail does not
    land in spam): in the Private Email dashboard, look for **DNS
    Records** / **Email Deliverability** / **DKIM** and copy the TXT
    value shown. Then go to **Domain List** > peerfinancemanager.com >
    **Manage** > **Advanced DNS** > **Add New Record**: Type `TXT`,
    Host `privateemail._domainkey`, Value = the copied string, Save.
    If Namecheap already added it automatically during activation,
    skip this step — check Advanced DNS first.
12. **Log in to webmail:** click the **Login** button next to the
    mailbox in the Private Email dashboard, or go to
    https://privateemail.com and sign in with the full address
    (contact@peerfinancemanager.com) + password. The Namecheap Mail
    mobile app also works with these credentials. Note: you log in as
    the main mailbox only — aliases cannot be used to log in, they just
    send and receive.
13. **Test both directions:** send an email from another account to
    privacy@peerfinancemanager.com (should arrive in webmail within
    minutes), then compose a reply and set the **From** field to
    privacy@peerfinancemanager.com to confirm sending as an alias
    works and does not land in spam at the destination.

**Optional later — system emails from the domain:** the app currently
sends notifications through its existing relay. To make dues
reminders/welcome emails come *from* @peerfinancemanager.com instead,
update SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM in Render env vars using
the IMAP/SMTP settings shown in the Private Email dashboard. Not
required now.

**If you later want 3 separate mailboxes** (e.g. different people
handling security vs legal), upgrade to the Expand plan
($41.88/year) — the aliases you created carry over.


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
