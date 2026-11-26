# Onboarding And Offboarding Checklist

**Version:** 1.0 | **Effective:** 2026-11-26 | **Owner:** Platform Owner

## Onboarding (new person with any access)

- [ ] Signed confidentiality acknowledgment (email confirmation suffices
      for contractors at current scale)
- [ ] Named individual accounts only — no shared logins
- [ ] MFA enabled on GitHub, Render, Netlify, Stripe, Supabase, Bluehost
- [ ] Role assigned per ACCESS-CONTROL-POLICY (least privilege)
- [ ] Read INFORMATION-SECURITY-POLICY + ACCEPTABLE-USE-POLICY
- [ ] Record grant date + scope in ACCESS-REVIEWS.md

## Offboarding / Role Change (same day)

- [ ] Revoke dashboard access: GitHub, Render, Netlify, Stripe, Supabase,
      Bluehost
- [ ] Deactivate app accounts: set `users.active = 0` (org users) or remove
      `platform_users` row (platform)
- [ ] Rotate any shared secret the person could have seen (env vars,
      API keys) per SECRETS-INVENTORY.md
- [ ] Collect devices/keys: revoke SSH keys, personal access tokens,
      `.env` copies confirmed deleted
- [ ] Record revocation date in ACCESS-REVIEWS.md
- [ ] If the person had production data access: review `security_events`
      for their actor_label in the final 30 days
