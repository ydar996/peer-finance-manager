# Subprocessors And Data Processing Agreements

**Last Updated:** 2026-11-26

Every third party that processes Platform or Cooperative data. Each
Cooperative should be able to request this list; DPAs should be on file
with each provider (their standard terms or a signed DPA).

| Provider | Role | Data Touched | DPA Status |
|---|---|---|---|
| Render | Application hosting, database disk | All app data, env secrets | Render DPA available; accept via dashboard terms |
| Netlify | Frontend static hosting | Public pages, static assets (no member data beyond public content) | Netlify DPA available |
| Stripe | Subscription payments | Billing email, payment method tokens, transaction records | Stripe DPA standard; SAQ A scope |
| FlexxForms | Membership/loan forms (separate product, same owner) | Application form submissions, member identity data | Internal product; same controller/processor terms apply |
| Bluehost (SMTP relay) | Outbound email relay for system notifications (via eworkchop.com relay script) | Recipient emails, names, message content | Standard email terms; no DPA needed at current volume, review if enterprise |
| Namecheap | Domain registration + free email forwarding for peerfinancemanager.com | Inbound contact addresses (security@/privacy@/legal@ forwarded to owner inbox), domain WHOIS privacy | Namecheap standard terms; low data volume |
| Supabase (FlexxForms backend) | FlexxForms database | FlexxForms workspace data | Supabase DPA available; accept in FlexxForms project settings |
| Uptime monitor (TBD) | Health checks | URL only, no user data | Free tier sufficient |
| Error webhook (optional) | Alert forwarding | Error metadata only | n/a |

## Actions For Owner

1. Accept/execute DPAs in Render, Netlify, Stripe, and Supabase dashboards.
2. Record acceptance dates here.
3. Review this list whenever a new vendor is added (see VENDOR-MANAGEMENT
   policy).
