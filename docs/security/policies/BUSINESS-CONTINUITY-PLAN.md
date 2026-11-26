# Business Continuity And Disaster Recovery Plan

**Version:** 1.0 | **Effective:** 2026-11-26 | **Owner:** Platform Owner

## Objectives

- **RPO (Recovery Point Objective):** up to 24 hours of data loss is
  tolerable. Org databases are live SQLite files on the Render disk;
  point-in-time recovery is not available, so the practical RPO equals the
  interval between Cooperative-admin downloaded backups plus WAL
  checkpointing on the live disk.
- **RTO (Recovery Time Objective):** service restored within 4 hours of a
  provider-level failure; a single org's data restored within 1 hour of a
  request.

## Backup Strategy

- **Cooperative-initiated backups:** admins download encrypted backups
  (AES-256-GCM, passphrase-held-by-admin) anytime. Recommended: weekly
  plus before bulk imports.
- **Provider disk:** Render persistent disk holds live DBs; Render's own
  snapshots/backups apply if enabled on the plan. Confirm plan features.
- **Code:** GitHub `main` is the source of truth; full history retained.
- **Configuration:** env vars documented by name in SECRETS-INVENTORY.md
  (values live only in provider dashboards; keep dashboard access current).

## Failure Scenarios

| Scenario | Response |
|---|---|
| Render outage | Wait for provider; post status note; no data action needed |
| Accidental org data corruption/deletion | Restore from latest encrypted backup via Admin > Maintenance > Database Restore; verify with restore drill steps |
| Bad deploy | Rollback on Render to previous deploy; fix forward via PR |
| Netlify frontend failure | Redeploy last good publish or rollback |
| Full platform loss | Rebuild on Render/Netlify from git; restore org DBs from backups; orgs without recent backups lose data since last download (communicate RPO honestly) |
| Key person unavailable | All credentials in password manager + SECRETS-INVENTORY; second person with dashboard access should be designated |

## Testing

- Quarterly: run `scripts/backup-restore-drill.js <slug>` and record result.
- After any infra change: verify `/api/health` and a login smoke test.
