# Risk Register

**Last Updated:** 2026-11-26 | **Review cadence:** quarterly

Scale: Likelihood/Impact 1-5. Residual = after existing controls.

| ID | Risk | L | I | Existing Controls | Residual | Owner | Review |
|---|---|---|---|---|---|---|---|
| R1 | Credential stuffing / brute force on logins | 3 | 4 | Rate limiting, scrypt, MFA support, login_failed logging | 2x4 | Platform owner | Quarterly |
| R2 | Session hijack via XSS/token theft | 2 | 4 | HttpOnly+SameSite+Secure cookies, tight CSP, no tokens in JS | 1x4 | Platform owner | Quarterly |
| R3 | Org data leak via missing org-scope check | 2 | 5 | Org-context middleware, per-org DBs, member-self scoping | 1x5 | Platform owner | Quarterly |
| R4 | Malicious file upload (stored XSS/malware) | 2 | 3 | Ext/mime validation per route, size limits, PDF-forced content-type, image ext allowlist | 1x3 | Platform owner | Quarterly |
| R5 | SQL injection | 1 | 5 | better-sqlite3 prepared statements throughout | 1x5 | Platform owner | Quarterly |
| R6 | Supply-chain compromise (npm dep) | 2 | 4 | npm audit CI gate, Dependabot, 7-day version preference | 2x4 | Platform owner | Weekly (CI) |
| R7 | Secret leak via repo/env | 1 | 5 | No secrets in repo, env-only config, SECRETS-INVENTORY | 1x5 | Platform owner | Quarterly |
| R8 | Insider/platform-admin misuse | 1 | 5 | Role separation, security_events audit, access reviews | 1x5 | Platform owner | Quarterly |
| R9 | Provider outage (Render/Netlify) | 3 | 3 | Multi-provider split, BCP plan, status comms | 3x3 | Platform owner | Quarterly |
| R10 | Backup loss/corruption | 2 | 4 | Encrypted admin backups, quarterly restore drill, integrity checks | 1x4 | Platform owner | Quarterly |
| R11 | FlexxForms/Supabase breach exposing applications | 2 | 3 | Separate product boundary, API keys scoped, magic-link expiry | 2x3 | Platform owner | Quarterly |
| R12 | Privacy law breach (NDPR/GDPR) via mishandling | 2 | 4 | Privacy policy, data inventory, breach runbook, deletion path | 2x4 | Platform owner | Quarterly |
| R13 | DDoS / scraping | 2 | 2 | Rate limiting, edge protections; Cloudflare optional | 2x2 | Platform owner | Quarterly |
| R14 | Email compromise (SMTP creds) | 1 | 3 | Env-only creds, rotation procedure | 1x3 | Platform owner | Quarterly |
| R15 | Single-person bus factor (owner unavailable) | 3 | 4 | Docs, password manager, dashboard access documented | 3x4 | Platform owner | Quarterly |

## Review Notes

- 2026-11-26: initial register created alongside ISMS documentation.
  R15 is the largest residual: designate a second trusted operator with
  dashboard access to reduce it.
