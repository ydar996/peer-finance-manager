# Data Classification And Handling Policy

**Version:** 1.0 | **Effective:** 2026-11-26 | **Owner:** Platform Owner

## Classification Levels

| Level | Definition | Examples | Handling |
|---|---|---|---|
| **Restricted** | Harm if disclosed | Member financial records, password hashes, MFA secrets, session tokens, bank statements, backup passphrases, production env secrets | Encryption at rest where feasible (backups encrypted), TLS in transit, no copying to personal devices, access on need-to-know, never in logs or chat |
| **Confidential** | Harm if disclosed to wrong party | Member names/contact details, loan terms, meeting minutes, internal docs | Org-scoped access only, TLS, no public exposure |
| **Internal** | Harm limited | Aggregated reports, feature docs, this security documentation | Repo access limited to collaborators |
| **Public** | Intended for anyone | Marketing pages, published About/Bylaws, privacy/terms | No restriction beyond accuracy |

## Handling Rules

- Restricted data never appears in `security_events.detail`, error logs, or
  client-side storage beyond what the feature requires.
- Exports (PDFs, spreadsheets, backups) are treated as Restricted: download
  over TLS, store encrypted if kept, delete when done.
- Test/development uses synthetic data or the Canary org; real member data
  is never used for demos.
- Screenshots shared externally must blur member names/amounts.
