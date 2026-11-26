# Access Control Policy

**Version:** 1.0 | **Effective:** 2026-11-26 | **Owner:** Platform Owner

## Application Access

- Roles: `admin`, `staff`, `member` per organization; `super_admin` for
  platform operators.
- Least privilege: members see only their own records; staff see
  operational data; admins see all org functions; platform admin sees
  cross-org billing/org management only.
- MFA: supported for all users; REQUIRED for platform admin and
  recommended/required for org admins handling finances.
- Sessions: 7-day absolute expiry, 24-hour sliding idle timeout, HttpOnly
  cookies. Passwords: minimum 8 characters, scrypt-hashed, must-change flag
  for seeded/reset accounts.
- Failed logins are rate-limited and recorded in `security_events`.

## Infrastructure Access

- Render/Netlify/GitHub/Stripe dashboards: individual named accounts with
  MFA enabled. No shared logins.
- Production env vars: only the service account and the platform owner.
- SSH/CLI access to any host: key-based, per-person keys, no shared keys.

## Reviews

- Quarterly access review recorded in ACCESS-REVIEWS.md: every account,
  role, and dashboard login is confirmed still needed; stale access is
  revoked same day.
- On role change or departure: revoke in the same session per
  ONBOARDING-OFFBOARDING.md.

## Exceptions

Any exception requires written approval from the platform owner, an expiry
date, and a compensating control noted in the risk register.
