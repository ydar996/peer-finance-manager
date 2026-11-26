# Security And Compliance Roadmap

**Peer Finance Manager: plan to reach recognized security standards (SOC 2, ISO 27001)**

Prepared 2026-11-25. No timelines included by request.

---

## 1. What These Certifications Actually Mean (Plain English)

### SOC 2

SOC 2 is **not a certificate you hang on a wall**. It is an independent audit report written by a licensed CPA firm. The auditors examine whether your company follows the AICPA "Trust Services Criteria":

- **Security** (mandatory): is the system protected against unauthorized access?
- **Availability**: does it stay up and recover from failures?
- **Confidentiality**: is sensitive data restricted to the right people?
- **Processing Integrity**: does it do what it claims, correctly?
- **Privacy**: is personal data handled as promised?

Two versions:

- **Type I**: auditors check that your controls are *designed* correctly, at one point in time.
- **Type II**: auditors check that the controls actually *worked continuously* over an observation window (usually several months). This is what enterprise customers ask for.

In simple terms: Type I is "show me your locks." Type II is "prove the locks were checked every day for months."

### ISO 27001

ISO 27001 **is a real certificate**, issued by an accredited certification body. It certifies that you run an **Information Security Management System (ISMS)**: a living, documented security program with:

- A risk register (a list of what could go wrong, how bad, and what you do about it)
- Written security policies covering people, process, and technology
- Controls chosen from the ISO "Annex A" catalog, with a Statement of Applicability explaining which ones you use and why
- Internal audits, management reviews, and a corrective-action loop

In simple terms: ISO 27001 does not ask "is your app secure?" It asks "do you run security as a disciplined, repeatable business process?" The certificate is renewed through annual surveillance audits.

### The Other Names You Will Hear

| Name | What it is | Do you need it? |
|---|---|---|
| **PCI DSS** | Card payment security rules | Yes, but Stripe hosted checkout already puts you in the lightest scope (SAQ A). You mostly attest annually. |
| **GDPR / NDPR** | EU and Nigerian privacy *laws*, not certificates | Compliance is mandatory if you hold EU/NG personal data. Requires privacy policy, deletion rights, breach process. |
| **Penetration test** | Paid ethical hackers attacking the app | Not a certificate, but SOC 2 and ISO auditors expect a recent report plus evidence you fixed findings. |
| **CSA CAIQ / SIG** | Security questionnaires customers send | Not a certification; SOC 2/ISO answers most of it. |
| **HIPAA / FedRAMP** | US healthcare / US government regimes | Only needed if you serve those sectors. |

### The One Sentence Summary

SOC 2 proves to customers that an auditor watched you operate securely. ISO 27001 proves you run security as an ongoing management system. Most SaaS companies do SOC 2 first because it is what sales deals demand; ISO 27001 matters more for international buyers.

---

## 2. What Is Already Done

The codebase already implements a solid technical baseline. Auditors will ask for these, and you can answer yes today:

- Passwords hashed with scrypt, constant-time comparison, dummy-hash timing defense
- TOTP-based MFA for users, with admin reset path
- Login and sensitive-endpoint rate limiting
- Full security headers: HSTS, Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy
- HttpOnly, SameSite=Lax, Secure session cookies
- Per-organization database isolation with org-scoped middleware on every request
- Parameterized queries throughout (better-sqlite3 prepared statements)
- Encrypted database backups (scrypt-derived key, authenticated encryption)
- HTML escaping and restricted-link stripping on public pages
- Stripe hosted checkout: card data never touches the server
- Dependabot plus a CI workflow running npm audit on every change
- File-type restrictions on uploads, path-safe storage under the org data dir
- One-time, expiring FlexxForms magic links; single-display temporary passwords

---

## 3. Plan Of Action

Ordered so that cheap, high-impact work comes first and certification work builds on it.

### Phase A: Close The Technical Gaps

These are the items a pentester or auditor will flag first.

1. **Security event logging.** Today there is no central record of security-relevant actions. Add an append-only `security_events` table (or external log sink) recording: logins (success/failure), MFA enrollment/disable/reset, password changes, admin actions (role changes, data restores, deletes), public-page publishes, and provisioning calls. Include actor, IP, timestamp, and org slug.
2. **Error monitoring and alerting.** No Sentry/Datadog-style tool is wired in. Add one (Sentry is the simplest for Node) so crashes and auth anomalies page you, and so you have uptime/error evidence for audits.
3. **External uptime monitoring.** Point an independent monitor (UptimeRobot, Better Stack, or StatusCake) at `/api/health`. Auditors want availability evidence; an outage history page doubles as proof.
4. **Admin action audit trail in the UI.** Beyond logging, give each org an "Activity Log" view of sensitive actions. SOC 2 reviewers love demonstrable accountability.
5. **Session idle timeout.** Verify sessions expire after inactivity (not just absolute age) and document the value. If absent, add a sliding idle window for admin sessions.
6. **Secrets inventory and rotation procedure.** List every secret in Render/Netlify env vars (session secret, Stripe keys, provisioning secret, SMTP, backup passphrase). Write down rotation steps and actually rotate once now. Store secrets in the platform secret manager, never in the repo.
7. **Backup restore drill.** You have encrypted backups; prove they work. Perform a documented restore test to a scratch environment and record the outcome. Repeat periodically.
8. **Vulnerability disclosure.** Add `/.well-known/security.txt` and a SECURITY.md in the repo with a reporting contact and expected response commitment.
9. **Data deletion path.** Confirm you can fully delete an org's data on request (org data dir + registry row + backups handling). Write the procedure; regulators and SOC 2 both ask.
10. **Branch protection on `main`.** Require pull request review and passing CI before merge. Auditors check change management; protected branches are the mechanical proof.
11. **File upload hardening review.** Confirm uploads are size-limited, served non-executable, and filenames are normalized. Add `Content-Disposition` enforcement if not present.
12. **DDoS/WAF posture.** Render provides baseline protection; consider Cloudflare in front of the domain for WAF rules and rate ceilings at the edge.

### Phase B: Privacy And Legal Obligations (Mandatory Regardless Of Certificates)

1. **Privacy policy and terms** published on the public site, covering what data is collected, why, retention, and contact.
2. **Data Processing Agreements** with every subprocessor: Render, Netlify, Stripe, FlexxForms, the email provider, and any monitoring tool added in Phase A. Maintain a public subprocessor list.
3. **Breach notification runbook**: who gets notified, how fast, what template. GDPR requires 72 hours to authorities; document your path.
4. **Data inventory (records of processing).** A short document listing what personal data lives where (member names, emails, bank narrations, session cookies). NDPR/GDPR require it.
5. **Retention policy.** Decide how long org data, logs, and backups are kept. Write it down and enforce it.

### Phase C: The Organizational Program (What Auditors Actually Grade)

This is where most small teams underestimate the work. SOC 2 and ISO 27001 are mostly about *process evidence*.

1. **Appoint a security owner.** One named person accountable for the security program (probably you, formally titled).
2. **Write the core policy set.** Keep each to 1-3 pages: Information Security Policy, Access Control Policy, Acceptable Use, Incident Response Plan, Change Management Policy, Vendor Management Policy, Business Continuity/Disaster Recovery Plan, Data Classification and Handling.
3. **Risk register.** A living spreadsheet: asset, threat, likelihood, impact, existing control, residual risk, owner, review date. ISO 27001 requires it explicitly; SOC 2 auditors expect it.
4. **Onboarding/offboarding checklist.** How access is granted and revoked, including your own admin accounts, GitHub, Render, Netlify, Stripe, FlexxForms.
5. **Access reviews.** On a set cadence, export who has access to production and repos, confirm each is still needed, and keep the record.
6. **Security awareness.** Even a one-person team should document an annual self-review of secure coding and phishing awareness. If staff or contractors join later, this becomes real training.
7. **Incident response drill.** Tabletop exercise: "member data leaked via backup file." Walk through detection, containment, notification, postmortem. Write the minutes.
8. **Vendor reviews.** Record that you reviewed Render/Netlify/Stripe security posture (their own SOC 2 reports) annually.
9. **Business continuity.** Document RPO (how much data you can lose) and RTO (how fast you must be back), matching your actual backup schedule.

### Phase D: Independent Validation And Certification

1. **Gap assessment / readiness review.** Either hire a SOC 2 readiness consultant or run a self-assessment against the Trust Services Criteria. Fix everything it flags before paying for the audit.
2. **Independent penetration test.** Commission a reputable firm to test the app and API. Remediate findings and keep the report and fix evidence; this single artifact satisfies requirements in both SOC 2 and ISO 27001 and in customer security questionnaires.
3. **SOC 2 Type I.** Engage a CPA firm; they audit control design at a point in time. Produces a report you can share under NDA with customers.
4. **SOC 2 Type II.** The auditor watches the controls operate over an observation window. Requires Phases A-C to be genuinely running, because the auditor samples the period: they will ask for the access reviews, the log exports, the incident records, the change approvals that occurred *during* the window.
5. **ISO 27001 Stage 1 + Stage 2.** Stage 1 reviews your ISMS documentation (policies, risk register, Statement of Applicability). Stage 2 verifies it operates. Annual surveillance audits follow. An ISMS built for SOC 2 covers most of ISO 27001; the extra work is the formal management-review and internal-audit machinery.
6. **Annual SAQ A for PCI.** A short self-assessment questionnaire each year since Stripe handles all card data.

---

## 4. Recommended Order

1. Phase A items 1-3 (logging, monitoring, alerting) and 6-7 (secrets rotation, restore drill): small effort, immediate risk reduction.
2. Phase B (privacy obligations): legally required anyway for Nigerian and any international members.
3. Phase C (policies, risk register, reviews): start now because Type II needs an operating history; controls cannot be backdated.
4. Phase D: readiness review, then pentest, then SOC 2 Type I, then Type II, then ISO 27001.

## 5. What This Report Deliberately Does Not Cover

- No timelines, per request.
- Costs are not quoted; auditor and pentest fees vary widely by firm and scope. Expect pentest and Type II audit fees to be the largest line items.
- Certifications do not make the app secure by themselves; they prove the security you already practice. The technical hardening in Phase A is the real work.
