# Data Inventory (Records Of Processing)

**Last Updated:** 2026-11-26

What personal data the Platform holds, where it lives, and why. Required
for NDPR/GDPR accountability and for scoping breach impact.

## Data Categories

| Data | Examples | Where Stored | Purpose | Retention |
|---|---|---|---|---|
| Platform accounts | email, username, password hash (scrypt), role, MFA secret | `data/registry.db` (platform), org `peerfinance.db` (`users` table) | Authentication, authorization | While account active + session logs |
| Sessions | session token (random), user id, org slug, IP not stored | `sessions`, `platform_sessions` in `data/registry.db` | Login state | 7 days absolute, 24h idle |
| Security events | event type, actor, IP, timestamp, org slug | `security_events` in `data/registry.db` | Audit, abuse detection | Indefinite (export quarterly) |
| Member profiles | name, member number, contact details, photos, emergency contact | Org `peerfinance.db` (`members`, `member_profiles`) + `data/organizations/<slug>/uploads` | Cooperative operations | While Cooperative active |
| Financial records | contributions, savings, loans, guarantors, transactions, distributions, expenses | Org `peerfinance.db` | Core ledger, statements, reports | While Cooperative active; per Cooperative policy |
| Bank imports | uploaded statements (xlsx/csv/pdf), parsed rows, narrations with payer names | Org `peerfinance.db` (`bank_imports`, `transactions`) + upload temp files (deleted after import) | Reconciliation, classification | Import rows retained; temp uploads deleted |
| Public page content | About/Bylaws text, images, published PDFs | Org `cooperative_settings` + `data/organizations/<slug>/public` | Public prospective-member pages | While published |
| FlexxForms submissions | membership/loan application payloads | Org `peerfinance.db` (`flexxforms_applications`) + FlexxForms Supabase (processor) | Application workflow | While Cooperative active |
| Messages | in-app messages + attachments (PDF/images/docx) | Org `peerfinance.db` (`coop_messages`, `coop_message_attachments`) + org uploads dir | Member/admin communication | While Cooperative active |
| Email logs | delivery audit rows (recipients, subjects, status) | Org `peerfinance.db` (`email_audit` tables) | Delivery tracking, dues reminders | Per email audit retention |
| Billing | Stripe customer/subscription ids, check payment records | `data/registry.db` platform tables + Stripe (processor) | Subscription billing | While subscribed + legal minimum |
| Error logs | error message, stack, request metadata (IP, user-agent) | `data/security/errors.jsonl` on host | Debugging, incident detection | Rotates at 5 MB (1 generation) |
| Logs | request/trace logs | Host stdout -> Render log drain | Operations | Provider retention |

## Data We Do NOT Hold

- Card numbers or bank credentials (Stripe hosted fields only)
- Member portal passwords in plaintext (scrypt hashes only)
- Government ID numbers beyond what a Cooperative chooses to record in
  member profiles or FlexxForms applications

## Cross-Border Note

Render/Netlify may process data in the US; Nigeria NDPR and any local law
apply to the Cooperative as controller. DPAs with subprocessors are tracked
in SUBPROCESSORS.md.
