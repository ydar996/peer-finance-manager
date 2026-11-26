# Subprocessors And Data Processing Agreements

**Last Updated:** 2026-11-25

Every third party that processes Platform or Cooperative data. Each
Cooperative should be able to request this list; DPAs should be on file
with each provider (their standard terms or a signed DPA).

**DPA copies:** executed/downloaded DPA PDFs are stored in
`vendor-dpas/` in this folder, named `Vendor-DPA-YYYY-MM-DD.pdf`.

| Provider | Role | Data Touched | DPA Status |
|---|---|---|---|
| Render | Application hosting, database disk | All app data, env secrets | GDPR DPA downloaded from Document Center, 2026-11-25 — copy in `vendor-dpas/Render-GDPR-DPA-2026-11-25.pdf` |
| Netlify | Frontend static hosting | Public pages, static assets (no member data beyond public content) | Automatic — incorporated in Self-Serve Subscription Agreement; copy saved 2026-11-25 |
| Stripe | Subscription payments | Billing email, payment method tokens, transaction records | Automatic — incorporated in Stripe Services Agreement (stripe.com/legal/dpa); copy saved 2026-11-25; SAQ A scope |
| FlexxForms | Membership/loan forms (separate product, same owner) | Application form submissions, member identity data | Internal product; same controller/processor terms apply |
| Bluehost (SMTP relay) | Outbound email relay for system notifications (via eworkchop.com relay script) | Recipient emails, names, message content | Standard email terms; no DPA needed at current volume, review if enterprise |
| Namecheap | Domain registration + email for peerfinancemanager.com | Contact addresses security@/privacy@/legal@, domain WHOIS privacy | Namecheap standard terms; addresses configured 2026-11-25 |
| Supabase (FlexxForms backend) | FlexxForms database | FlexxForms workspace data | Automatic — Data Processing Addendum incorporated in Terms of Service (Aug 2026); viewed 2026-11-25 |
| UptimeRobot | Uptime/health monitoring | URL only, no user data | Free account active 2026-11-25; 5-min monitor on peerfinancemanager.com/api/health, email alerts enabled |
| Error webhook (optional) | Alert forwarding | Error metadata only | n/a |

## Actions For Owner

1. ~~Accept/execute DPAs~~ Done 2026-11-25 (Render downloaded; Netlify,
   Stripe, Supabase automatic via sign-up terms — copies saved).
2. ~~Record acceptance dates here~~ Done 2026-11-25.
3. Review this list whenever a new vendor is added (see VENDOR-MANAGEMENT
   policy).
