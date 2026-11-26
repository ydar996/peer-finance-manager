# Secrets Inventory And Rotation Procedure

**Last Updated:** 2026-11-26
**Owner:** Platform Owner (see SECURITY-OWNER section in SECURITY-OPS.md)

## Inventory

All secrets live in hosting environment variables. No secret is stored in the
repository. Values are never written into docs, tickets, or chat.

| Secret | Where It Lives | What It Protects | Rotation Trigger |
|---|---|---|---|
| `SESSION_SECRET` (or equivalent cookie signing material) | Render env vars | Org + platform session cookies | Suspected leak, staff change, annual |
| `PLATFORM_ADMIN_PASSWORD` / platform admin hash seed | Render env vars | Platform (super admin) login | Annual or on suspicion |
| `ASSURANCE_ADMIN_PASSWORD` | Render env vars | Seeded Assurance admin password | After first login password change |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable key | Render env vars | Billing: checkout, portal, webhooks | Annual or on suspicion |
| `FLEXXFORMS_PROVISIONING_SECRET` (and related FlexxForms keys) | Render env vars | Workspace provisioning + API calls to FlexxForms | Annual or on suspicion |
| `SMTP_HOST/USER/PASS` (Bluehost) | Render env vars | Outbound email: dues reminders, welcomes, notifications | On provider password change |
| `SECURITY_ALERT_WEBHOOK_URL` (optional) | Render env vars | Error alert webhook (Slack/Discord/ntfy) | On webhook rotation |
| `ALLOWED_ORIGINS` | Render env vars | CORS allowlist (not secret, but security-relevant) | On domain changes |
| Backup passphrases | Held by each Cooperative admin (user-side) | Encrypted database backups | Cooperative's choice; lost passphrase = unrecoverable backup |
| GitHub token / `gh` auth | Local keyring | Repo push/pull | On suspicion or expiry |
| Netlify/Render dashboard credentials | Password manager | Hosting control planes | Annual |

## Rotation Procedure

1. Generate the new secret at the provider (Stripe dashboard, FlexxForms admin,
   Bluehost panel, or `openssl rand -hex 32` for generated values).
2. Update the env var in the Render dashboard (and Netlify if applicable).
3. Render restarts the service automatically; confirm `/api/health` returns ok.
4. For `SESSION_SECRET`: all users are logged out once. Announce beforehand.
5. For Stripe keys: verify a test checkout or webhook delivery after rotation.
6. Record the rotation (date, secret name, who did it) in ACCESS-REVIEWS.md or
   the security log. Never record the value.
7. Revoke the old secret at the provider after confirming the new one works.

## Rules

- Never commit secrets. `.env` files stay local and git-ignored.
- Never paste secrets into chat, tickets, or documentation.
- Production secrets differ from local/dev values.
- If a secret may have leaked: rotate immediately, then review
  `security_events` and `data/security/errors.jsonl` for suspicious activity.
