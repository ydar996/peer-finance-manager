# Access Review Log

**Cadence:** quarterly. **Owner:** Platform Owner.

Each review: export current access, confirm each entry is still needed,
revoke stale access same day, record outcome below.

## Review Checklist

- [ ] GitHub repo collaborators (Settings > Collaborators)
- [ ] Render team members + env var access
- [ ] Netlify team members
- [ ] Stripe dashboard users
- [ ] Supabase (FlexxForms) team members
- [ ] Bluehost/email account users
- [ ] Platform admin accounts (`platform_users` table)
- [ ] Per-org admin/staff accounts (spot-check largest orgs)
- [ ] API keys/tokens still in use (rotate unused)
- [ ] MFA enabled on every dashboard account

## Review Records

### 2026-11-26 — Initial baseline

- Performed by: platform owner (self-review at ISMS setup)
- GitHub: single owner account `ydar996`, MFA via GitHub account settings
- Render/Netlify/Stripe/Supabase/Bluehost: owner-only access assumed;
  verify MFA on each at next review
- Platform admin: single `super_admin` seeded account; password rotation
  recommended at first login
- Org admins: per-Cooperative self-managed; org admins can reset member
  passwords but cannot escalate roles
- Action items: designate second trusted operator (R15); confirm MFA on
  all five dashboards; rotate `ASSURANCE_ADMIN_PASSWORD` if still default
