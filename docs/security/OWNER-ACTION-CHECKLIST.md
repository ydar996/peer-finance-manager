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

### Part B: Create the Three Email Addresses (Namecheap)

Your domain `peerfinancemanager.com` is registered at **Namecheap**. Its mail
currently only has free email *forwarding* (incoming mail can be forwarded to
an existing inbox like Gmail). There are two ways to make the three contact
addresses work — pick one:

#### Option A — Free Email Forwarding (recommended to start, 10 minutes)

Mail to `security@`, `privacy@`, and `legal@peerfinancemanager.com` lands in
an inbox you already check (e.g. your Gmail). Replies will come from that
inbox's address, which is fine for a small operation.

1. Go to **https://www.namecheap.com** and log in.
2. Click **Domain List** (left menu) > find **peerfinancemanager.com** >
   click **Manage**.
3. In the domain management page, find **Email Forwarding** (sometimes under
   the **Advanced DNS** tab > **Email Forwarding** section, or **Private
   Email** > **Forwarding**).
4. For each of the three addresses, click **Add Forward** and enter:
   - `security` → forward to your main email (e.g. `you@gmail.com`)
   - `privacy` → same destination
   - `legal` → same destination
5. Namecheap sends a verification email to the destination — click the
   confirm link in each.
6. Test: send an email from another account to `privacy@peerfinancemanager.com`
   and confirm it arrives in your inbox (allow up to an hour for DNS).

#### Option B — Real Mailboxes (Namecheap Private Email, ~$1/month each)

Use this if you want to send replies *from* `@peerfinancemanager.com`
addresses (more professional for legal/privacy correspondence).

1. In Namecheap: **Domain List** > `peerfinancemanager.com` > **Manage** >
   **Private Email** (or **Get Private Email**).
2. Choose the cheapest plan that includes at least 3 mailboxes (their
   "Private Email"Starter/Pro plans cover this).
3. During setup, set the domain's MX records when prompted — Namecheap
   configures this automatically; say yes.
4. Create the three mailboxes: `security@`, `privacy@`, `legal@`, each with
   a strong password stored in your password manager.
5. You can then also point the app's `SMTP_FROM` at one of these mailboxes
   later if you want system emails to come from the domain (optional —
   current sending already works).

**Either way, record what you chose** in `docs/security/SUBPROCESSORS.md`
under a note that domain email is handled by Namecheap (forwarding or
Private Email).

---

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
