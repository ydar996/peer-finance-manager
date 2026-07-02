# Stripe Setup — Technical Notes (Peer Finance Manager)

**For step-by-step plain-English instructions, use [STRIPE-PAYMENTS-GUIDE.md](STRIPE-PAYMENTS-GUIDE.md).**  
That document explains every click, defines jargon, and walks through Live setup for Work Chop Inc.

This file is a short reference for developers.

---

## Operator

Work Chop Inc. — existing Stripe account, Live mode only.

## Pricing (in app code)

| Plan | USD |
|------|-----|
| Monthly | 24.99 |
| Quarterly | 71.22 |
| Annual | 272.89 |

## Render env vars

| Variable | Example |
|----------|---------|
| `STRIPE_SECRET_KEY` | `rk_live_…` (restricted key) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `APP_BASE_URL` | `https://peer-finance-manager.netlify.app` |
| `PLATFORM_CHECK_PAYABLE_TO` | `Work Chop Inc.` |

## Restricted key permissions (Write only)

Checkout Sessions, Customers, Billing portal, Products, Prices, Subscriptions.

## Webhook

- **Workbench → Webhooks → + Add destination**
- URL: `https://peer-finance-manager.onrender.com/api/billing/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Signing secret → `STRIPE_WEBHOOK_SECRET`

## Health

`GET /api/health` → `"stripeConfigured": true`

## Code

- `peer-finance-manager/lib/platform-billing-service.js` — checkout, webhook, portal
- Dynamic `price_data` at checkout — no Stripe catalog required
