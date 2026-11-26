# Change Management Policy

**Version:** 1.0 | **Effective:** 2026-11-26 | **Owner:** Platform Owner

## Rules

1. All changes to application code, configuration, schema, or
   security-relevant settings go through version control (git).
2. `main` is protected: changes merge via pull request with the required
   `npm audit` check passing. Force-pushes and branch deletion are blocked;
   admins are not exempt.
3. Every change updates `AGENT_HANDOVER.md` changelog and affected living
   docs in the same commit (per repo documentation rules).
4. Database migrations must be backward-compatible or paired with a
   restore/rollback note. Org DBs are per-tenant SQLite files; schema
   changes ship via `CREATE TABLE IF NOT EXISTS` / guarded `ALTER`.
5. Security-sensitive changes (auth, sessions, permissions, crypto,
   public pages) get a self-review checklist: injection, authz scope,
   logging, and secret handling.
6. Dependency changes: prefer versions published at least 7 days ago;
   Dependabot proposes updates weekly; `npm audit --omit=dev
   --audit-level=high` must pass.
7. Emergency fixes may merge with expedited review but must still pass CI
  and be documented in the changelog immediately after.

## Deployment

- Backend: Render auto-deploys `main`. Verify `/api/health` reports the
  expected commit after deploy.
- Frontend: Netlify auto-deploys `main`.
- Rollback: Render keeps previous deploys; Netlify supports instant
  rollback to prior publish. Prefer rollback over hotfixing forward when
  the change is risky.
