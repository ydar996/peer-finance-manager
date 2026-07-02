# How to Turn On Card Payments for Peer Finance Manager
### A plain-English guide for Work Chop Inc. (live / real money only)

You already have a **Stripe** account for Work Chop. This guide connects that account to **Peer Finance Manager** so cooperatives (like Assurance) can pay their subscription by credit or debit card.

**You do not need a new Stripe account.**  
**You do not need to create products in Stripe by hand.**  
**This guide uses live (real) payments only — no test mode.**

Work through **Part 0 → Part 8** in order. Do not skip steps.

---

## Words you will see (simple definitions)

| Word | What it means in everyday language |
|------|-------------------------------------|
| **Stripe** | The company that processes card payments. Money from cooperatives goes to Work Chop’s Stripe account, then to your bank. |
| **Peer Finance Manager** | Your cooperative software (the website at peer-finance-manager.netlify.app). |
| **Render** | The company that **runs** the software on the internet (the “engine” behind the scenes). |
| **Netlify** | Where people **see** the website in their browser. Stripe sends users back here after they pay. |
| **API key** | A long password that lets **your software talk to Stripe**. You paste it into Render — never share it publicly. |
| **Restricted API key** | A safer API key that only works for Peer Finance Manager — not your whole Stripe account. Starts with `rk_live_`. |
| **Webhook** | Stripe **calling your software** after someone pays, like a phone call: “Payment finished!” |
| **Signing secret** | A second long password (`whsec_…`) that proves the phone call really came from Stripe. This becomes `STRIPE_WEBHOOK_SECRET`. |
| **Environment variable** | A secret setting stored on Render. You type a **name** (left column) and a **value** (right column). |
| **Redeploy** | Tell Render to restart the software so it picks up your new secrets. Takes a few minutes. |
| **Live mode** | Real money, real cards. The toggle at the top of Stripe (not orange “Test mode”). |
| **Cooperative / tenant** | A customer of your software (e.g. Assurance Cooperative). They pay **you** (Work Chop), not Stripe directly. |

---

## The three secrets you will copy (overview)

When you are done, Render will have **two** Stripe secrets plus a few normal settings:

| # | Copy from Stripe | Paste into Render as | Looks like |
|---|------------------|----------------------|------------|
| 1 | Restricted API key (Part 2) | `STRIPE_SECRET_KEY` | `rk_live_` + long letters/numbers |
| 2 | Webhook signing secret (Part 4) | `STRIPE_WEBHOOK_SECRET` | `whsec_` + long letters/numbers |
| 3 | (You type this yourself) | `APP_BASE_URL` | `https://peer-finance-manager.netlify.app` |

Until **both** #1 and #2 are on Render and you **redeploy**, the Pay buttons will not work properly.

**Subscription prices** (already built into the software — you do not type these into Stripe):

- **$24.99** per month  
- **$71.22** every 3 months  
- **$272.89** per year  

---

# Part 0 — Get ready (before Stripe setup)

## Step 0.1 — Confirm the software is up to date on Render

1. Open your web browser.
2. Go to **https://dashboard.render.com** and sign in.
3. Click the service named **peer-finance-manager** (or similar).
4. Look for a green **Live** status on the latest deploy.

If billing was never deployed, the Pay buttons will not appear. Stop and deploy the latest code first.

## Step 0.2 — Open Stripe in Live mode

1. Open a **second browser tab**.
2. Go to **https://dashboard.stripe.com** and sign in (Work Chop / Eworkchop account).
3. At the **top right**, find the mode toggle.
4. Switch to **Live** (not Test). Live = real money.

If Stripe shows a banner like **“Activate your account”**:

- Click it and complete every step (business info, bank account, identity).
- You cannot accept real card payments until Stripe approves your account.

## Step 0.3 — Keep both tabs open

| Tab | What you use it for |
|-----|---------------------|
| **Stripe** | Create API key + webhook; copy secrets |
| **Render** | Paste secrets into Environment |

---

# Part 1 — Do you need to create “products” in Stripe?

**No.**

Stripe’s home page may ask you to add a product. Other tutorials tell you to build a product catalog. **Ignore that for Peer Finance Manager.**

When Assurance’s treasurer clicks **Pay Monthly**, the software automatically tells Stripe:

- Product name: something like `Peer Finance Manager — Monthly`  
- Price: `$24.99`  

You will see those appear in Stripe **after** the first real payment. You do not set them up beforehand.

If you already created Peer Finance products manually, that is fine — the software will not use them.

**Next step:** Part 2 (API key).

---

# Part 2 — Create the restricted API key (goes to `STRIPE_SECRET_KEY`)

This key lets Peer Finance Manager on **Render** ask Stripe to open a payment page. It is **limited** so if it ever leaked, your other Work Chop apps (FlexxForms, ServeEazy, etc.) are not fully exposed.

**Do not** paste Work Chop’s main secret key (`sk_live_…`) into Render. Create a **restricted** key instead.

---

## Step 2.1 — Open the API keys page

1. In Stripe (Live mode), look at the top menu or right side for **Developers**.
2. Click **Developers**.
3. Click **API keys** in the submenu.

You will see publishable keys, secret keys, and a button to create a restricted key.

---

## Step 2.2 — Start creating a restricted key

1. Click **Create restricted key** (or **+ Create restricted key**).

A popup or new page asks: **“How will you be using this key?”**

---

## Step 2.3 — Choose how you will use the key

You will see three choices. Pick **only the first one**:

| Option | Pick this? |
|--------|------------|
| **Powering an integration you built** | **YES** — Peer Finance Manager is your software |
| Providing this key to a third-party application | **NO** — that is for plugins like Shopify |
| Authorizing an AI agent | **NO** |

Click **Continue**.

---

## Step 2.4 — Name the key

Find the **Name** field.

Type exactly (you can copy-paste):

```
Peer Finance Manager - Render (Live)
```

This helps you find it later among other Work Chop keys.

---

## Step 2.5 — Set permissions (what this key is allowed to do)

Stripe shows a long list of categories. For each category:

- Set **Write** = this key may do that action  
- Set **None** = this key cannot touch that area  

**Set Write on these six only:**

| Find this category in the list | Set to |
|--------------------------------|--------|
| Checkout Sessions | **Write** |
| Customers | **Write** |
| Billing portal session *(or Customer portal)* | **Write** |
| Products | **Write** |
| Prices | **Write** |
| Subscriptions | **Write** |

**Set everything else to None.**

Why these six? In plain terms:

- **Checkout Sessions** — opens the payment page when someone clicks Pay  
- **Customers** — remembers who paid  
- **Billing portal** — lets them update their card later  
- **Products & Prices** — the software creates the $24.99 / $71.22 / $272.89 lines automatically  
- **Subscriptions** — monthly / quarterly / yearly billing  

If names look slightly different in your Stripe screen, turn on **Write** for anything that mentions checkout, customers, billing portal, products, prices, or subscriptions.

---

## Step 2.6 — Create and copy the key

1. Scroll down and click **Create key** (or **Save**).
2. Stripe shows the new key **once**. It starts with **`rk_live_`**.
3. Click **Copy** (or select all and Ctrl+C).
4. Paste into a password manager or a private note labeled **PFM Live API Key**.

**Stop here until you have copied it.** If you lose it, you must create a new restricted key.

You will paste this into Render in Part 5. The Render variable name is `STRIPE_SECRET_KEY` even though the value starts with `rk_live_`.

---

# Part 3 — Why you need a webhook (read this once)

When someone pays on Stripe’s page, two things must happen:

1. **Stripe takes the money** (you see it in Stripe dashboard).  
2. **Your software marks Assurance as “Active”** (so they can use Cooperative Books).

Step 2’s API key handles opening the payment page.  
The **webhook** handles step 2 — Stripe **phones home** to Render and says “payment done.”

Without the webhook, money can be taken but Assurance stays **Pending** in the app.

The webhook needs:

- A **URL** on Render where Stripe sends the message  
- A **signing secret** (`whsec_…`) that Render uses to trust the message  

Part 4 creates both. Part 5 pastes the signing secret into Render as **`STRIPE_WEBHOOK_SECRET`**.

---

# Part 4 — Create the webhook in Stripe Workbench (every click)

Your Stripe screen shows **Workbench** with tabs like Overview, **Webhooks**, Events. Under Webhooks you see **Event destinations** and a purple **+ Add destination** button. You may already see FlexxForms and ServeEazy there.

You will add **one new line** for Peer Finance Manager. **Do not change** the existing FlexxForms or ServeEazy rows.

---

## Step 4.1 — Open Webhooks in Workbench

1. Stripe must still be in **Live mode**.
2. Click **Workbench** (if you are not already there).
3. Click the **Webhooks** tab.
4. You should see the heading **Event destinations** and your existing destinations in a table.

---

## Step 4.2 — Start adding a destination

1. Click the purple **+ Add destination** button (top right of the Event destinations section).

A step-by-step wizard opens.

---

## Step 4.3 — Whose events?

Stripe asks where events come from.

1. Select **Events on your account** (or **Your account**).
2. Do **not** pick “Connected accounts” unless you run a Stripe Connect marketplace (Work Chop does not need that for Peer Finance Manager).
3. Click **Continue**.

---

## Step 4.4 — API version (if Stripe asks)

If you see **API version**:

1. Leave whatever Stripe already selected.
2. Click **Continue**.

You do not need to change this.

---

## Step 4.5 — Choose the four event types

Stripe shows a search box and a list of event names. You must pick **exactly four**.

For each row below: type the name in the search box, then **check the box** next to it.

| Step | Type in search box | Check this event |
|------|-------------------|------------------|
| A | `checkout.session.completed` | checkout.session.completed |
| B | `customer.subscription.updated` | customer.subscription.updated |
| C | `customer.subscription.deleted` | customer.subscription.deleted |
| D | `invoice.payment_failed` | invoice.payment_failed |

Before you continue, count your selections: **you must have 4 events selected.**

Do **not** choose “all events” — only these four.

Click **Continue**.

**What they mean in plain English:**

| Event | When Stripe sends it |
|-------|----------------------|
| checkout.session.completed | Someone finished paying on the checkout page |
| customer.subscription.updated | Subscription renewed or changed |
| customer.subscription.deleted | Subscription cancelled |
| invoice.payment_failed | Card charge failed |

---

## Step 4.6 — Choose “Webhook” as the destination type

Stripe asks how to deliver these events.

1. Click **Webhook** (or **Webhook endpoint**).
2. Do **not** choose Amazon EventBridge or Azure.
3. Click **Continue**.

---

## Step 4.7 — Enter the URL where Stripe should send messages

Find the box labeled **Endpoint URL** (or **URL**).

Click inside it. Delete anything there. Paste **exactly** this (copy the whole line):

```
https://peer-finance-manager.onrender.com/api/billing/stripe-webhook
```

**Checklist before you save:**

- Starts with `https://` (the **s** matters — secure)
- Says `peer-finance-manager.onrender.com`
- Ends with `/api/billing/stripe-webhook`
- **No** space at the beginning or end
- **No** slash `/` after `webhook`

If there is a **Name** or **Description** field, type:

```
Peer Finance Manager
```

Click **Create destination** (or **Add destination** / **Save**).

---

## Step 4.8 — Open the new destination’s detail page

After saving, Stripe usually opens a page about your new webhook.

You should see:

- Your URL  
- Status: **Active**  
- Listening to **4 events**

**If you only see the table again:**

1. Stay on **Workbench → Webhooks**.
2. Find the new row whose URL contains `peer-finance-manager.onrender.com`.
3. **Click that row** to open details.

Your table will now have three apps (FlexxForms, ServeEazy, Peer Finance Manager) — each with its own URL.

---

## Step 4.9 — Copy the Signing secret (this becomes `STRIPE_WEBHOOK_SECRET`)

On the destination detail page:

1. Scroll until you see **Signing secret**.
2. Under it, Stripe may show dots `••••••` and a **Reveal** link or eye icon.
3. Click **Reveal**.
4. A long code appears. It always starts with **`whsec_`**.
5. Click **Copy** next to it (or highlight all and copy).

Save it in your password manager as **PFM Live Webhook Secret**.

**This `whsec_…` string is your `STRIPE_WEBHOOK_SECRET.**  
It is **not** the same as your `rk_live_…` API key from Part 2. You need **both**.

---

# Part 5 — Paste everything into Render (every field explained)

Render stores secrets in **Environment** settings. Think of it as a locked notebook: left column = setting name, right column = value.

---

## Step 5.1 — Open Environment on Render

1. Go to **https://dashboard.render.com**.
2. Click **peer-finance-manager**.
3. On the left menu, click **Environment**.

You will see a list of variables (may be empty or have some already).

---

## Step 5.2 — Add or edit each variable

For each row below, click **Add Environment Variable** (or edit if it already exists).

Type the **Key** exactly as shown (spelling and capitals matter). Paste or type the **Value**.

### Required for card payments

| Key (copy exactly) | Value (what to put) |
|--------------------|---------------------|
| `STRIPE_SECRET_KEY` | Paste your **`rk_live_…`** key from Part 2, Step 2.6 |
| `STRIPE_WEBHOOK_SECRET` | Paste your **`whsec_…`** secret from Part 4, Step 4.9 |
| `APP_BASE_URL` | `https://peer-finance-manager.netlify.app` |

**APP_BASE_URL** tells Stripe where to send the user after they pay (back to the admin website).

### Strongly recommended

| Key | Value |
|-----|--------|
| `PLATFORM_ADMIN_PASSWORD` | Choose a strong password you will remember. This secures your login at `/platform`. |
| `PLATFORM_CHECK_PAYABLE_TO` | `Work Chop Inc.` (or the exact legal name on checks) |
| `PLATFORM_CHECK_MAILING_ADDRESS` | Full mailing address where cooperatives send paper checks |

### Tips

- Do **not** put quote marks `"` around values unless Render adds them for you.
- Paste the **whole** key — they are long.
- No spaces before or after the `=` when typing manually.

---

## Step 5.3 — Save and redeploy (required)

1. Click **Save Changes** at the bottom.
2. Render will ask if you want to redeploy. Click **Yes** / **Deploy**.
3. Wait on the Render page until the deploy shows **Live** (often 2–5 minutes; sometimes longer).

**The software does not use new secrets until redeploy finishes.** Do not test payments while it still says “Building” or “Deploying.”

---

# Part 6 — Check that Stripe is connected

## Step 6.1 — Health check (easy test)

1. Open a new browser tab.
2. Go to: **https://peer-finance-manager.onrender.com/api/health**
3. You will see a block of text (technical JSON). That is normal.

Search the page for:

```
"stripeConfigured":true
```

or

```
"stripeConfigured": true
```

| What you see | What it means |
|--------------|---------------|
| `"stripeConfigured": true` | Both secrets are on Render. Good — go to Part 7. |
| `false` or missing | One or both Stripe variables missing, or redeploy not done. Redo Part 5. |

---

## Step 6.2 — Optional: ask Stripe to send a practice ping

This does **not** charge money. It only checks that Stripe can reach your server.

1. Stripe → **Workbench** → **Webhooks**.
2. Click your **Peer Finance Manager** destination.
3. Find **Send test event** (sometimes under a **⋯** menu).
4. Choose event: **checkout.session.completed**.
5. Click **Send**.
6. Open **Event deliveries** (or **Attempts**) on the same page.

| Result | Meaning |
|--------|---------|
| **200** or Succeeded | Webhook URL and secret are correct |
| **400** | Wrong `STRIPE_WEBHOOK_SECRET` on Render — re-copy from Part 4.9 |
| **404** | Wrong URL in Part 4.7 |
| Timeout | Render was asleep — open the health URL once, wait 30 seconds, try again |

---

# Part 7 — Turn on “update card later” (optional but helpful)

After cooperatives pay by card, they can change their card without calling you.

1. In Stripe, click the **gear icon** (**Settings**).
2. Click **Billing**.
3. Click **Customer portal**.
4. Turn the portal **on** if it is off.
5. Enable **Payment methods** (allow customers to update card).
6. Click **Save**.

No changes needed on Render.

---

# Part 8 — First real payment (Assurance Cooperative)

This step uses a **real card** and **real money**.

## Step 8.1 — Sign in as Assurance administrator

1. Go to **https://peer-finance-manager.netlify.app/admin**
2. Fill in:
   - **Organization Code:** `assurance`
   - **Email:** your Assurance admin email
   - **Password:** your admin password
3. Click **Sign In**.

## Step 8.2 — Find Platform Subscription

1. You should land on **Cooperative Books**.
2. Scroll down until you see **Platform Subscription**.
3. Click the header to expand it if it is collapsed.
4. You should see buttons: **Pay Monthly**, **Pay Quarterly**, **Pay Annual**.

If you do not see this section, billing may not be deployed (Part 0) or you are not signed in as an **administrator**.

## Step 8.3 — Pay

1. Click **Pay Monthly** (simplest first test).
2. Your browser should go to a **stripe.com** payment page (Work Chop Inc.).
3. Enter a **real** credit or debit card and complete payment.
4. Stripe sends you back to the admin site.

## Step 8.4 — Confirm in the app

1. In **Platform Subscription**, click **Refresh** (or reload the page).
2. **Status** should say **Active**.
3. **Plan** should say **monthly** (or whichever you chose).

## Step 8.5 — Confirm in Stripe

1. Stripe (Live) → **Payments** — you should see the charge.
2. **Workbench → Webhooks → Peer Finance Manager → Event deliveries** — green **200** for `checkout.session.completed`.

If payment worked on Stripe but Status is still **Pending**, the webhook is wrong — repeat Part 4.9 and Part 5, then redeploy.

You may **refund** the test charge in Stripe → Payments if you only wanted to verify setup.

---

# Part 9 — After setup: who does what

### Cooperative treasurer (e.g. Assurance)

- Website: **https://peer-finance-manager.netlify.app/admin**
- Organization code: `assurance`
- **Cooperative Books → Platform Subscription → Pay** (card) or **Request Check Payment** (mail a check to Work Chop)

### You (Work Chop platform owner)

- Website: **https://peer-finance-manager.netlify.app/platform**
- Email: `ydaramola@gmail.com` and the password you set as `PLATFORM_ADMIN_PASSWORD`
- See all cooperatives; **Record Check Payment** when a check arrives

### Another cooperative later

Same Stripe setup. No new keys or webhooks. They get Pay buttons under their own admin login.

---

# Printable checklist

- [ ] Render deploy is **Live**
- [ ] Stripe is in **Live mode**; account activation complete
- [ ] Restricted key created: **Powering an integration you built**
- [ ] Six permissions set to **Write**; all else **None**
- [ ] `rk_live_…` copied to Render **`STRIPE_SECRET_KEY`**
- [ ] Workbench **+ Add destination** created for Peer Finance Manager
- [ ] URL is exactly `https://peer-finance-manager.onrender.com/api/billing/stripe-webhook`
- [ ] Four events selected
- [ ] `whsec_…` copied to Render **`STRIPE_WEBHOOK_SECRET`**
- [ ] `APP_BASE_URL` = `https://peer-finance-manager.netlify.app`
- [ ] Render **saved and redeployed**
- [ ] Health page shows **`stripeConfigured": true`**
- [ ] Real payment → Assurance **Active**

---

# When something goes wrong

| What you see | What to do |
|--------------|------------|
| “Stripe is not configured” when clicking Pay | Add both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on Render; redeploy; check health page |
| Error about permissions / 403 | Edit restricted key in Stripe — add **Write** for Products, Prices, Checkout Sessions, Subscriptions |
| Card charged but Status stays Pending | Webhook problem — re-copy `whsec_…`, check URL in Part 4.7, redeploy; look at Event deliveries in Stripe |
| After paying, wrong website opens | Set `APP_BASE_URL` to `https://peer-finance-manager.netlify.app`, redeploy |
| Edited FlexxForms or ServeEazy webhook by mistake | Leave those alone; Peer Finance Manager needs its **own** row with `peer-finance-manager` in the URL |
| Lost the `rk_live_…` key | Create a new restricted key in Stripe; update Render; redeploy |
| Lost the `whsec_…` secret | Open Peer Finance Manager destination → **Roll secret** → copy new value → update Render → redeploy |

---

# Other documents

- **Shorter technical notes:** [STRIPE-SETUP.md](STRIPE-SETUP.md)  
- **Email reminders (separate from payments):** [EMAIL-NOTIFICATIONS-SETUP.md](EMAIL-NOTIFICATIONS-SETUP.md)
