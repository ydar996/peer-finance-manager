# Incident Response Plan

**Last Updated:** 2026-11-26
**Owner:** Platform Owner (security owner of record)

This plan covers security incidents: suspected unauthorized access, data
breach, malware, credential compromise, and availability incidents with a
security cause.

## Severity Levels

- **SEV1 (Critical):** confirmed or suspected breach of member/financial
  data, active exploitation, or full outage with security cause.
- **SEV2 (High):** vulnerability with realistic exploit path, credential
  leak, suspicious admin activity.
- **SEV3 (Medium):** policy violation, failed attack attempts at scale,
  minor data exposure (e.g., a single non-sensitive file).

## Response Steps

### 1. Detect And Triage (immediate)

- Sources: `security_events` table, `data/security/errors.jsonl`,
  provider alerts (Render/Netlify), user reports, vulnerability reports to
  security@peerfinancemanager.com.
- Classify severity. For SEV1/SEV2, start a written incident log (file or
  doc) recording times, actions, and findings.

### 2. Contain

- Revoke compromised sessions: delete rows from `sessions` /
  `platform_sessions` in `data/registry.db` for affected users, or rotate
  `SESSION_SECRET` (logs everyone out).
- Disable compromised accounts (`users.active = 0`).
- Rotate exposed secrets per SECRETS-INVENTORY.md.
- If a vulnerability is being exploited, roll back the deploy or apply a
  hotfix; Render keeps previous deploys for instant rollback.
- For external abuse (spam uploads, scraping): enable/extend rate limits,
  block at Cloudflare/Render edge if configured.

### 3. Eradicate And Recover

- Remove malicious artifacts (uploaded files, injected data).
- Patch the root cause; add a regression check.
- Restore from backup only if data integrity is in question; verify with
  the restore drill procedure first.

### 4. Notify

- **Affected Cooperatives/members:** without undue delay once scope is
  confirmed. Provide what happened, what data, what we did, what they
  should do.
- **Regulators:** Nigerian NDPR and any applicable regime require breach
  notification; where GDPR applies, notify the supervisory authority
  within 72 hours of awareness.
- **Providers:** notify Stripe/Render/Netlify if their platform is involved.
- **Users:** force password resets for affected accounts.

### 5. Postmortem (within days of resolution)

- Write a blameless postmortem: timeline, root cause, impact, what worked,
  what failed.
- Add corrective actions to the risk register with owners.
- File the incident record under docs/security/incidents/.

## Contacts

- Security reports: security@peerfinancemanager.com
- Platform owner: (recorded in ACCESS-REVIEWS.md)
- Hosting: Render status/support; Netlify status/support
- Payments: Stripe support

## Tabletop Exercise

A simulated incident walkthrough was conducted 2026-11-26; minutes in
TABLETOP-EXERCISE-2026-11-26.md.
