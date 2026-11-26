# Tabletop Exercise Minutes — 2026-11-26

**Scenario:** "An attacker obtains a Cooperative admin's credentials
(phished password) and exports member data through the admin API over a
weekend."

**Participants:** Platform owner (sole operator at current scale)
**Method:** Walkthrough against live system documentation and controls.

## Timeline Walkthrough

1. **Detection (T+days):** Weekly `security_events` review would surface
   `auth.login` entries from an unusual IP and repeated
   `admin.data-backup`/export activity. Currently detection depends on the
   weekly manual review — noted as a gap; compensating control is the
   24h idle + 7-day session limits and per-request logging.
2. **Containment:** Delete the attacker's sessions in `sessions` table;
   force password reset for the compromised admin; rotate
   `SESSION_SECRET` if session theft suspected.
3. **Impact assessment:** Export endpoints are org-scoped — exposure
   limited to that one Cooperative's data. Cross-org data unreachable via
   app credentials.
4. **Eradication:** Force `must_change_password`, review admin's recent
   `security_events`, check for new admin users created by attacker.
5. **Notification:** Per BREACH-RUNBOOK.md — notify affected Cooperative
   first, then members via the Cooperative; NDPR notification if Nigerian
   member data confirmed exposed.

## Findings And Corrective Actions

| Finding | Action | Status |
|---|---|---|
| Detection relies on weekly manual review; no automated alert on bulk exports | Add rate limit / security_event alert on `admin.data-backup` frequency; consider anomaly flag for >N exports/day | Open — candidate for next sprint |
| No forced MFA for org admins | MFA supported; recommend enabling for finance-handling admins; consider admin-role MFA requirement in a future release | Open |
| Single operator = no second reviewer for SEV1 | Designate trusted second operator (ACCESS-REVIEWS.md action item) | Open |

## What Worked

- Org isolation contains blast radius to one Cooperative.
- Append-only `security_events` gives a complete actor/IP trail.
- Session revocation is a single SQL delete — fast containment.
- Encrypted backups mean even full DB theft yields nothing without
  passphrases.
