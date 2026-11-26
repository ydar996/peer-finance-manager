# Information Security Policy

**Version:** 1.0 | **Effective:** 2026-11-26 | **Owner:** Platform Owner

## Purpose

Define how Peer Finance Manager protects member and Cooperative data and
keeps the service available and trustworthy.

## Scope

The web application, its API, databases, hosting (Render, Netlify), payment
processing (Stripe), the FlexxForms integration, email delivery, and all
personnel and contractors with access.

## Principles

1. **Confidentiality:** member financial data is visible only to authorized
   users of that Cooperative; platform admins access it only for support
   with cause.
2. **Integrity:** financial records are append-oriented; destructive actions
   (restore, delete) require admin role, confirmation, and are logged.
3. **Availability:** backups, monitoring, and incident response keep the
   service running and recoverable.
4. **Least privilege:** access is granted per role and per organization;
   production secrets are limited to what the service needs.
5. **Defense in depth:** TLS, security headers, CSP, rate limiting, hashed
   passwords, MFA support, session timeouts, and per-org isolation all
   apply together.

## Key Controls (summary; details in linked docs)

- Authentication: scrypt password hashing, TOTP MFA, session cookies
  (HttpOnly/SameSite/Secure), 7-day absolute + 24h idle session expiry.
- Authorization: per-org database isolation, role checks on every admin
  route, member-self scoping.
- Logging: `security_events` table, `errors.jsonl`, HTTP 5xx capture.
- Change management: protected `main` branch, PR + required `npm audit`
  check, Dependabot.
- Vendor management: SUBPROCESSORS.md register.
- Incident response: INCIDENT-RESPONSE-PLAN.md.
- Business continuity: BUSINESS-CONTINUITY-PLAN.md.

## Compliance Targets

SOC 2 Type II and ISO 27001. This policy and its companions form the
Information Security Management System documentation.
