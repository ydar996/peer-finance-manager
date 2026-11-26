# Data Retention Policy

**Last Updated:** 2026-11-26

## Retention Schedule

| Data | Retention | Basis |
|---|---|---|
| Cooperative financial records (ledger, members, loans) | Life of the Cooperative account + export window after closure | Contract; financial record-keeping duties |
| Sessions | 7 days absolute, 24h idle | Security minimum |
| Security events | Indefinite in registry DB; quarterly export optional | Audit evidence |
| Error logs | Rotates at 5 MB (~recent weeks) | Debugging; low sensitivity |
| Upload temp files | Deleted immediately after processing | Minimization |
| Message attachments | Life of the Cooperative account | Feature function |
| Email audit rows | 12 months rolling (service-managed) | Delivery troubleshooting |
| Platform billing records | While subscribed + statutory minimum | Tax/accounting law |
| Deleted Cooperative data | Removed on deletion request; residual backups per provider schedule | See DATA-DELETION.md |

## Rules

- Data is deleted when its purpose ends, not kept "just in case" beyond the
  schedule above.
- Backups: encrypted backups are held by Cooperative admins (user-side);
  the platform does not retain server-side copies. Provider disk snapshots
  follow Render's schedule.
- Deletion requests: honor within 30 days; confirm in writing.
