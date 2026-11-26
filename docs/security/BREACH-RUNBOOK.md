# Breach Notification Runbook

**Last Updated:** 2026-11-26

Specific steps for when personal data is confirmed or suspected exposed.
Companion to INCIDENT-RESPONSE-PLAN.md.

## Notification Matrix

| Situation | Who to Notify | Timing |
|---|---|---|
| Confirmed breach of member/personal data | Affected Cooperatives first; their members via the Cooperative; NDPR authority if Nigerian data affected at scale; GDPR supervisory authority within 72h if EU data affected | Without undue delay once scope known |
| Suspected breach under investigation | Internal incident log only; notify if confirmed | n/a |
| Credential compromise (no data exposure yet) | Affected users: forced password reset + notice | Immediately |
| Vendor breach affecting us | The vendor notifies us; we then follow the matrix above | Per vendor notice |

## What The Notice Must Say

- What happened and when
- What data was involved (use DATA-INVENTORY.md categories)
- What we have done and are doing
- What the recipient should do (change passwords, watch for phishing,
  contact their Cooperative)
- Contact point for questions

## Evidence To Preserve

- `security_events` rows for the window
- `errors.jsonl` entries
- Render/Netlify access logs (request provider export if needed)
- Screenshots/copies of the vulnerability or exposure
- Timeline of containment actions

## After Notification

- File the incident record in docs/security/incidents/
- Update the risk register if a new threat emerged
- Review whether the privacy policy or subprocessor list needs updating
