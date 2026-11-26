# Security Operations Runbook

**Last Updated:** 2026-11-26
**Owner:** Platform Owner

## Monitoring And Alerting

- **Uptime:** Point an external monitor (UptimeRobot, Better Stack, or
  StatusCake, free tier is sufficient) at `https://peerfinancemanager.com/api/health`
  with a 5-minute interval. Alert on any non-200 or `ok:false`.
- **Errors:** The app writes structured error records to
  `data/security/errors.jsonl` on the host (rotates at 5 MB, keeps one
  generation). HTTP 5xx responses, uncaught exceptions, and unhandled
  rejections are captured automatically.
- **Alert webhook (optional):** Set `SECURITY_ALERT_WEBHOOK_URL` to a
  Slack/Discord/ntfy incoming-webhook URL. Critical-severity records are
  POSTed there, throttled to one per minute. Not configured by default.
- **Security events:** Auth and admin actions are recorded in the registry
  `security_events` table (see below). Query via
  `GET /api/security-events?limit=N` as an org admin, or directly in
  `data/registry.db` for platform-wide review.

## Security Event Log

Table `security_events` in `data/registry.db`. Columns: `ts`,
`organization_slug`, `event_type`, `severity` (info/warning/critical),
`actor_user_id`, `actor_label`, `ip`, `detail`.

Event types currently emitted:

- `auth.login`, `auth.login_mfa_pending`, `auth.login_failed`,
  `auth.mfa_verified`, `auth.mfa_verify_failed`, `auth.logout`,
  `auth.set_password`, `auth.password_changed`, `auth.password_change_failed`
- `mfa.enroll_started`, `mfa.enrolled`, `mfa.enroll_failed`,
  `mfa.disabled`, `mfa.admin_reset`
- `user.created`, `user.provision_members`, `user.member_password_reset`
- `org.registered`, `org.deleted` (platform), `admin.database_restore`,
  `public_pages.about_saved`, `public_pages.bylaws_saved`,
  `flexxforms.provision_retry`, `platform.login`, `platform.login_failed`,
  `platform.logout`, `billing.check_payment_recorded`

**Review cadence:** weekly, scan for `warning`/`critical` rows and repeated
`auth.login_failed` from one IP (brute-force signal). Retention: keep
indefinitely in the registry DB; export quarterly if needed for audits.

## Session Policy

- Org + platform sessions: 7-day absolute expiry, HttpOnly + SameSite=Lax +
  Secure cookies.
- Sliding idle timeout: 24 hours without activity ends the session
  (`last_seen_at` touched at most once per 5 minutes per session).

## Backup And Restore

- Admins download encrypted backups (Admin > Maintenance > Database Backup,
  passphrase-protected, AES-256-GCM). Backups are not stored server-side.
- **Restore drill:** `node peer-finance-manager/scripts/backup-restore-drill.js <slug>`
  copies an org, encrypts a backup, proves wrong-passphrase rejection,
  decrypts, restores via the real restore path, and verifies all table row
  counts match. Last run 2026-11-26 against `assurance`: PASSED, 32 tables
  identical. Run quarterly and after any backup-format change.
- Manual restore: Admin > Maintenance > Database Restore, upload the `.db`
  or `.db.enc` file, preview, confirm.

## Deploy Notes

- Backend: Render, auto-deploys `main`. Verify with
  `curl https://peerfinancemanager.com/api/health` (reports git commit).
- Frontend: Netlify, auto-deploys `main`.
- `main` is branch-protected: PR + passing `npm audit` check required,
  force-pushes and deletions blocked, admins included.
