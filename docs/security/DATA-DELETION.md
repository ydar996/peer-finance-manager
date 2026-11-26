# Organization Data Deletion Procedure

**Last Updated:** 2026-11-26

How a Cooperative's data is fully deleted, and what remains elsewhere.

## In-Platform Deletion (platform admin)

`DELETE /api/platform/organizations/:slug` with `confirmSlug` matching the
slug (Admin > platform console, or API). This removes:

- The `organizations` registry row (cascades to that org's `sessions`)
- The entire `data/organizations/<slug>/` directory: database, uploads,
  public pages, exports, reports, workbooks
- Any `.bak-*` database copies inside the org dir

Every deletion is recorded in `security_events` as `org.deleted` (critical).

## Residuals Outside The Platform

Deletion in-platform does NOT remove:

- **FlexxForms workspace:** the org's FlexxForms tenant (Supabase) retains
  form templates and submissions. Delete via FlexxForms admin or contact
  the platform owner to purge the tenant.
- **Stripe customer record:** billing profile remains for accounting;
  request Stripe customer deletion if required.
- **Email provider logs:** Bluehost/SMTP logs retain message metadata per
  provider retention.
- **Downloaded backups:** any `.db` / `.db.enc` files the Cooperative
  downloaded remain valid until deleted or passphrase forgotten. The
  Cooperative must delete these itself; the platform cannot reach them.
- **Render disk snapshots/backups:** provider-level snapshots, if enabled,
  follow Render's retention.

## Verification

After deletion, confirm: registry row gone, org dir gone, login attempts
return "Organization code is required"/not found, and `/c/<slug>/about`
returns unavailable.
