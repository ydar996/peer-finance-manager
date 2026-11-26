# ISMS Document Index

**Last Updated:** 2026-11-26

The Information Security Management System documentation set. For SOC 2 /
ISO 27001 readiness this is the "policy layer"; technical controls are
documented in SECURITY-OPS.md and verified in code.

## Policies (docs/security/policies/)

- INFORMATION-SECURITY-POLICY.md — top-level policy and control summary
- ACCESS-CONTROL-POLICY.md — roles, MFA, sessions, reviews
- ACCEPTABLE-USE-POLICY.md — permitted/prohibited use
- CHANGE-MANAGEMENT-POLICY.md — git, protected main, CI, deploys
- VENDOR-MANAGEMENT-POLICY.md — subprocessor onboarding/review/offboarding
- BUSINESS-CONTINUITY-PLAN.md — RPO/RTO, backups, failure scenarios
- DATA-CLASSIFICATION-POLICY.md — Restricted/Confidential/Internal/Public
- ONBOARDING-OFFBOARDING.md — access grant/revoke checklists
- SECURITY-AWARENESS.md — training and annual self-review

## Operational Documents (docs/security/)

- SECURITY-OPS.md — monitoring, alerting, session policy, restore drill,
  deploy verification
- SECRETS-INVENTORY.md — every secret, where it lives, rotation steps
- INCIDENT-RESPONSE-PLAN.md — severity, containment, notification,
  postmortem
- BREACH-RUNBOOK.md — breach-specific notification matrix and evidence
- DATA-INVENTORY.md — records of processing (what data, where, why)
- DATA-DELETION.md — full org deletion procedure + residuals
- RETENTION-POLICY.md — retention schedule per data type
- SUBPROCESSORS.md — vendor register + DPA status
- RISK-REGISTER.md — living risk register (quarterly review)
- ACCESS-REVIEWS.md — quarterly access review log
- TABLETOP-EXERCISE-2026-11-26.md — simulated incident minutes

## Related Repo Documents

- SECURITY.md (repo root) — vulnerability disclosure policy
- public/.well-known/security.txt — machine-readable contact
- public/privacy.html, public/terms.html — public legal pages
- AGENT_HANDOVER.md — engineering changelog and architecture
- SECURITY-COMPLIANCE-ROADMAP.md — the plan this document set implements
