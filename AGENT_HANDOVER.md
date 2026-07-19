# Agent Handover — Peer Finance Manager (AssurCoop)

This document gives the next developer or AI agent enough context to continue work without re-discovering the project from scratch.

**Last updated:** July 19, 2026 (membership alerts + bylaws OCR/admin disclosure deploy)  
**Organization:** Assurance Investment and Cooperative Inc. (slug: `assurance`)  
**Workspace:** `C:\Users\yinka\Documents\AssurCoop`  
**Production:** https://peer-finance-manager.netlify.app (UI) + https://peer-finance-manager.onrender.com (API)  
**GitHub:** `ydar996/peer-finance-manager`

---

## 0. IMMUTABLE AGENT INSTRUCTIONS (always follow)

> **Self-instructing rule for every agent, now and forever:**  
> **Read this section first. Document every change immediately in the same turn. The user must never have to ask you to update documentation.**

**Every change we make — and every outstanding task we discover, start, complete, or reprioritize — MUST be documented immediately and continuously for the next agent. Not at the end of a session. Not "when the user asks." Not only on commit.**

Documentation is the handoff contract between sessions. If it is stale, the next agent will guess or re-read chat transcripts and waste the user's time.

**Cursor enforces this via:** `.cursor/rules/continuous-documentation.mdc` (`alwaysApply: true`) — agents must follow it on every task without being reminded.

### Continuous documentation rule (non-negotiable)

1. **Read this file first** at the start of every session — before relying on chat history or agent transcripts. **Before any bank-ledger or reconcile advice**, read **§1A Assurance bank ledger** (golden state, corruption history, do-not-regress list) and **§1B Bank ledger product mode** (all-tenant append contract).
2. **Document as you go** — in the same session, **in the same turn** when the change lands (before your reply to the user):
   - **§ Changelog** — append a dated bullet the moment you implement a feature, fix, or behavior change.
   - **§ Outstanding tasks** — add, update, mark ✅, or remove tasks the moment their status changes.
   - **Other docs** — update per the checklist below whenever those areas are affected.
3. **Never wait for the user** to say "update the docs," "sync documentation," or "update the handover." That request should never be needed.
4. **Before ending any session** that touched code or config: verify changelog and outstanding tasks match the final state (including uncommitted local changes).
5. **If the user commits without you:** on the next session, reconcile `git log` against this file and backfill any gaps immediately.

**Failure to keep docs current is a session failure — treat it like leaving broken code.**

### Per-change checklist (do this every time)

| Step | Action | When |
|------|--------|------|
| 1 | Read `AGENT_HANDOVER.md` §0 + changelog + tasks | Start of every session |
| 2 | Implement code/config change | During work |
| 3 | Update `AGENT_HANDOVER.md` changelog + tasks | **Same turn** as step 2 |
| 4 | Update other docs from table below | **Same turn** if affected |
| 5 | Verify docs match final repo state | Before session ends |

### Required documentation updates (checklist)

| When you change… | Update these files (immediately) |
|------------------|----------------------------------|
| Any feature, bug fix, or behavior | **AGENT_HANDOVER.md** — § Changelog + § Outstanding tasks |
| User-visible screens, login, or workflows | **USER-GUIDE.md** |
| Deploy, cloud, Git push, or data upload | **UPDATE-AND-PUBLISH.md** and/or **DEPLOY-TODAY.md** |
| Architecture, ports, stack, folder layout | **README.md** — Architecture + Project layout |
| UI labels/buttons (Title Case rules) | `.cursor/rules/ui-copy-standards.mdc` and **UI-COPY-STANDARDS.md** if conventions change |
| Data backup / restore on production | **USER-GUIDE.md** §24, **UPLOAD-DATA-TO-PRODUCTION.md** |
| Port numbers | **Ports in Use by Applications.md** (project copy + Desktop master) |

### Changelog rule

Append a dated bullet under **§ Changelog** in this file **as soon as the change is made**:

```
- **YYYY-MM-DD** — What changed, why, and any production/deploy notes.
```

### Outstanding tasks rule

- **Add** new tasks the moment they are discovered — do not wait.
- **Mark completed** items ✅ or remove them the moment they are done.
- **Reprioritize** when scope or urgency changes.
- Keep **High / Medium / Low** sections current; fix duplicate numbering when editing.

### Production safety rules

1. **Never commit** `data/`, `*.db`, credentials CSV, or `.env` — they are gitignored.
2. **Never set** `PFM_COOP_ROOT` on Render — breaks module loading (use `PFM_DATA_DIR` only).
3. **Code deploy** = `git push` → Netlify + Render auto-deploy. **Data deploy** = **Admin → Maintenance** (backup/restore) or **Admin → Import** (ledger). Never instruct Coop admins to use SFTP or file-copy tools.
4. **Do not git commit** unless the user explicitly asks.
5. After cloud-affecting changes, note whether user must **re-upload data** or only **git push**.
6. **No em dashes** in user-facing app copy — use colons (`:`). See `.cursor/rules/ui-copy-standards.mdc`.

### FlexxForms messages to partner (mandatory)

When the user asks for a message to send **FlexxForms engineers** (or any FlexxForms follow-up you draft for them):

1. Put the **entire** copy-paste message in **exactly one** fenced code block (plain ` ``` `). No splitting across multiple blocks or mixing prose with the message body.
2. The user must be able to **one-click copy** the full text and paste into email/Slack.
3. Frame issues as **platform / multi-tenant** requirements for **all** Cooperatives PFM provisions, not only Assurance. Each org has its own `membership_form_id`, `loan_form_id`, and document ids in the registry DB; many are not fully configured yet.
4. Keep the canonical template in **§ FlexxForms integration** below current; customize incident details only inside the single code block you give the user.
5. **Wait for user retest after deploy** before drafting an escalation. Sequence: deploy → user hard-refreshes and tries again → diagnose (UI, admin applications list, webhook if needed) → then write the note with concrete facts. Do not pre-write partner notes before the user has retested.

### Document map (keep all current)

| Document | Audience | Purpose |
|----------|----------|---------|
| [USER-GUIDE.md](./USER-GUIDE.md) | All users (members, staff, admins) | Complete simple-language guide: every tab, workflow, glossary |
| [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) | Yinka | How to change code and publish safely |
| [UPLOAD-DATA-TO-PRODUCTION.md](./UPLOAD-DATA-TO-PRODUCTION.md) | Coop admins | Browser-only data ops: **Admin → Maintenance** / Import |
| [SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md](./SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md) | Owners / lay admins | Plain-language scale and architecture review |
| [UI-COPY-STANDARDS.md](./UI-COPY-STANDARDS.md) | Agents/devs | No em dashes, Title Case, wording rules |
| [.cursor/rules/continuous-documentation.mdc](./.cursor/rules/continuous-documentation.mdc) | Agents (auto) | **Always applied** — doc updates same turn as every change |
| [DEPLOY-TODAY.md](./DEPLOY-TODAY.md) | Yinka | First-time cloud setup (already done) |
| [README.md](./README.md) | Developers | Technical overview |
| **AGENT_HANDOVER.md** | Agents | Background, architecture, tasks, changelog |

---

## Changelog

- **2026-07-19** — **Membership alerts + bylaws cleanup deploy:** Shipping admin membership-application nag/Messages notice, Assurance bylaws OCR/article/certificate seed v13, Public Pages Bylaws admin disclosure fix. No data upload; Render reseed applies Assurance bylaws on API restart.
- **2026-07-18** — **Public Pages admin Bylaws disclosure:** Closed missing `</div></details>` around **Bylaws Page** in `index.html` so the section expands and shows Bylaws Text / PDF upload like About Us. **Production:** `git push` (this deploy).
- **2026-07-18** — **Assurance Bylaws page cleanup:** Fixed OCR mid-word splits (`s hall` → shall, etc.), proper Article headers (`Article N` badge + title) with body text styling, Articles 14–18 as separate sections, Certificate filled with **December 9, 2022** and **Assurance Cooperative Executive Committee**. Seed version **13** (auto-applies on API restart). Files: `ocr-text-repair.js`, `public-plain-text-html.js`, `seed/assurance/public/bylaws.html`, `cooperative-public.css`, `cooperative-public-pages-service.js`. Test: `npm run test:ocr-text-repair`. **Production:** `git push` (this deploy; Render reseed).
- **2026-07-18** — **Admin membership application alerts (all tenants):** On new FlexxForms membership submit, PFM posts an unread **System Notice** to admin **Messages** (optional email tip) and shows a flashing **Forms & Documents** tab badge + banner nag until no open applications remain. API `GET /api/flexxforms/applications/summary`. Files: `messaging-service.js`, `flexxforms-service.js`, `flexxforms-membership-service.js`, `flexxforms-routes.js`, `app.js`, `index.html`, `styles.css`, `USER-GUIDE.md`. Test: `npm run test:messaging`. **Production:** `git push` (this deploy).
- **2026-07-18** — **Admin UX polish deploy:** Production `b2dd327`. Membership Status collapsed; full members list; bank **Approve as Is**. No data upload.
- **2026-07-18** — **Admin UX polish (all tenants):** (1) Member detail **Membership Status** collapsed by default (expand to edit). (2) **Members & Profiles** list no longer uses an inner max-height scroll pane: full list on the page. (3) Bank append preview: **Approve as Is** per Review row and **Approve Suggested Rows** when Type/Member already look correct (no toggle dance). Files: `app.js`, `styles.css`, `USER-GUIDE.md`. **Production:** `b2dd327`.
- **2026-07-17** — **Messages HTML render fix deploy:** Production `e9c0678`. Existing minutes threads re-render without resend. Attachments above body. No data upload.
- **2026-07-17** — **Messages HTML render fix (all tenants):** Member/admin thread view showed raw tags when HTML bodies were stored under default `body_format=markdown`. `formatMessageBody` / `normalizeBodyFormat` now detect HTML content and sanitize as rich HTML. Attachments render **above** the message body. Files: `messaging-service.js`, `app.js`, `styles.css`, `test-messaging.js`. **Production:** `e9c0678`.
- **2026-07-17** — **Messages rich Word-paste + modern UI deploy:** Production `409dbb3`. Netlify UI + Render API. Hard-refresh Messages after deploy. No data upload.
- **2026-07-17** — **Messages UI modernized (all tenants):** Redesigned Admin/Member Messages: segmented Send To control, compact format toolbar (B/I/lists) inside a unified rich shell, dashed attachment drop zone, elevated surfaces, chat-style bubbles (self-aligned), unread left accent on inbox rows. Files: `index.html`, `styles.css`, `app.js`. **Production:** `409dbb3`.
- **2026-07-17** — **Messages rich Word-paste composer (all tenants):** Admin Messages uses contenteditable rich editor: paste from Word keeps headings/bold/lists; toolbar for Bold/Italic/Bullets/Heading; server sanitizes HTML (`html-sanitize-lite.js`, `body_format=html`). Attachments (PDF/image/Word) unchanged. Markdown still supported for older/member plain posts. Files: `html-sanitize-lite.js`, `messaging-service.js`, `messaging-routes.js`, `app.js`, `index.html`, `styles.css`, `USER-GUIDE.md`. Test: `npm run test:messaging`. **Production:** `409dbb3`.
- **2026-07-17** — **Messages Markdown + attachments (all tenants):** Admin compose accepts Markdown; optional PDF/image/Word attachments. Stored per org under `uploads/messages/`. Superseded same day by rich Word-paste composer (still supports markdown bodies).
- **2026-07-17** — **Loan applications pipeline (all tenants):** Assign FlexxForms **Loan Form Id** → member **Apply for a Loan** embed. Webhook stores `kind=loan` with parsed answers; admin **Forms & Documents → Loan Applications** lists submissions; **Review & Approve Loan** (borrower + 2 guarantors) creates PFM loan; reject/delete for unapproved. Member claim on form completed. Files: `flexxforms-loan-service.js`, `flexxforms-service.js`, `flexxforms-routes.js`, `app.js`, `index.html`, `USER-GUIDE.md`. Test: `npm run test:loan-applications`. **Production:** `git push` (`721187c`).
- **2026-07-17** — **Assurance subscription grace +15 days (ops):** Platform `extend-grace` for slug `assurance`: `subscription_grace_until` → **2026-08-01** (full access through that date). Status remains `check_pending`. Note stored on org. No code deploy.
- **2026-07-17** — **Cooperative inbox messaging (all tenants):** Bidirectional portal messages per org DB (`coop_message_threads` / participants / messages). Admin **Messages** tab: send to all / selected / one member; inbox + reply. Member My Account **Messages** / **Unread Messages** button (above performance reports) opens dedicated inbox page (list → full thread → back); members can message Cooperative admin. Optional email tip when SMTP/relay configured. APIs under `/api/messages/*` and `/api/me/messages/*`. Files: `messaging-service.js`, `messaging-routes.js`, `server.js`, `app.js`, `index.html`, `styles.css`, `USER-GUIDE.md`. Test: `npm run test:messaging`. **Production:** `git push` (`167e2c7`; no data upload).
- **2026-07-17** — **Member portal Apply for a Loan (status):** Embed shell already exists on My Account when `loan_form_id` is set. Gap: most orgs (incl. Assurance) have no published/assigned loan form; webhook stores `kind=loan` but does not parse, validate eligibility, or create a reviewable loan application (unlike membership). Needed next: FlexxForms loan form + assign id; then PFM loan-application pipeline (admin review → create loan → guarantor/borrower docs). Outstanding task **4r**.
- **2026-07-17** — **Meeting reminder email layout:** Reminder (and announce) emails now match preferred copy: title, date/time, **Join Online**, **Agenda**, **Best regards** + org name, then **Sign In to the Member Portal**. File: `meeting-notification-service.js`. **Production:** `git push`.
- **2026-07-16** — **Approve member emails portal login (all tenants):** On **Approve Member**, PFM creates/resets portal credentials, emails a welcome login message when configured, and shows **Copy Welcome Message** / temp password for admin handoff. Files: `flexxforms-membership-service.js`, `auth-service.js`, `flexxforms-routes.js`, `app.js`, `index.html`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-16** — **Admin one-click member password reset + email (all tenants):** Users tab **Reset Password** (and member profile **Reset Portal Password**) creates a temp password, emails the member when configured, and shows **Copy Temporary Password** / **Copy Full Login Details**. API `POST /api/users/reset-member-password` (`sendEmail` default true). Script: `reset-member-password-production.js`. **Production:** `git push`.
- **2026-07-16** — **Single-member portal password reset API:** Admin API `POST /api/users/reset-member-password` (`memberId` or `memberName`). Deployed `2a1fe6c`.
- **2026-07-16** — **No membership restore (all tenants):** Former statuses cannot be set back to Active. Returning people must **Register New Member** (new number, new history). Old account stays historical. UI hides Active for former members; API rejects restore. Test: `npm run test:membership-status`. **Production:** `git push`.
- **2026-07-16** — **Former members blocked from active-member benefits (all tenants):** Resigned/Deceased/Expelled/Suspended cannot use portal APIs, emails, bulk/member statements, login provisioning/credentials, new loans/guarantor roles, contributions, distributions, or registration fees. Withdrawals + loan repayments still allowed for settlement; bank import matching kept for ledger history. `assertActiveDirectoryMember` + `requireActiveMemberAccount`. **Production:** `git push`.
- **2026-07-16** — **Dashboard Active Members/Profiles excludes former members:** Cooperative Books card counted all ledger members, so resigning Sonia left **23/24** unchanged. Now counts only active directory members/profiles and notes former count. Files: `cooperative-books.js`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-16** — **Fix membership status update “No organization database selected”:** `PATCH /api/members/:id/account-status` had `restoreOrgContext` before multer, so the upload cleared tenant context. Order is now upload → restore (same as bank append). **Production:** `git push`.
- **2026-07-16** — **Membership status document upload:** On **Membership Status**, admins can attach PDF/image of resignation or termination notice; download via **Download Document**. Stored per org under `uploads/membership-status/`. APIs: multipart on `PATCH /api/members/:id/account-status`, `GET .../account-status/document`. Test covers save/resolve. **Production:** `git push` (`48df822`).
- **2026-07-16** — **Membership status by type (all tenants):** Admins set **Active / Resigned / Deceased / Expelled / Suspended** on Members & Accounts (not a single vague inactive flag). Former members leave the default active list and **member emails**, keep ledger history, lose portal login until restored to Active. **Show Former Members** toggle. API: `PATCH /api/members/:id/account-status`. Profile edits no longer reset status to Active. Test: `npm run test:membership-status`. Files: `membership-status-service.js`, `member-profile-service.js`, `balance-service.js`, `report-notification-service.js`, `member-service.js`, `auth-service.js`, `server.js`, `app.js`, `index.html`, `styles.css`, `schema.sql`, `USER-GUIDE.md`. **Production:** `git push` (`48df822`).
- **2026-07-12** — **Splits: any N lines, all ledger types, no false Out of Sync, download notice:** Split supports 2+ lines mixing deposit/loan/expense/CD/investment/etc. Save blocked until amounts total the original (UI + API). Reconcile row-align treats any split-driven row-count increase as OK when cash balance still matches. Post-split prompt + alert require downloading Xlsx/Csv for local master sync. Test: `npm run test:ledger-split`. **Production:** `git push` (`971717e`).
- **2026-07-12** — **Reconcile after split/reclassify:** When bank cash balance at the verified as-of still matches but `bank_import` row count rose (one deposit expanded into split lines), realign the reconcile anchor instead of staying **Out of Sync**. Also refresh anchor after adjustment rebuild. Files: `bank-reconcile-service.js`, `ledger-adjustment-service.js`, `SAHEED-LOAN1-COOP-ADMIN-FIX.md`. **Production:** `git push` (`971717e`).
- **2026-07-11** — **Loan Payment Policy (flexible vs strict late fees, all tenants):** Coop admins toggle under **Loans → Loan Payment Policy**. Default **Flexible** (no late fee; current behavior). **Strict Timelines** charges a configurable flat late fee (default $25) when a repayment is after the installment due date. Policy is snapshotted per loan/disbursement at start so toggling never rewrites history. APIs: `GET/PATCH /api/cooperative/loan-policy`. Files: `loan-policy-service.js`, `loan-service.js`, `loan-ledger-service.js`, bank import hooks, UI. Test: `npm run test:loan-policy`. **Production:** `git push` (`971717e`).
- **2026-07-11** — **Layman SaaS scale review (MD):** Added [SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md](./SAAS-SCALABILITY-ARCHITECTURE-REVIEW.md) (plain language: current limits, what works, phased plan). Linked from README + handover document map. Complements canvas `saas-scalability-architecture-review`.
- **2026-07-11** — **Zero WinSCP (complete):** Removed every WinSCP/SFTP/break-glass data workflow. `UPLOAD-DATA-TO-PRODUCTION.md` rewritten as Coop-admin browser guide. `DEPLOY-TODAY.md` first-time seed = Register + **Maintenance → Restore**. Docs/UI/comments no longer instruct SFTP. Replacement path: **Admin → Import** / **Maintenance**. Task 4h ✅. (Nightly off-disk backups still 4i.)
- **2026-07-11** — **SaaS scale architecture review (no code):** Audited multi-tenant readiness for thousands of Cooperatives. Verdict: isolation model (registry + per-org SQLite) is sound; single Render starter + 1 GB disk + in-process Puppeteer + no off-disk backups cannot scale. Canvas report: `canvases/saas-scalability-architecture-review.canvas.tsx`. Outstanding tasks 4i–4n (Phase 1 plan; 4h completed same day).
- **2026-07-11** — **WinSCP retired for routine ops (all tenants):** New **Admin → Maintenance** tab: **Download Database Backup**, **Restore Database** (preview + confirm, closes live DB handle, no Manual Deploy), **Normalize Profiles** on production. APIs: `GET /api/admin/data-backup`, `GET /api/admin/data-status`, `POST /api/admin/data-restore/preview`, `POST /api/admin/data-restore`, `POST /api/admin/maintenance/normalize-profiles`. `profile-normalize-service.js`, `admin-data-service.js`, `admin-data-routes.js`; `normalize-profiles.js` uses shared service. Docs: `UPLOAD-DATA-TO-PRODUCTION.md`, `UPDATE-AND-PUBLISH.md`, `USER-GUIDE.md` §23, `README.md`, `DEPLOY-TODAY.md`, email setup guides. **Production:** `git push`.
- **2026-07-11** — **Stale reference file cannot corrupt DB (all tenants):** Reclassify rebuilds from live DB (`00667b8`). Server startup no longer runs `syncMissingBankLedgerRows` (was injecting phantom rows from stale Render CSV on boot). Startup and post-import only **export DB → CSV**. `sync-missing` refreshes CSV from DB before any compare. §1B documents reference-file rules. Files: `import-bank-ledger.js`, `server.js`, `AGENT_HANDOVER.md`. **Production:** `git push` (`0aae2db`).
- **2026-07-11** — **Member ledger reclassify/split (all tenants):** **Bank Ledger Rows** panel on Loan Account lists every adjustable row with **Category** + **Split** (same as Contributions Account). Loan rows without lots get controls too. **Loan Disbursement** added to reclassify dropdown. Split uses full bank amount. Files: `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-11** — **Schedule-based loan payoff + Coop Admin split only (all tenants):** Loan repayments apply to **principal + scheduled interest** when workbook matches disbursement. Paid loans book **full scheduled interest**. **Split/Reclassify** use full bank deposit; **Amount** column shows **$600** (not an internal slice). Nov 6 row stays one `loan_repayment` until **Coop Admin** saves **Split** in UI. **Loan Repayment Bank Deposits** panel; surplus label **Surplus Pending Split**. `getCoopRoot()` fix; `test-loan-schedule-payoff.js`. Do not use `fix-march-2026-reconciliation.js` for Yomi Nov split. Files: `loan-ledger-service.js`, `loan-details-reference.js`, `paths.js`, `app.js`, `SAHEED-LOAN1-COOP-ADMIN-FIX.md`. **Production:** `git push`.
- **2026-07-10** — **Apply page mobile landscape signing:** On `/c/{slug}/apply`, hide hero banner; compact topbar; in landscape on short screens hide sticky header/footer so FlexxForms signature pad gets full viewport. Files: `cooperative-public.html`, `cooperative-public.css`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-10** — **Complete USER-GUIDE rewrite:** Full user-friendly guide covering all portals, tabs, workflows, glossary, monthly checklist, reclassify/split, bank import, and troubleshooting. Multi-tenant language; Assurance as example only. Replaces partial guide. Files: `USER-GUIDE.md`.
- **2026-07-10** — **USER-GUIDE: reclassify/split save workflow:** Expanded § Reclassify or split bank transactions: no table Save button; reclassify saves via confirm on dropdown change; split saves via **Save Split** in modal; post-action download prompt. Files: `USER-GUIDE.md`.
- **2026-07-10** — **Production restored via standard UI workflow (no Assurance wrapper):** Corrupted cloud DB (**$16,113.55** / 465 rows) reset with **Full Ledger Refresh** from `data/master-ledger/cooperative-bank-ledger-master.xlsx` (453 rows, **$15,471.49** through 6/29), then **Import New Bank Activity** with `stmt (8).csv` (4 New rows, Saheed → Loan Repayment/Yomi Salami, ending **$16,241.55** through 7/8). Confirms master + append is the normal product path; Assurance-specific build/restore wrappers are optional ops shortcuts only. **Data fix on Render** (no git).
- **2026-07-09** — **Multi-tenant append docs + regression:** Clarified §1B tenant isolation (no slug/balance checks in product code). `test-bank-append-balance.js` uses generic unit amounts; live preview opt-in via `--org`/`--stmt` (not Assurance-default). USER-GUIDE leads with all-tenant cumulative upload workflow; Assurance moved to ops example only. Files: `bank-import-append.js`, `test-bank-append-balance.js`, `AGENT_HANDOVER.md`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Idempotent cumulative bank append (permanent):** Re-uploading a statement from **period start through today** is the normal workflow for interim July (and any month) balance updates. Append blocks only when ledger is **below** statement beginning (missing history), not when ledger is **above** beginning because prior rows are already imported. Duplicates fingerprint to **Skipped**; only **New** rows apply. Ending block applies only when **ready** rows would not tie to statement ending. UI shows green pre-period gap note instead of red block. Regression expanded: `computeAppendBalanceCheck` unit cases + live preview. Files: `bank-import-append.js`, `app.js`, `index.html`, `test-bank-append-balance.js`, `AGENT_HANDOVER.md` §1B, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Member gender dropdown + profile save fix:** Register New Member and Update Member Profile use **Gender** dropdown (Male, Female, Decline to Specify). Fixed spurious **email already exists** on gender-only saves: portal email sync skipped when email unchanged; no duplicate check when login email already matches (admin/member email collision). Files: `auth-service.js`, `member-service.js`, `text-format.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Assurance production balance restored again ($16,241.55):** Dashboard showed **$16,113.55** / **465 rows** (drift after corrupted append). Re-ran `restore-assurance-ledger-production.js`; production verified **457 rows**, **$16,241.55** through **2026-07-08**. **Do not** re-upload July `stmt (8).csv`. Data fix via script (no git).
- **2026-07-09** — **Login hardening (follow-up):** Login forms use `method="post"` to block credential leakage in URL if JS fails. `bootApplication()` shows the correct portal screen immediately and catches startup errors. **Production:** `git push`.
- **2026-07-09** — **Login broken by app.js syntax error (hotfix):** Bad edit removed `function bankAppendTypeSelectHtml` header, causing `SyntaxError` on load. Entire UI JavaScript failed: wrong login screen on `/admin`, forms submitted as GET with credentials in URL, sign-in appeared dead. Fixed syntax + `initLoginFromUrlParams()` strips password from URL and prefills org/username. API login was unaffected. **Production:** `git push` immediately.
- **2026-07-09** — **Bank ledger product mode (all tenants):** §1B documents fail-closed append contract, source-of-truth model, and agent rules. **Payment name mappings** admin table adds **Default Type** column (tenant self-service; persisted in `default_ledger_type`). **CSV auto-sync** runs on cloud (`PFM_DATA_DIR`) only; local dev off unless `PFM_LEDGER_CSV_SYNC=1` (prevents stale DB overwriting reference CSV). **Apply button** disabled when opening/ending blocked or Review rows remain. Regression: `npm run test:bank-append`. Files: `member-payment-alias-service.js`, `cooperative-bank-ledger-csv.js`, `app.js`, `index.html`, `test-bank-append-balance.js`, `package.json`, `AGENT_HANDOVER.md`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Append safety: block ending mismatch + Saheed loan alias:** Import New Bank Activity now **refuses to apply** when projected ledger ≠ statement **ending** (server `bank-import-append.js` + UI `app.js`), not only when opening drifts. Payment alias **SAHEED SALAMI → Yomi Salami** seeds `default_ledger_type: loan_repayment` so July-style payments classify correctly on future appends (`member-payment-alias-service.js`, `import-format-service.js`). **Production:** `git push`; balance already **$16,241.55** from restore script.
- **2026-07-09** — **Assurance ledger restored to stmt ending ($16,241.55):** Production was **$16,177.55** (drift from bad append/sync). Re-ran golden master + July `stmt (8).csv` → **457 rows**, **$16,241.55** through **2026-07-08**. `build-assurance-reference-with-july.js` now parses stmt file + Saheed override; `restore-assurance-ledger-production.js` is one command (build + Full Ledger Refresh + ending check). Local DB synced. **Production:** data restore via script (no git required for balance); script/doc changes need `git push`.
- **2026-07-09** — **Repo sync:** Committed and pushed remaining local work (ledger audit/reconcile scripts, `build-assurance-reference-with-july.js`, assurance restore wrapper, bylaws seed) so `main` matches workspace. **Production:** `git push` (`bdcc85f` + follow-up).
- **2026-07-09** — **Pending applicants hidden + ledger reclassify/split (all tenants):** Members & Accounts lists only **active** members (`pending_approval` profiles stay under Forms & Documents → Membership Applications). Admin **Category** dropdown + **Split** on Contributions and Loan Repayment rows; adjustments persist in `ledger_adjustments` / `ledger_adjustment_lines` and re-apply on every Full Ledger Refresh. APIs: `POST /api/ledger-adjustments/reclassify`, `POST /api/ledger-adjustments/split`. Removed production test applicant **Testy Testy** via `remove-pending-applicant-production.js`. Files: `ledger-adjustment-service.js`, `import-bank-ledger.js`, `member-profile-service.js`, `balance-service.js`, `server.js`, `app.js`, `index.html`, `styles.css`, `schema.sql`, `database.js`, `USER-GUIDE.md`. **Production:** `git push` (code); Testy already deleted on live DB via API script.
- **2026-07-09** — **Saheed July classification preserved on restore:** `restore-assurance-ledger-production.js` no longer appends `stmt (8).csv` (that re-classified Saheed $500 as Member Deposit). New `build-assurance-reference-with-july.js` writes `cooperative-bank-ledger-reference.xlsx` with July rows and Saheed as **Loan Repayment**. Full Ledger Refresh uses that file only. Files: `build-assurance-reference-with-july.js`, `restore-assurance-ledger-production.js`, `USER-GUIDE.md`. **Production:** run build + restore scripts (data); `git push` for script changes.
- **2026-07-09** — **Multi-tenant ledger ops:** Removed Assurance-only balance warnings from `app.js` (no hardcoded 15,471.49 / 453 rows). Generic production restore: `scripts/restore-ledger-production.js --org <slug> --ledger <file> [--stmt <file>]`. `restore-assurance-ledger-production.js` is now a thin Assurance wrapper. UI/append copy uses "master ledger file" not "golden master". Files: `app.js`, `bank-import-append.js`, `restore-ledger-production.js`, `restore-assurance-ledger-production.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Append blocked when opening balance drifts:** Import New Bank Activity now **refuses to apply** when statement beginning does not match live ledger opening (server + UI). Prevents stacking July rows on a corrupted June base. Added `scripts/restore-assurance-ledger-production.js` (Full Ledger Refresh from golden master + optional stmt append). Files: `bank-import-append.js`, `app.js`, `USER-GUIDE.md`. **Production:** `git push` for UI block; run restore script for data fix.
- **2026-07-09** — **Full Ledger Refresh button tooltips:** Each action (Preview, Import, Sort & Download, Download Csv/Xlsx) has an **i** icon with hover/focus tooltip explaining source (upload vs live books) and whether it imports. Files: `index.html`, `styles.css`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Full Ledger Refresh UX:** Download buttons relabeled **Download Csv Ledger**, **Download Xlsx Ledger**, **Sort & Download Csv Ledger**. Added **Preview** (row count, ending balance, ledger warnings before import). Post-import warnings now stay visible in **Ledger warnings** below (removed misleading "expand the panel above"). Files: `bank-import-conflicts.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Reference ledger download file names:** CSV and xlsx downloads now always save as **cooperative-bank-ledger-reference.csv** and **cooperative-bank-ledger-reference.xlsx** (matching `data\` on PC). Buttons show exact file names; browser Save dialog suggests the same name for overwrite. Files: `cooperative-bank-ledger-csv.js`, `server.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Reference CSV/xlsx parity:** Downloaded `cooperative-bank-ledger-reference.csv` now uses the **same columns** as `cooperative-bank-ledger-reference.xlsx` (`#`, Date, ISO Date, Member, Description, Amount, Running Balance, Narrative, Ledger Type, Source). CSV parser reads reference-format CSV interchangeably with xlsx. Added **Download Reference Xlsx** on Full Ledger Refresh. Files: `cooperative-bank-ledger-csv.js`, `parse-bank-sources.js`, `bank-statement-parser.js`, `server.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-09** — **Import preview: editable Type and Member:** Admin → Import → **Import New Bank Activity** preview now shows **Type** and **Member** dropdowns on **New** and **Review** rows (not Skipped). User corrections are sent as `rowOverrides` on apply. Skipped rows still require **Full Ledger Refresh** to reclassify. Files: `bank-import-append.js`, `server.js`, `app.js`, `styles.css`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-08** — **Assurance ledger fixed on production (Render):** Local DB rebuilt via `npm run pfm:import-bank` (453 rows, **$15,471.49**). Production **Full Ledger Refresh** via `scripts/push-ledger-to-production.js` — health now shows **453** `bankImportRows`, ending **$15,471.49** as of **2026-06-29** (was 583 rows). Code deploy **`715ba7c`**: auto-sync no longer overwrites `cooperative-bank-ledger-reference.xlsx` (CSV only). **Production:** `git push` (Render auto-deploy ~5–15 min). July activity: **Import New Bank Activity** with `stmt (7).csv` when ready.
- **2026-07-08** — **Bank ledger reference restored from golden master:** Root cause of reference ≠ master: **4 phantom duplicate rows** (+$603.20 through 6/29) plus **2 July test rows** (+$170.06) in reference only. Duplicates: second **-$16** monthly fee on **2023-04-03** and **2023-10-02**; second **+$317.60** mobile deposit on **2025-01-27** and **2025-02-18** (empty Member). Reference had been overwritten by `queueCooperativeBankLedgerCsvSync` from stale DB + agent hand-appends. **Fix applied locally:** copied `data/master-ledger/cooperative-bank-ledger-master.xlsx` → `cooperative-bank-ledger-reference.xlsx` and rebuilt `.csv` (**453 rows**, ending **$15,471.49**; **0 field diffs** vs master). **Production:** Admin → **Full Ledger Refresh** with restored xlsx (git push not required for data files).
- **2026-07-08** — **Handover: two-file bank ledger model (§1A corrected):** User confirmed golden **historical bank archive** is `data/master-ledger/cooperative-bank-ledger-master.xlsx` (453 rows, **$15,471.49**, 2023-01-23 through 2026-06-29) — **not** the same as `cooperative-bank-ledger-reference.xlsx` (app import file, corrupted by auto-sync). Built via `build-master-ledger.js` from `pre 2025.xlsx` + `stmt (6).csv`. Agents had conflated the two files in prior responses.
- **2026-07-08** — **Append import balance check fix:** Preview no longer flags a red **Balance mismatch** when ledger opening already differs from statement **beginning** (pre-period gap). Warning only when opening aligns but **new rows** fail to reach statement **ending**. UI shows statement beginning, pre-period gap note, or success when ending ties. Prior Assurance reconcile (phantom XXXXX rows, bank fees, proxy Zelle, xlsx ending **$15,471.49** on 6/29/2026) is **done** — do not re-diagnose. Bank ledger updates: **Admin → Import** only (no WinSCP). Files: `bank-import-append.js`, `app.js`. **Production:** `git push`.
- **2026-07-08** — **Agent note (Assurance ledger sync):** Do **not** tell user to WinSCP-upload for bank ledger. Established path since **2026-06-28** / **2026-07-01**: monthly **Import New Bank Activity** on live admin; full rebuild via **Full Ledger Refresh**. Proxy Zelle + xlsx corrections already shipped (`git push` + admin import). **Add New Transactions** button was `disabled` after preview when 0 new rows (or before Preview) but still looked active. Now always clickable: auto-runs Preview if needed, shows clear status (`No new transactions to add`, `need review`, etc.), labels count when ready (`Add New Transactions (2)`), resets on file change. Disabled buttons styled gray. Files: `app.js`, `index.html`, `styles.css`. **Production:** `git push`. Removed regex **Reference patterns** from admin UI (stays server-side). **Payment name mappings** table: Member + **Name on Bank Statement** (plain text); backend builds match patterns. Contribution/loan keywords remain editable comma-separated labels. Files: `member-payment-alias-service.js`, `import-rules-service.js`, `server.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-08** — **Import tab nested subsections:** **Bank Accounts and Import Settings** collapses **Registered Bank Accounts**, **Add Bank Account**, and **Edit Selected Account** (nested **Account Details** and **Classification Rules**). **Import New Bank Activity** nests **Download Import Template**. Files: `index.html`, `styles.css`. **Production:** `git push`.
- **2026-07-08** — **Bank import Phase 2 + Import tab UX:** All Import tab sections collapsed by default with explainer hints under each header. **Format-first parsers** per bank account (`auto`, CSV date/desc/amount, credit/debit, summary block, PFM template, OFX/QFX, custom column mapping). **Classification rules** (contribution/loan keywords, reference regex) and **payment name aliases** stored in DB and editable under **Bank Accounts and Import Settings**. Preview shows detected format and **statement ending balance** vs projected ledger. Books card shows primary account currency. New libs: `import-format-service.js`, `import-rules-service.js`, `member-payment-alias-service.js`. Files: `bank-import-append.js`, `statement-import-parser.js`, `bank-account-service.js`, `cooperative-books.js`, `import-fingerprint.js`, `database.js`, `schema.sql`, `server.js`, `index.html`, `app.js`, `styles.css`, `USER-GUIDE.md`. Tested locally: Assurance July stmt dedup (2 skipped), format `csv_summary_then_transactions`, balance check flags mismatch. **Production:** `git push` only.
- **2026-07-08** — **Bank accounts admin UI:** Import → **Bank Accounts and Import Settings** lists accounts, **Add Bank Account** form, **Edit Selected Account** (institution, label, currency, active dates, primary). Inactive accounts hidden from import dropdown. Files: `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-08** — **Append-only bank activity import:** Admin → Import → **Import New Bank Activity** uploads a bank statement or PFM transaction template; preview shows New/Skipped/Review; only new rows are inserted (fingerprint dedup). **Bank accounts** table (institution name, currency); org **date format** setting (MDY/DMY/YMD). Downloadable **Import Template** (CSV/xlsx) with required Date, Description, Amount, Type; Member required for member transactions. Full **Ledger Refresh** remains under Advanced. Tested locally with Assurance July 2026 stmt (Olawale $100, Gbanju $70.06). Docs: `USER-GUIDE.md`, `README.md`, `PEER-FINANCE-MANAGER.md`, `UPLOAD-DATA-TO-PRODUCTION.md`. Files: `bank-import-append.js`, `statement-import-parser.js`, `bank-account-service.js`, `import-template-service.js`, `import-fingerprint.js`, `transaction-import-types.js`, `cooperative-date-format.js`, schema/migrations, `server.js`, `index.html`, `app.js`. **Production:** `git push`.
- **2026-07-06** — **Public Pages plain-text editor:** Admin **Public Pages** tab uses collapsible **About Us** and **Bylaws** sections (collapsed by default). Cooperatives paste plain text (no HTML); PFM auto-formats public pages. Optional external website URL per section greys out built-in fields when the Cooperative already publishes online. Bylaws supports plain text plus optional PDF upload. **Production:** `git push` (`bff5e79`).
- **2026-07-06** — **Member report PDF mobile fit:** On phones, report viewer renders PDF pages to width-fit canvases (PDF.js) instead of iframe; full viewport height and scrollable pages. Desktop keeps iframe. **Production:** `git push`.
- **2026-07-06** — **Member report PDF viewer auth fix:** iframe could not send Bearer token, showed `Login required`. Viewer now fetches PDF via authenticated `fetch`, then displays blob URL in iframe. **Production:** `git push`.
- **2026-07-06** — **Member report PDF UI cache fix:** Netlify build cache-busts `app.js`/`styles.css`; no-cache headers. Report rows show **VIEW PDF REPORT** card; full-screen viewer (`z-index` 5000) with Back/Download. **Production:** `git push` (`b5dbd79`).
- **2026-07-06** — **Performance report overview date fix:** Member/admin summary no longer uses today's date. Overview is **stored when the report is generated** and served from the published report; fallback rebuild uses **month-end from period slug** (`2026-06` → Jun 30, 2026), not live ledger date. **Production:** `git push` (`06f69fd`).
- **2026-07-06** — **Member performance report UX:** Overview summary uses **latest published report as-of date** (not today). Report links labeled **View PDF Report** with tap-to-open hint. Full-screen PDF viewer with **Back to Member Portal** and **Download Report**. New `GET /api/me/cooperative-status-reports/:periodSlug/view` (inline PDF). **Production:** `git push` (`bff5e79`).
- **2026-07-06** — **Manual Record multi-column fields:** Forms inside each expanded Record section use a responsive grid (`auto-fit`, ~200px min) so fields like First/Middle/Last Name sit side by side; member pickers, addresses, and submit buttons stay full width. **Production:** `git push` (`bff5e79`).
- **2026-07-06** — **Manual Record collapse buttons:** Each Record tab section shows a **Collapse Section** button at the bottom when expanded (summary expands at top). Scrolls back to the section header on collapse. **Production:** `git push` (`bff5e79`).
- **2026-07-08** — **Meetings schedule form collapsed by default:** Admin → Meetings → **Schedule a Meeting** is a collapsible section (like Reminder Settings). Expands automatically when **Edit Details** is clicked. Files: `index.html`, `app.js`. **Production:** `git push`.
- **2026-07-08** — **Admin Email Send Audit:** Cooperative admins can open Meetings → **Email Send Audit** to see send batches (meetings, report publish, month-end), per-recipient Sent/Failed rows, and currently eligible recipients. New table `member_email_delivery_log`; APIs `GET /api/books/email-audit` and `GET /api/books/email-audit/batches/:id`. Older batches remain count-only until the next send. Files: `email-audit-service.js`, meeting/report notification services, `server.js`, `index.html`, `app.js`, `USER-GUIDE.md`. **Production:** `git push`.
- **2026-07-07** — **Membership apply return-to-origin:** `/c/{slug}/apply?from=about|bylaws` embeds FlexxForms on PFM; on submit, member returns to origin page; one-time thank-you flash. `publicApplyUrl` = `/c/{slug}/apply`. **Production:** `git push` (`43f3865`).
- **2026-07-07** — **BLUEHOST-EMAIL-RELAY-SETUP.md:** keystroke-level non-technical send-email walkthrough (mailbox, secret, upload, Render env, test).
- **2026-07-06** — **Bluehost email relay (no SendGrid):** `email-service.js` supports `EMAIL_RELAY_URL` + `EMAIL_RELAY_SECRET` (HTTPS to PHP on Bluehost); `bluehost-relay/pfm-mail-relay.php`; layman guide **BLUEHOST-EMAIL-RELAY-SETUP.md**. User declined SendGrid paid trial. **Production:** `git push` + upload PHP to Bluehost + Render env.
- **2026-07-06** — **EMAIL-NOTIFICATIONS-SETUP.md:** Bluehost DNS field mapping for SendGrid (Host Name vs Alias to; `em6813` example).
- **2026-07-06** — **EMAIL-NOTIFICATIONS-SETUP.md:** added "Where You Left Off" resume section; meeting announcement/reminder rows in auto-email table. Record tab sections (Register Member, Update Profile, Registration Fee, bank balances, etc.) stack in a single column instead of a 4-column grid, so expanding one section no longer stretches empty siblings on the same row. Collapsible `<details>` behavior unchanged. **Production:** `git push` (`1ab6c83`).
- **2026-07-06** — **FlexxForms `answers[]` parser (partner fix):** FlexxForms now ships labeled `answers[]` on `form.submitted` webhooks and via `GET /api/integrations/forms/{formId}/submissions/{submissionId}`. PFM parses applicant vs next-of-kin by **lowest/second `fieldIndex` on name rows** (not generic `firstName`/`lastName` scan). Reprocess fetches full submission when stored webhook lacks `answers[]`. Legacy label walk remains as fallback. **Production:** `git push` (`e18710e`).
- **2026-07-06** — **FlexxForms sparse webhook guard:** Post-deploy retest confirmed webhook has no labeled answers and integrations API fetch failed; PFM wrongly imported Mia Testy from generic `firstName`/`lastName`. Reprocess/webhook now **refuse** to create or update profiles when payload is sparse and API fetch fails. Escalation to FlexxForms required for full answers in webhook or working GET submission API. **Production:** `git push`.
- **2026-07-06** — **FlexxForms webhook field enrichment:** Reprocess appeared to do nothing because stored `form.submitted` webhook often has only submission metadata (generic `firstName`/`lastName` keys), not labeled form answers. **Fix:** Reprocess and new webhooks fetch full submission from FlexxForms integrations API when stored payload has fewer than 4 core fields; deeper label/field-id parsing; clearer admin status message. **Production:** `git push`.
- **2026-07-06** — **Admin delete membership applications:** Forms & Documents → Membership Applications **Delete** removes FlexxForms submission row; also deletes linked **pending approval** prospective member when no ledger transactions or loans. **Production:** `git push`.
- **2026-07-06** — **FlexxForms membership payload parsing fix:** webhook extractor was flattening entire JSON blindly — next-of-kin `firstName`/`lastName` could overwrite applicant (e.g. Mia Testy instead of applicant); generic walk corrupted `fields` arrays; FlexxForms field labels (`First Name`, `Email`, `Current Address: …`) not matched. Parser now uses labeled fields from the FlexxForms webhook first, scopes applicant vs next-of-kin buckets, maps Assurance membership form question text. Admin **Reprocess Data** button re-applies stored `payload_json` to linked profile. **Production:** `git push`.
- **2026-07-06** — **FlexxForms CUSTOM_STATE fix (partner response):** User retest showed red banner “Submission: CUSTOM_STATE is not defined” after signature + checkboxes complete. FlexxForms root cause: JS typo in US address submit handler (`CUSTOM_STATE` undefined); validation passed but submit crashed before API call. Fix deployed (commit `2217f7c`, platform-wide for `/p/` forms with address fields). **PFM action:** hard refresh and retest; expect Submitting… → success → `form.submitted` webhook → Membership Applications row. No PFM code change.
- **2026-07-06** — **FlexxForms platform fix (partner response):** FlexxForms confirmed zero server-side submissions for Assurance form `8d5e2b33-922e-4044-ad5c-6fe8bb0473d5` (July 5–6 tests never reached `POST /api/submissions/public/{formId}`). Root cause: validation/submit feedback was iframe-only on standalone `/p/{formId}` — silent client-side block. They deployed platform-wide fix: visible Submitting… banner, validation error summary above Submit, country dropdown US default (no stuck Loading…). Verifying webhook URL/secret on Assurance workspace. **PFM action:** user retest per steps below; confirm Membership Applications + Render `[flexxforms-webhook]` logs after successful submit. No PFM code change required unless retest fails.
- **2026-07-06** — **FlexxForms submit diagnosis (post-redirect retest):** User confirms Submit still does nothing on standalone `https://flexxforms.netlify.app/p/8d5e2b33-922e-4044-ad5c-6fe8bb0473d5` (not a PFM iframe issue). Production API returns correct `membershipFormId` and URL; webhook endpoint live (`400` without valid HMAC/org). No evidence submissions reach PFM (admin Membership Applications empty). Escalation drafted for FlexxForms. Added `[flexxforms-webhook]` structured console logging on successful webhook handling in `server.js` for Render log diagnosis. **Production:** `git push` for logging only; submit fix is FlexxForms-side.
- **2026-07-06** — **Apply: redirect to FlexxForms (no embed):** removed broken iframe apply page. `/c/{slug}/apply` and all **Apply for Membership** links go directly to `https://flexxforms.netlify.app/p/{formId}`. Server 302 on Render; Netlify shows brief redirect via cooperative-public.html. Webhook unchanged. **Production:** `git push`.
- **2026-07-06** — **Apply page infinite loading fix:** `backTop` was referenced before `const` declaration (TDZ ReferenceError), so apply page script never reached `loadApplyForm()`. **Production:** `git push`.
- **2026-07-06** — **AGENT_HANDOVER:** FlexxForms partner messages: wait for user post-deploy retest before drafting escalations (rule §0 item 5).
- **2026-07-06** — **FlexxForms public SDK + primary full-window CTA:** embed.js `data-embed-mode="public"` with postMessage + `FlexxForms.on` handlers; iframe scrolling enabled; taller defaults; **Complete Application (Recommended)** button opens `/p/{id}` directly; hide back-to-top on apply page. **Production:** `git push`.
- **2026-07-06** — **FlexxForms official embed pattern:** adopt FlexxForms guidance: direct `/p/{formId}` iframe (no query params, no embed.js); `flexxforms:resize` / `flexxforms:completed` / `flexxforms:error` / `flexxforms:submitting` postMessage on apply page; status banner + success hides iframe. **Production:** `git push`.
- **2026-07-06** — **FlexxForms submit restore:** direct `/p/` iframe omits Submit (FlexxForms platform). Restored `embed.js` with `data-form-path="p"`, tall `data-min-height`, dedupe guard, and **Open Application in Full Window** fallback on apply page. **Production:** `git push`.
- **2026-07-06** — **FlexxForms submit button clip fix:** today's `/p/` embed regressed: `scrolling="no"` + resize height that omitted the fixed submit bar hid Submit below the iframe fold. Restored max-height tracking, +120px submit footer padding, scrollable fallback until resize confirms, `/p/{id}?embed=1` (resize only; not `/embed`), taller desktop default (~3000px). **Production:** `git push`.
- **2026-07-06** — **AGENT_HANDOVER:** mandatory rule: FlexxForms partner messages always in one copy-paste code block; § FlexxForms integration template (multi-tenant, all orgs). Outstanding task #7 broadened beyond Assurance.
- **2026-07-06** — **FlexxForms public embed (permanent):** dropped `embed.js` for cooperative apply forms. Direct iframe to `/p/{formId}` with no `?embed=1` or `/embed` path (only mode that hides PlacementExpress / "Back to deal"). Resize + completion via postMessage. **Production:** `git push`.
- **2026-07-06** — **FlexxForms embed fix:** use `data-form-path="p"` (public form URL, no PlacementExpress / "Back to deal" chrome). Mount embed.js once after script load to prevent duplicate forms. **Production:** `git push`.
- **2026-07-06** — **FlexxForms embed.js (July 2026):** membership and loan apply flows use FlexxForms host `embed.js` (`data-form-id` + auto-resize) instead of static iframes on `/c/{slug}/apply`, legacy `/?apply=`, and member loan apply. `mountFlexxFormsEmbed()` in `flexxforms-embed.js`; success UI on completed event. Webhook unchanged. **Production:** `git push`.
- **2026-07-05** — **Record tab collapsible sections:** all Record forms and recent lists use collapsed `<details>` by default; Register Member / Update Profile auto-expand when opened from Members tab. **Production:** `git push`.
- **2026-07-05** — **Meetings tab layout:** scheduled meetings list moved to top of Meetings page (form and reminder settings below). **Production:** `git push`.
- **2026-07-05** — **Admin nav tabs:** moved Public Pages, Status Report, Meetings, Forms & Documents, and Subscription off the Cooperative Books scroll stack into dedicated top-level tabs (lazy-loaded). Cooperative Books is dashboard cards only. **Production:** `git push`.
- **2026-07-05** — **Apply signing tip sizing:** reduced callout font/padding so it matches FlexxForms field scale. **Production:** `git push`.
- **2026-07-05** — **Apply page signing tip:** landscape rotation note above membership form on `/c/{slug}/apply`. **Production:** `git push`.
- **2026-07-05** — **Apply embed landscape fix:** removed broken fullscreen landscape mode (was hiding entire page). Form iframe stays tall in both orientations; page scrolls normally. **Production:** `git push`.
- **2026-07-05** — **Apply form embed overhaul:** use FlexxForms public form URL `/p/{id}` (removes erroneous "Back to deal" partner chrome from `/embed?embed=1`). Iframe opens at full form height (~2800px mobile) so the form is not clipped; page scrolls as one document. Apply hero hidden. Landscape: entire screen goes to form only. **Production:** `git push`.
- **2026-07-05** — **Apply embed landscape/signature:** on mobile landscape, apply shell goes full viewport and iframe resizes to `visualViewport` height; orientation/viewport listeners reset embed height and notify FlexxForms. `allow="fullscreen"` on iframe. **Production:** `git push`.
- **2026-07-05** — **Apply embed scroll fix:** FlexxForms embed URLs now include `?embed=1` (required for `flexxforms:resize` postMessage). `flexxforms-embed.js` keeps iframe scrollable until resize arrives; fallback height if resize missing. Apply page card `overflow: visible`. **Country dropdown "Loading…":** FlexxForms-side. **Production:** `git push`.
- **2026-07-05** — **Apply embed mobile height:** `flexxforms-embed.js` listens for FlexxForms `flexxforms:resize` postMessage and grows the iframe to fit the form (no nested scroll). Apply page hero compact on mobile. **Country dropdown "Loading…":** FlexxForms-side (lazy country library in embed); needs FlexxForms default US on address field or chunk-load fix. **Production:** `git push`.
- **2026-07-05** — **About hero section jumps:** Membership, Goals, and Leadership chips on `/c/{slug}/about` are now anchor buttons that scroll to `#membership`, `#goals`, and `#officials`; static chips removed on Bylaws/Apply. **Member login:** removed duplicate standalone Apply link (kept single link in public org links row). **Production:** `git push`.
- **2026-07-05** — **Public Apply for Membership pages:** `/c/{slug}/apply` served alongside About/Bylaws; nav, hero CTAs, footer links, and in-page **Become a Member** promos on About/Bylaws; FlexxForms iframe on apply page. Login/member footers link to apply when form is published; `/?apply={slug}` redirects to `/c/{slug}/apply`. Netlify redirect added in `scripts/netlify-build-config.js`. Files: `cooperative-public.html`, `cooperative-public.css`, `server.js`, `cooperative-public-pages-service.js`, `flexxforms-service.js`, `app.js`, `index.html`. **Production:** `git push`.
- **2026-07-05** — **FlexxForms membership pipeline:** public apply link (`/?apply={slug}`), webhook `form.submitted` auto-creates pending member profile (`cooperative_account_status: pending_approval`), admin **Membership Applications** panel with fee/deposit checklist, **Approve Member** gated on membership fee ($100) + initial contribution ($100 deposit). Files: `lib/flexxforms-membership-service.js`, webhook handler, routes, admin UI. **Production:** `git push`.
- **2026-07-04** — FlexxForms **document templates API:** `GET /integrations/documents/templates` merged into admin catalog load; forms vs master document assign targets; loan signing uses `signingUrl` / `signingSessions` (not `/embed/{id}` fallback). Webhook handles `document.updated` when status completed. FlexxForms fixed Assurance webhook URL to Render. **Production:** `git push`.
- **2026-07-04** — FlexxForms admin **Published in FlexxForms** catalog: card layout with UUID, four Assign targets (membership, loan, guarantor, borrower), linked state; removed browser `prompt()`. **Production:** `git push`.
- **2026-07-04** — FlexxForms **Load Forms** error copy: clarifies workspace must be connected (Retry → Ready badge) before listing forms; button disabled until provisioned. **Production:** `git push`.
- **2026-07-04** — **FlexxForms Assurance admin email (again):** logged-in session (`yinka@…`) was overriding canonical Assurance FlexxForms email in UI and retry. Assurance slug now always resolves to `assuranceflex@eworkchop.com`; startup backfill also syncs `flexxforms_admin_email`. **Production:** `git push`.
- **2026-07-04** — **FlexxForms Assurance admin email fix:** startup backfill had set `admin_email` to first org admin (`yinka@eworkchop.com`) before Assurance override could run; Load Forms failed with no API key. Assurance now always gets `assuranceflex@eworkchop.com`; retry uses logged-in admin email first. **Production:** `git push`.
- **2026-07-04** — **FlexxForms retry-provision fix (cooperative admin):** legacy orgs had NULL `organizations.admin_email`, so Retry FlexxForms Setup failed before calling FlexxForms ensure. Added `admin_email` on registry `organizations`, `resolveFlexxFormsAdminEmail()` (org row then logged-in admin session), startup backfill from first org admin user (+ Assurance `assuranceflex@eworkchop.com`), register-organization persists admin email before provision, `applyEnsureResponse` fills form/doc ids from `readyToUse` only when empty (preserves saved membership form id). Files: `lib/flexxforms-service.js`, `lib/flexxforms-routes.js`, `lib/organization-service.js`, `lib/auth-service.js`, `lib/auth-routes.js`. **Production:** `git push` only.
- **2026-07-03** — **FlexxForms Plan B:** each Cooperative gets its own FlexxForms workspace on register (`POST /platform/workspaces/ensure`). Credentials on registry `organizations` (secrets server-only). Admin **Manage Forms & Documents** (open FlexxForms, save form/doc ids, retry provision, list forms). Member loan apply embed; public membership apply from member login. Loan guarantor/borrower agreements via integrations API + in-app iframe. Webhook `POST /api/flexxforms/webhook` (raw body + HMAC). Env: `FLEXXFORMS_API_BASE`, `FLEXXFORMS_PROVISIONING_SECRET` on **Render** (API). Files: `lib/flexxforms-service.js`, `lib/flexxforms-routes.js`. **Production:** `git push` + set Render env vars if not already.
- **2026-07-03** — Product page Work Chop footer: compact content-sized badge (`width: fit-content`, smaller logo/padding) instead of full-width banner; mobile stacks logo above text. **Production:** `git push`.
- **2026-07-03** — Headings and section leads use full content width **app-wide** (`product.css`, `styles.css`, `cooperative-public.css`, legacy `public/styles.css`): no artificial `max-width` on titles/hints/leads. Form/input layout widths unchanged. Hero: five dashboard mock cards; mobile/tablet grid shows all cards. **Production:** `git push`.
- **2026-07-03** — **Cooperative capitalization enforced app-wide for all tenants:** `capitalizeCooperativeWording()` in `text-format.js`; public About/Bylaws sanitize + save; API error JSON middleware; HTML builder `esc()`; seed v12. **Production:** `git push`; Render restart re-seeds public pages.
- **2026-07-03** — Product page polish: workflow step 4 real-time copy; centered Work Chop footer (mobile stack); trust section color cards + title case; **Title Case rule** extended (lowercase 2–3 letter words; capitalize **Cooperative**); footer tagline update. Bylaws nested Roman lists under letter items (seed v10). **Production:** `git push`.
- **2026-07-02** — Product page (`/product`), `PEER-FINANCE-MANAGER.md`, bylaws HTML rebuild (structured lists/sections from PDF source), public content seed v9. **Em/en dash purge** in user-facing UI (`product.html`, `app.js`, `index.html`, emails, timezone labels, ledger CSV headers): colons per `UI-COPY-STANDARDS.md`. **Production:** `git push`. Admin → Cooperative Books → **Meetings & Announcements** — schedule drafts, announce to member portal + email, cancel, automatic reminders (per-org). Member portal **Cooperative Meetings** panel. Files: `cooperative-meeting-service.js`, `meeting-notification-service.js`. **Production:** `git push`.
- **2026-07-01** — Member portal UX: hide tab nav and redundant **My Account** heading (members land on account content directly); mobile header declutter; logout power icon. **Production:** `git push`.
- **2026-07-01** — **Proxy Zelle deposit fixes:** import credits beneficiary named after `for …` in description (not Zelle payer); pre-import **Ledger warnings** on Admin → Import (proxy mis-credit + contribution vs loan type); regression script `node peer-finance-manager/scripts/test-ledger-import-audit.js`. Corrected `cooperative-bank-ledger-reference.xlsx` (Ejiro/Titilope proxy rows; Oluwabiyi Mar 23 $100.13 → deposit). Utility scripts: `fix-proxy-deposit-members.js` (xlsx Member column), `fix-proxy-deposit-balances.js` (local DB one-shot). **Production:** `git push` then **Admin → Import** upload corrected xlsx (no WinSCP for bank ledger).
- **2026-06-29** — Bank import conflict handling with **Download missing rows CSV**; **Sort selected file & download** and **Download sorted reference CSV** (date-ordered `cooperative-bank-ledger-reference.csv` from upload or live books). Auto-sync reference CSV on manual entries. **Production:** `git push`.
- **2026-06-28** — Fix bank import upload error (`importBankLedger is not a function`) — circular require between `bank-import.js` and `import-bank-ledger.js`; lazy-load import inside `runBankImportFromUpload`. **Production:** `git push`.
- **2026-06-28** — **Admin bank ledger import on live site:** Admin → Import → **Bank Ledger Import** uploads cooperative workbook (.xlsx) and optional bank statement (.csv); updates production DB immediately (no WinSCP/Manual Deploy). API: `POST /api/bank-import/run`. Month-end auto-publish toggle on Cooperative Books. **Production:** `git push`.
- **2026-06-28** — Added **EMAIL-NOTIFICATIONS-SETUP.md** (layman steps to enable SMTP on Render for member report emails).
- **2026-06-28** — Olawale George WPForms row added to CSV and imported locally (`f5ec8e6`). **UPLOAD-DATA-TO-PRODUCTION.md** clarifies Manual Deploy is required after every WinSCP upload (stale DB connection). Fixed `pfm:profiles` script org context.
- **2026-06-27** — Member report email notifications: SMTP on Render sends reminders on the **last day of each month** and when a cooperative status report is **published** (profile email or member login email). Env: `SMTP_*`, `MEMBER_PORTAL_URL`. Deduped in `member_report_email_log`. **Production:** `git push` + Render env vars.
- **2026-06-27** — Monthly status report "as at" date: manual admin **Generate Report** uses **today's date** (not month-end); scheduled auto-generate at month end still uses the last calendar day. Dashboard preview matches. **Production:** `git push`.
- **2026-06-26** — Production data upload reliability: after WinSCP replaces `peerfinance.db`, **Manual Deploy** is required so the running Node process reopens the file (stale in-memory SQLite connection showed old Cooperative Books totals while disk/Shell were correct). Code: auto-remove stale `.wal`/`.shm` on open; do not restore from `peerfinance.seed.db` when live DB is newer; `/api/health` includes ledger probe (`latestTransaction`, `bankImportRows`, `dbSize`). Docs: **UPLOAD-DATA-TO-PRODUCTION.md** Step 4 (sidecars + seed). **Production:** `git push`.
- **2026-06-26** — Title Case backfill script: `npm run pfm:normalize-profiles` (dry-run) / `pfm:normalize-profiles:apply`. After apply locally, WinSCP upload + Manual Deploy.
- **2026-06-18** — Monthly Cooperative Status Report: per-organization PDF (not Assurance-specific); admin toggles for auto-generate at month end and auto-publish to member portal; manual Generate / Publish / Download on Cooperative Books; members see published reports on My Account. Storage: `data/organizations/{slug}/reports/cooperative-status/`. Scheduler runs all orgs every 6 hours. **Production:** `git push` only.
- **2026-06-18** — Member biodata Title Case: `peer-finance-manager/lib/text-format.js` normalizes names on create/update/import; display path formats legacy DB rows. WPForms import keeps raw `applicationName` for ledger matching. **Deployed:** `2ce0dd7` (`git push`).
- **2026-06-21** — Typography hierarchy: section headers larger/bolder than description (`.subtle`) text app-wide.
- **2026-06-21** — Agreed Loan Repayment Schedule: removed empty Payment column; balance reduces by interest plus principal each period.
- **2026-06-21** — Loan repayment **Balance** now tracks **principal still owed** (matches Paid status); repayments list newest-first. Fixes paid loans showing non-zero balance when total payable included unearned scheduled interest.
- **2026-06-21** — Loan account UX: **Agreed Loan Repayment Schedule** collapsed by default (no Due column; Balance column); actual repayments show running **Balance**; active loans expanded, paid loans collapsed.
- **2026-06-21** — Strengthened continuous documentation: `.cursor/rules/continuous-documentation.mdc` (`alwaysApply`); §0 self-instructing rules — agents must update docs in the same turn as every change; user must never need to ask for doc updates.
- **2026-06-21** — Admin can upload member profile photos from **Members & Accounts** (`POST /api/members/:id/photo`); members retain self-service upload/update. **Production:** `git push` only.
- **2026-06-19** — Fixed member profile photo upload: restore org context after multer async parse (was "No organization selected"); mobile Upload Photo button styled as primary full-width.
- **2026-06-19** — Full documentation sync: all project docs updated to match codebase; §0 strengthened with continuous documentation rule.
- **2026-06-19** — Fixed Gbanju alias (`GBANJU P ARUWAYOOBE`); CD balance updated to $7,211.82 with term metrics and **Expected CD Interest** dashboard card; bank re-import now 0 skipped rows (57 loan repayments).
- **2026-06-19** — Bank import through 2026-06-16: merged 3 new BoA deposits (Lolu $50, Mutiu $100.04, Clement $100.02) into `data/bank-statement-2026.csv`; ran `import-bank-ledger.js` (450 bank_import txs, last date 2026-06-16). **Production:** WinSCP upload `data/` → Render `/var/data` + Manual Deploy required.
- **2026-06-19** — Added USER-GUIDE, UPDATE-AND-PUBLISH, UPLOAD-DATA-TO-PRODUCTION, immutable doc rules (§0). Production live on Netlify + Render.
- **2026-06-18** — Member profile portal UX (`c8521cc`): collapsible **Membership Biodata** and **Emergency Contact**; mobile-friendly layout; inline labels (`Middle Name:`, `Account Status: Active`). **Production:** `git push` only.
- **2026-06-18** — Member self-service (`5041977`): profile biodata view, emergency contact edit, optional photo upload (`member-self-service.js`); admin **Cooperative Books** CD metrics; UI copy standards (Title Case, no em dashes).
- **2026-06-18** — Bank ledger import wired: `peer-finance-manager/lib/import-bank-ledger.js` + `npm run pfm:import-bank` merges `All deposits.xlsx` + `data/bank-statement-2026.csv` into SQLite with **real bank dates** (deposits, withdrawals, loan repayments, expenses, CD transactions).
- **2026-06-18** — Date display fix: `formatDate()` / `formatDisplayDate()` parse `YYYY-MM-DD` as local calendar dates (fixes DOB and transaction dates showing one day early in US time zones). Files: `peer-finance-manager/public/app.js`, `lib/loan-statement-generator.js`. **Production:** `git push` only.
- **2026-06-18** — Mobile My Account: **Description** column hidden by default on small screens; **Show Descriptions** / **Hide Descriptions** toggle on member portal. **Production:** `git push` only (verify committed).
- **2026-06-13** — Cloud deploy: Render API + Netlify UI; multi-org auth; member portal with running balances and monthly PDFs; Puppeteer Chrome install on Render for PDFs; data upload via WinSCP to `/var/data`.
- **2026-06** — Multi-organization registry, per-org SQLite, separate login portals (`/member`, `/staff`, `/admin`), manual Record tab, member credential provisioning.
- **2026-06-30** — **Assurance bank ledger golden reconcile (RESOLVED):** `build-master-ledger.js` merged `pre 2025.xlsx` + `stmt (6).csv` into **`data/master-ledger/cooperative-bank-ledger-master.xlsx`** — **453 rows**, last date **2026-06-29**, ending **$15,471.49** (matches BoA). User asked to **keep this single historical archive** separate from the app import file. June 2026: **13 transactions, $2,254.12**. Also refreshed `cooperative-bank-ledger-reference.xlsx` for import (later corrupted by auto-sync — see §1A).

---

## 1A. Assurance bank ledger — canonical record (mandatory read)

**Purpose:** Stop agents from re-opening resolved reconcile work, conflating two different files, or blaming the user. Read this **before** any balance-mismatch diagnosis or “re-upload your xlsx” guidance.

### Two different files (do not conflate)

| File | Role | Status |
|------|------|--------|
| **`data/master-ledger/cooperative-bank-ledger-master.xlsx`** | **Historical bank archive** — single reconciled copy of all BoA transactions the user asked to keep after the 6/30/2026 exercise. **Read-only reference.** | ✅ **Golden** (verified 2026-07-08) |
| **`data/cooperative-bank-ledger-reference.xlsx`** / `.csv` | **App import file** — uploaded via Admin → **Full Ledger Refresh** to rebuild production DB. Also auto-synced from DB (dangerous). | ✅ **Restored** (453 rows, **$15,471.49**, matches master 2026-07-08) |

### Golden historical archive (RESOLVED — do not re-diagnose)

| Field | Value |
|-------|--------|
| **Path (PC)** | `C:\Users\yinka\Documents\AssurCoop\data\master-ledger\cooperative-bank-ledger-master.xlsx` |
| **Row count** | **453** |
| **Date range** | **2023-01-23** through **2026-06-29** |
| **Ending checking balance** | **$15,471.49** (matches BoA) |
| **Sources merged** | `C:\Users\yinka\Downloads\pre 2025.xlsx` (pre-2025 history) + `stmt (6).csv` (Jan 2025 through 6/29/2026) |
| **How it was built** | `peer-finance-manager/scripts/build-master-ledger.js` |
| **June 2026 activity** | **13 rows, $2,254.12** — matches June bank stmt exactly |

**Resolved items (closed — never cite as open gaps):** phantom `XXXXX` duplicate NFCU rows (~$400); duplicate monthly bank fees; proxy Zelle mis-credits (Ejiro/Titilope); pre-2025 bank charges incorporated; June stmt tie-out to **$15,471.49**.

### App import file state (July 2026 — canonical)

| Field | Value |
|-------|--------|
| **Rows** | **457** (453 master through **2026-06-29** + **4** July 2026) |
| **Ending checking balance** | **$16,241.55** through **2026-07-08** (matches `stmt (8).csv`) |
| **July stmt** | `C:\Users\yinka\Downloads\stmt (8).csv` — beginning **$15,471.49**, credits **$770.06** |
| **Saheed 7/8 $500** | **Loan Repayment** → **Yomi Salami** (override; stmt text has no "loan") |

### Standard restore (admin UI — no special scripts)

When dashboard ≠ **$16,241.55** or ledger is below statement beginning:

1. **Full Ledger Refresh (Advanced):** upload `data/master-ledger/cooperative-bank-ledger-master.xlsx` → Preview → Import Bank Ledger. Expect **453 rows**, **$15,471.49** through **6/29/2026**.
2. **Import New Bank Activity:** upload `stmt (8).csv` (or latest cumulative July export) → Preview (4 **New**) → Add New Transactions. Expect **457 rows**, **$16,241.55** through **7/8/2026**. Saheed $500 → **Loan Repayment** / Yomi Salami (payment alias Default Type).

**Rest of July / any month:** re-upload cumulative stmt (period start → today); duplicates **Skipped**, only **New** rows apply (§1B).

Ops/API equivalent (same two steps): `restore-ledger-production.js --org assurance --ledger <master.xlsx> --stmt <july.csv>`

### Ops shortcut (optional — agents only)

`restore-assurance-ledger-production.js` pre-merges master + July into one reference xlsx then Full Ledger Refresh. **Not required** when payment aliases and append safety are deployed (2026-07-09+).

### Restore procedure (historical base only)

1. **Do not edit** `data/master-ledger/cooperative-bank-ledger-master.xlsx` (golden archive).
2. For **July+** activity after a bad base, use **standard restore** above (Full Ledger Refresh master, then Import New Bank Activity).
3. Confirm dashboard **Ledger Checking Balance: $16,241.55** as of **2026-07-08**.

```powershell
# Regenerate master if needed (does not touch golden copy if you copy output manually):
cd peer-finance-manager
node scripts/build-master-ledger.js "C:\Users\yinka\Downloads\pre 2025.xlsx" "C:\Users\yinka\Downloads\stmt (6).csv"
# Golden copy already at: data\master-ledger\cooperative-bank-ledger-master.xlsx
```

### Agent rules (non-negotiable)

| Do | Do not |
|----|--------|
| Treat **`master-ledger/cooperative-bank-ledger-master.xlsx`** as the reconciled historical archive | Call `cooperative-bank-ledger-reference.xlsx` the “historical bank records file” |
| Use **Full Ledger Refresh** (master xlsx) then **Import New Bank Activity** (stmt) when base is wrong | Tell admins to run Assurance-only wrapper scripts for normal resets |
| Verify: **457 rows**, ending **$16,241.55**, last **2026-07-08** (baseline through 7/8) | Re-diagnose from scratch when §1A already has the answer |
| **July interim + all months:** cumulative stmt upload (period start → today); fix Type/Member in preview if needed | Re-upload to "fix" skipped/wrong rows (use Full Ledger Refresh or Books → Category) |
| Document every ledger touch in **§ Changelog same turn** | Blame user for dashboard drift |

---

## 1B. Bank ledger product mode (all tenants — mandatory read)

**Purpose:** Tenant-specific rescue scripts (e.g. Assurance §1A) are **recovery only**. **Every** independent Cooperative admin must be able to trust **Import New Bank Activity** without agent intervention. Append logic lives only in generic libs (`bank-import-append.js`, `import-fingerprint.js`, shared admin UI). **No** tenant slug, balance, or row-count checks in product code.

### Tenant isolation

| Property | Behavior |
|----------|----------|
| Database | One isolated `peerfinance.db` per org (`runWithOrg` / session org slug) |
| Dedup fingerprints | Per `bank_account_id` within that org's DB |
| Payment aliases / rules | Per-org settings in admin UI |
| Regression test | Unit checks are tenant-agnostic; optional `--org <slug> --stmt <file>` live preview |

### Source of truth

| Layer | Role |
|-------|------|
| **Production DB** (`transactions` table) | **Authoritative** for dashboard balance, member accounts, statements |
| **Master ledger file** (uploaded via Full Ledger Refresh) | **Rebuild input** for initial load or full correction |
| **Monthly bank statement** (append upload) | **Delta input** for new activity only |
| **`cooperative-bank-ledger-reference.xlsx`** | **Export/download** of live books; **not** a second ledger to edit by hand |

### Append contract (fail-closed — every tenant)

1. **Ledger-short block:** refuse apply only when live ledger balance **before** new rows is **below** statement **beginning** (missing history). Run **Full Ledger Refresh** first.
2. **Cumulative re-upload (allowed — every tenant):** when the ledger is **above** statement beginning because rows from the same period are already imported (normal for in-month interim uploads), append is **not** blocked. Re-upload the statement from **period start through today** as often as needed. Rows already in the ledger show **Skipped**; only **New** rows apply.
3. **Ending block:** refuse apply when **ready** rows exist and **projected ledger** after new rows ≠ statement **ending**.
4. **Preview corrections:** admin sets **Type** and **Member** on New/Review rows before apply.
5. **Payment name mappings:** each row can set **Default Type** when bank text has no contribution/loan keyword (e.g. Zelle payer name only).
6. **Dedup:** fingerprints + `INSERT OR IGNORE` on `import_fingerprint` (unique index). Re-uploading the same statement never creates duplicate rows.

### Auto-sync (local vs cloud)

- **Cloud (Render, `PFM_DATA_DIR` set):** after import/append/manual entry, CSV export sync runs from DB (xlsx never auto-overwritten).
- **Local dev:** CSV auto-sync **off** by default so a stale local DB cannot overwrite `data/cooperative-bank-ledger-reference.csv`. Opt in: `PFM_LEDGER_CSV_SYNC=1`.

### Regression test (any org)

```powershell
npm run test:bank-append
# Optional live preview for any org:
node peer-finance-manager/scripts/test-bank-append-balance.js --org <slug> --stmt <path.csv>
```

Asserts alias classification, cumulative re-upload (ledger above statement beginning), ending tie-out when new rows exist, and idempotent re-upload when all rows skipped.

### Bank Reconcile Status (every tenant)

**Purpose:** Catch ledger drift **without** Assurance-only row counts or agent scripts. Each tenant's DB stores the last **verified** bank state after a successful import.

| When anchor is saved | `full_refresh` after **Full Ledger Refresh**; `append` after **Import New Bank Activity** when statement ending ties ledger (including idempotent re-upload with 0 new rows). |
| Stored in `cooperative_settings` | `bank_reconcile_balance`, `bank_reconcile_as_of`, `bank_reconcile_bank_import_rows`, `bank_reconcile_verified_at`, `bank_reconcile_source`, `bank_reconcile_label` |
| **Reconciled** | Live `bank_import` row count = anchor count **and** ledger balance through anchor as-of = anchor balance (±$0.02). |
| **Out of Sync** | Row count or balance at anchor date drifted since last verified import (phantom rows, bad append, manual DB edit, stale restore). |
| **Not Verified** | No anchor yet (new tenant or pre-feature DB). Clears on next successful import. |
| Dashboard | Cooperative Books card **Bank Reconcile Status** (amber when out of sync). |
| Ops | `GET /api/health` → `ledger.bankReconcile` (Assurance probe today; pattern is per-org in books API). |
| Regression | `npm run test:bank-reconcile` |

**Agent rule:** If status is **Out of Sync**, do **not** claim the ledger is correct. Use standard admin workflow (Full Ledger Refresh + append) or documented restore script; successful import refreshes the anchor.

### Reference file vs live DB (never stale-into-DB)

| Rule | Behavior |
|------|----------|
| **Authoritative** | Production `peerfinance.db` `transactions` table |
| **`cooperative-bank-ledger-reference.csv` on Render** | **Export only** — rewritten from live DB after every import, append, and reclassify (`queueCooperativeBankLedgerCsvSync`). **xlsx is never auto-overwritten.** |
| **Reclassify/split rebuild** | Uses **live DB rows** (`loadBankTransactionsFromDb`), not the on-disk reference file. Fallback to file only when DB has zero bank rows. |
| **Server startup** | Exports DB → CSV only (`server_startup` sync). **Does not** read reference file into DB (removed dangerous `syncMissingBankLedgerRows` on boot). |
| **`sync-missing` API** | If used, refreshes CSV from DB **before** comparing so a stale file cannot inject phantom rows. |
| **Full Ledger Refresh** | Only routine path that loads from an **uploaded** master file chosen by the admin. |

### Ops recovery (when append is blocked)

```powershell
node peer-finance-manager/scripts/restore-ledger-production.js --org <slug> --ledger <master.xlsx>
```

Assurance wrapper: `restore-assurance-ledger-production.js` (§1A).

### Agent rules (product mode)

| Do | Do not |
|----|--------|
| Ship fixes in **generic** libs (`bank-import-append.js`, aliases, UI) | Add Assurance-only UI thresholds or hardcoded balances |
| Run `npm run test:bank-append` after append/balance changes | Claim "fixed" after data restore only |
| Document §1B + changelog same turn | Tell Coop admins to use SFTP or file-copy tools (use **Admin → Import** / **Maintenance**) |

---

The cooperative collects monthly member contributions (minimum ₦50), charges a ₦100 annual registration/admin fee, pays periodic **distributions** (profit/interest), and offers **loans** to members under specific rules. The treasurer (user: Yinka) needs to:

1. Produce **monthly PDF account statements** for every member
2. Maintain an accurate **ledger** of deposits, withdrawals, distributions, and loans
3. Eventually **reconcile Bank of America** exports against member activity
4. Keep **member banking profiles** (KYC-style data from membership applications)

Historically, everything lived in Excel (`Assurance Status` workbooks). This repo automates statement PDFs and has started a proper ledger app (PeerFinanceManager).

### Key business rules already encoded

**Statements (`lib/statement-generator.js`):**

- Positive month cell = deposit; negative = withdrawal
- Distribution column on workbook (e.g. `* Distribution - February`) is credited on statements
- Distribution row in the period table sits **after February deposit** (user-requested layout)
- Members with a withdrawal in the statement window: closing balance = `Total Deposits + withdrawals` only; registration and distribution still displayed but not double-counted
- Ejiro Awhotu is the canonical test case: April 2026 withdrawal −₦1,721.91 → balance **₦995.59**

**Ledger (`peer-finance-manager/`):**

- Membership fee: ₦100
- Loan: 2 guarantors, 6+ months membership, max = min(borrower deposits, guarantors combined), 8% / 12 months default
- Late fee: $25 after 22nd (logic in `loan-service.js`)
- Spreadsheet import dates deposits on **last day of month** (placeholder); **bank import** uses real dates from BoA CSV

**Bank CSV (`lib/bank-statement-parser.js`):**

- Uses `Narrative` column: only `Member Deposit` / `Member Withdrawal` count toward contributions
- Known mislabels in `stmt (1).csv`: Gbanju and Oluwabiyi loan payments tagged as `Member Deposit` — **workbook wins**

---

## 2. What has been built

### Statement Generator (port 3456)

| Status | Item |
|--------|------|
| ✅ Done | Web UI (`generator.html`) — select workbook, sheet, optional distribution upload |
| ✅ Done | PDF batch generation via Puppeteer worker |
| ✅ Done | Distribution from workbook column and/or uploaded file |
| ✅ Done | Output to `statements/YYYY-MM/` |
| ✅ Done | March, April, May 2026 PDF runs |
| ✅ Done | Bank CSV parser with member name aliases |
| ✅ Done | `compare-workbook-bank.js` reconciliation |
| ✅ Done | `generate-may-2026-from-bank.js` pipeline |

### PeerFinanceManager (port 3457 local / production cloud)

| Status | Item |
|--------|------|
| ✅ Done | SQLite schema + per-org databases (`data/organizations/{slug}/`) |
| ✅ Done | Multi-org registry (`data/registry.db`) |
| ✅ Done | Auth: admin / staff / member roles; separate portals |
| ✅ Done | Member self-service: balances, transactions, monthly statement PDF |
| ✅ Done | Member portal **My Profile**: biodata (read-only), emergency contact (editable), optional photo upload |
| ✅ Done | Member portal mobile UX: collapsible biodata/emergency sections; Description column toggle; flat transaction tables with nowrap rows |
| ✅ Done | Manual Record tab: register member, profile edit, membership fee |
| ✅ Done | Cooperative Books dashboard (incl. CD balance, **Expected CD Interest** card) |
| ✅ Done | **Production:** Netlify (static UI) + Render (Express API + SQLite on disk) |
| ✅ Done | Member credential export CSV |
| ✅ Done | Puppeteer PDF on Render (Chrome installed at build) |
| ✅ Done | Bank ledger import via `npm run pfm:import-bank` (`import-bank-ledger.js` + `parse-bank-sources.js`) |
| ✅ Done | Date display fix for `YYYY-MM-DD` values (timezone-safe local parsing) |
| ✅ Done | Bank import UI tab — **Import New Bank Activity** (append preview/apply), format profiles, rules, aliases, OFX, balance check |
| 🟡 Partial | Active loans not fully loaded |
| ❌ Not done | Expenses UI / import |
| ❌ Not done | Supabase live sync (optional future) |
| ❌ Not done | Auto-sync PC database ↔ cloud database |

### Data files in repo

| File | Role |
|------|------|
| `Assurance Status 4 2026.xlsx` | Source of truth through **April 2026** |
| `Assurance Status 5 2026.xlsx` | May 2026 sheet with bank-filled deposits |
| `Assurance Status 2 2026.xlsx` | February 2026 only (older) |
| `wpforms-5-...csv` | 22 membership applications |
| `data/master-ledger/cooperative-bank-ledger-master.xlsx` | **Historical bank archive (golden)** — all reconciled BoA transactions 2023-01-23 through 2026-06-29, ending **$15,471.49**, **453 rows**. Built `build-master-ledger.js` from `pre 2025.xlsx` + `stmt (6).csv`. **User-kept reference; do not overwrite.** See §1A. |
| `data/cooperative-bank-ledger-reference.xlsx` | **App import file** for Full Ledger Refresh (Member/Narrative labels). Restored from master 2026-07-08 (453 / $15,471.49). Re-copy from master if auto-sync clobbers again. |
| `data/cooperative-bank-ledger-reference.csv` | CSV twin of import file |
| `C:\Users\yinka\Downloads\pre 2025.xlsx` | Pre-2025 BoA history source used in 6/30 reconcile |
| `C:\Users\yinka\Downloads\stmt (6).csv` | BoA Jan 2025 through 6/29/2026 source used in 6/30 reconcile |
| `data/bank-statement-2026.csv` | Partial 2026 BoA slice (older workflow; not full history) |

### Members (24 on ledger)

Abraham Udom, Adedayo Tolani, Clement Aribisala, Gbanju Aruwayo-Obe, Kelvin Amede, Lolu Adanri, Mutiu Saliu, Olugbenga Shofela, Oluwabiyi Omotuyole, Taiwo Embassey, Yinka Daramola, Yomi Salami, Iyioluwa Olaoye, Oladimeji Eboda, Akili Tcha Bindi, Ejiro Awhotu, Noghayin Idele, Idris Anaisah, Sonia Udom, Oluwatosin Ogunbowale, Titilope Saliu, Oluwatosin Omotuyole, Kehinde Agboola, Olawale George

**Profiles missing:** Olawale George, Kehinde Agboola (no WPForms row)

---

## 3. Architecture (for agents)

### Production (live — June 2026)

```
Members/Admin browser
        │
        ▼
┌───────────────────┐      proxy /api/*       ┌────────────────────────────┐
│ Netlify           │ ───────────────────────► │ Render (Node/Express)      │
│ peer-finance-     │                          │ peer-finance-manager.      │
│ manager.netlify   │                          │ onrender.com               │
│ .app              │                          │ SQLite: /var/data/         │
│ Static UI only    │                          │ organizations/{slug}/      │
└───────────────────┘                          └────────────────────────────┘
        │                                                  ▲
        │                                                  │ Admin → Import /
        │                                                  │ Maintenance
        │                                          ┌───────┴────────┐
        │                                          │ Coop admin UI  │
        └─ publish: git push ──► GitHub ──────────┘ (browser only) │
```

| Layer | Config files |
|-------|----------------|
| Netlify | `netlify.toml`, `RENDER_API_URL` env var |
| Render | `render.yaml`, `PFM_DATA_DIR=/var/data`, Puppeteer Chrome at build |
| Local PC | `PeerFinanceManager.exe`, `data/` folder |

**Publish code:** `git push` → auto-deploy both services. See [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md).  
**Publish data:** **Admin → Import** (ledger) or **Admin → Maintenance** (backup/restore). Browser only.

### Local development

**Assurance Cooperative Manager** (`PeerFinanceManager.exe` / port **3457**) is the one app:

- Members, profiles, ledger, imports, loans
- **Statements tab** — PDF generation via `peer-finance-manager/lib/statement-routes.js` → root `lib/statement-generator.js`

The old standalone server on port 3456 is legacy (`npm run statements:legacy-server`). `generator.html` redirects to 3457.

```
Excel workbook ──► statement-generator.js ──► PDFs (Statements tab)
       │
       └──► import-spreadsheet.js ──► SQLite (same app)

Bank CSV + All deposits.xlsx ──► parse-bank-sources.js ──► import-bank-ledger.js ──► SQLite
       │
       └──► bank-statement-parser.js ──► compare scripts / month PDF pipelines
```

### Critical files — read these first

| Priority | File | Why |
|----------|------|-----|
| 1 | `lib/statement-generator.js` | All statement logic, balance edge cases, PDF HTML |
| 2 | `peer-finance-manager/lib/import-spreadsheet.js` | How workbook maps to ledger |
| 3 | `peer-finance-manager/lib/import-bank-ledger.js` | Bank CSV + xlsx → ledger transactions |
| 4 | `peer-finance-manager/lib/parse-bank-sources.js` | Merges BoA CSV with All deposits.xlsx |
| 5 | `peer-finance-manager/lib/ledger-import-audit.js` | Pre-import proxy/type warnings on Bank Ledger Import |
| 6 | `peer-finance-manager/lib/cooperative-meeting-service.js` | Per-tenant meeting schedule, announce, reminders |
| 7 | `lib/bank-statement-parser.js` | BoA CSV + Narrative + name aliases (statements/compare) |
| 8 | `peer-finance-manager/lib/member-name-match.js` | Application ↔ ledger names; proxy Zelle beneficiary |
| 9 | `peer-finance-manager/lib/member-self-service.js` | Member portal profile, photo, emergency contact |
| 10 | `peer-finance-manager/db/schema.sql` | DB shape |

### Ports

- **3457** — **Assurance Cooperative Manager** — `npm start` or double-click **`PeerFinanceManager.exe`**
- **3456** — Legacy statement-only server (`npm run statements:legacy-server`) — deprecated

**Exe locations:** `PeerFinanceManager.exe` (project root) and `peer-finance-manager/dist/PeerFinanceManager.exe`. Rebuild with `npm run pfm:build`. Build copies `lib/statement-generator.js` and `styles.css` beside the exe for PDF generation.

### npm scripts reference

```powershell
npm start                  # Assurance Cooperative Manager (port 3457)
npm run pfm                # Same as npm start
npm run pfm:seed           # Ledger from spreadsheet
npm run pfm:profiles       # WPForms → profiles
npm run pfm:import-bank    # Bank CSV + xlsx → ledger (real dates)
npm run generate:may-2026  # Bank + workbook → May PDFs
npm run compare:bank       # Workbook vs bank CSV
npm run pfm:build          # Package PFM as .exe
npm run statements:legacy-server  # Deprecated port 3456 only
```

---

## FlexxForms integration (PFM ↔ FlexxForms)

### How PFM embeds application forms (permanent)

| Item | Value |
|------|--------|
| Host pages | `/c/{slug}/apply`, legacy `/?apply={slug}`, member loan apply, login membership apply |
| Embed method | `/c/{slug}/apply?from=about\|bylaws` embeds FlexxForms via `mountFlexxFormsEmbed`; on **completed**, redirects to origin page with one-time thank-you flash (not persistent). Full-window FlexxForms link remains as fallback. `publicApplyUrl` = `/c/{slug}/apply`. Webhook unchanged. Member login apply still uses embed on `membershipApplyScreen`. |
| Form ids | Per Cooperative in registry `organizations`: `membership_form_id`, `loan_form_id`, guarantor/borrower master doc ids |
| Webhook | `POST https://peer-finance-manager.onrender.com/api/flexxforms/webhook` (HMAC, unchanged) |
| Provision | `POST /platform/workspaces/ensure` on org register; admin assigns ids in **Forms & Documents** |

**Never show on public cooperative apply:** PlacementExpress branding, "Back to deal", or deal/document chrome. That is a FlexxForms platform bug if `/p/{formId}` still shows it.

### Canonical message to FlexxForms (customize incident; give user in one code block)

Use this skeleton when drafting for the user. Replace `[INCIDENT]` and add form ids if helpful. Assurance example id: `8d5e2b33-922e-4044-ad5c-6fe8bb0473d5`.

```
Subject: Peer Finance Manager — public cooperative form embed (multi-tenant)

Hi FlexxForms team,

Peer Finance Manager (PFM) embeds your forms for many member-owned Cooperatives (multi-tenant). Each Cooperative has its own FlexxForms workspace and form ids (membership, loan, guarantor/borrower documents). We are still onboarding additional Cooperatives; the requirements below apply to every workspace we provision, not only one form.

[INCIDENT: e.g. PlacementExpress / "Back to deal" chrome on /p/{formId}; duplicate embed; submit button no response; address fields not in webhook.]

PFM host (example): https://peer-finance-manager.netlify.app/c/{cooperativeSlug}/apply
PFM embed (permanent): iframe src = https://flexxforms.netlify.app/p/{membershipFormId}
  — No query params, no embed.js, no /embed path on public cooperative apply pages.
  — Parent page listens for flexxforms:resize, flexxforms:completed, flexxforms:error postMessages.

Webhook (unchanged): POST https://peer-finance-manager.onrender.com/api/flexxforms/webhook

Platform requirements (all Cooperatives):

1. GET /p/{formId} with no query params must render a clean public respondent form only: no PlacementExpress header, no "Back to deal", no "Document: …" deal shell.
2. Membership and loan application forms published for PFM workspaces must be standalone public forms, not PlacementExpress deal documents (unless you provide a dedicated public mode).
3. If embed.js is recommended for resize/submit: support data-form-path="p" WITHOUT appending ?embed=1, OR add data-embed-mode="public" that never loads deal/partner chrome.
4. form.submitted webhook must fire for every successful public submit; formSubmissionId in postMessage must match webhook submissionId.
5. Webhook and integrations API must include **answers[]** with `fieldIndex`, `label`, `value` (and `partKey` for name/address parts). PFM uses lowest name `fieldIndex` = applicant, second = next of kin. Do not rely on generic `firstName`/`lastName` keys in `data`.
6. Integrations API (Bearer tenant apiKey): `GET /api/integrations/forms/{formId}/submissions/{submissionId}`; list fallback `GET /api/integrations/forms/{formId}/submissions?limit=50`. Paths `/integrations/submissions/{id}` and `/integrations/form-submissions/{id}` do not exist.
7. Mobile submit, validation feedback ("Submitting…", visible errors), and address sub-fields (city, state, zip, country) must work inside cross-origin iframes on peer-finance-manager.netlify.app.

Example (Assurance Cooperative, slug assurance):
  membership_form_id: 8d5e2b33-922e-4044-ad5c-6fe8bb0473d5
  public test URL: https://flexxforms.netlify.app/p/8d5e2b33-922e-4044-ad5c-6fe8bb0473d5

Please confirm the platform fix applies to all PFM-provisioned workspaces and future orgs, not a one-off patch for Assurance.

Thanks,
[Your name]
Peer Finance Manager / Assurance Cooperative
```

---

## 4. Outstanding tasks (prioritized)

### High — operational / product

| # | Task | Notes |
|---|------|-------|
| 1 | **Load active loans** | Framework exists; bank activity documented. User to provide schedules. |
| 2 | **Cooperative expenses** | Table exists; no UI/import. |
| 3 | **Profile for Kehinde Agboola** | Olawale George added (WPForms row + local import). Kehinde still has no application row. |
| 4 | ~~**Restore app import file from golden master**~~ | ✅ **Done** 2026-07-09 — Render **457 / $16,241.55**. |
| 4b | ~~**Fix auto-sync clobber**~~ | ✅ **Done** — xlsx never auto-overwritten; CSV sync cloud-only (§1B). |
| 4d | ~~**Bank append product mode (all tenants)**~~ | ✅ **Done** 2026-07-09 — opening + ending blocks, Default Type on payment aliases, apply button disabled when blocked, `npm run test:bank-append`. See §1B. **Deploy:** `git push`. |
| 4f | ~~**Bank Reconcile Status (all tenants)**~~ | ✅ **Done** 2026-07-11 — anchor on successful import; Cooperative Books card + `/api/health`; `npm run test:bank-reconcile`. **Deploy:** `git push`; re-import once per tenant to set anchor. |
| 4g | ~~**Eliminate WinSCP routine dependency**~~ | ✅ **Done** 2026-07-11 — **Admin → Maintenance**. |
| 4h | ~~**Zero WinSCP (complete)**~~ | ✅ **Done** 2026-07-11 — Removed all WinSCP/SFTP/break-glass workflows from docs and UI copy. Replacement: **Admin → Maintenance** (backup/restore) + **Import**; first-time = Register + optional Restore. Automated off-disk backups remain task **4i**. |
| 4i | **Automated off-disk backups (S3/R2)** | Nightly registry + all `organizations/*`. Complements browser Maintenance backups for SaaS DR. |
| 4j | **Gate public org registration** | Invite/approval + CAPTCHA + rate limits on `POST /api/auth/register-organization`. |
| 4k | **Remove hardcoded platform/admin passwords** | `platform-auth-service` defaults; `ensureAssuranceAdminUser` forced password. Env-only secrets. |
| 4l | **Per-tenant email FROM** | Store smtp_from / smtp_from_name on registry org; stop global Assurance branding. |
| 4m | **Disk headroom + idle DB LRU** | Raise `render.yaml` disk; alert usage; evict idle `dbByOrg` handles. |
| 4n | **Layman import UX** | Single Import Bank Statement path; onboarding wizard; stop Assurance `SEED_ALIASES` on empty tenants. |
| 4o | ~~**Loan Payment Policy (flexible vs strict)**~~ | ✅ **Done** 2026-07-11 — Toggle on Loans tab; snapshot per loan; late fee default $25; `npm run test:loan-policy`. |
| 4c | **PC ↔ cloud bank ledger** | Monthly: **Import New Bank Activity** only. Full rebuild: **Full Ledger Refresh**. Ops: `restore-ledger-production.js --org <slug>`. |
| 4e | ~~**Yomi Salami Nov 2025 split (Saheed bank alias)**~~ | ✅ **Done by Coop Admin** 2026-07-12 — Split saved on live; balance **$16,241.55** unchanged; row count 457→458 (expected). Reconcile row-align after classification added so Out of Sync does not false-alarm. |
| 4p | ~~**Loan Payment Policy deploy**~~ | ✅ **Done** 2026-07-12 — Deployed with N-way split reconcile align + download notice. Default flexible; no effect on existing loans. |
| 4q | ~~**Membership status by type (resign/death/expel/suspend)**~~ | ✅ **Done** 2026-07-16 — Typed status; hide from active list; keep ledger; block all active benefits; PDF/image notice upload; dashboard active count. `npm run test:membership-status`. **Deploy:** `git push`. |
| 4r | ~~**Member portal Apply for a Loan (end-to-end)**~~ | ✅ **Done** 2026-07-17 — Assign Loan Form Id; webhook → Loan Applications list; admin approve creates loan (2 guarantors). Guarantor/borrower e-sign docs remain separate (existing Loans tab agreements). **Deploy:** `git push`. |
| 4s | ~~**Cooperative inbox messaging (all tenants)**~~ | ✅ **Done** 2026-07-17 — Inbox + unread; **rich Word-paste composer** + modern UI + attachments. Deployed `409dbb3`. |
| 4t | ~~**Admin nag + Messages notice on new membership application**~~ | ✅ **Done** 2026-07-18 — Forms tab flash + banner; system notice in admin Messages; optional email tip. **Deployed** 2026-07-19. |
| 5 | ~~**Wire bank import into Import tab UI**~~ | ✅ Done — **Import New Bank Activity** (append) + **Full Ledger Refresh** (advanced). APIs: `POST /api/bank-import/append/preview`, `append/apply`, `run`. |
| 6 | ~~**Persist Title Case in database (backfill)**~~ | ✅ **Done** 2026-07-11 — **Admin → Maintenance → Normalize Profiles** on production (or CLI with `--org`). Display/save formatters already live. |
| 7 | **Reprocess July 6 Assurance membership application** | FlexxForms shipped `answers[]` + GET submission API. PFM parser updated locally (`flexxforms-membership-service.js`, `flexxforms-service.js`). **Deploy** (`git push`), then Admin → Forms & Documents → Membership Applications → **Reprocess Data** on kept test row. Confirm applicant (not Mia Testy), email, address. Do not Approve until correct. New submits should work from webhook automatically. |
| 8 | ~~**Finish email notifications (Bluehost relay)**~~ | ✅ Relays live (`emailConfigured: true`; admin confirmed meeting send to 25). Keep **[BLUEHOST-EMAIL-RELAY-SETUP.md](BLUEHOST-EMAIL-RELAY-SETUP.md)** for ops. **Email Send Audit** now available on Meetings tab for on-demand verification. |

### High — user said they will provide info later

| # | Task | Notes |
|---|------|-------|
| 9 | **Member photos** | Admin and member upload supported; most members still on placeholder SVG. |

### Medium — operational

| # | Task | Notes |
|---|------|-------|
| 8 | **June 2026 statements** | Bank CSV has June deposits (partial month). Generalize `generate-may-2026-from-bank.js` → month argument. |
| 9 | **April distribution on statements** | May statements use February distribution column (workbook fallback). Confirm when amounts finalized. |
| 10 | **January 2026 verification** | Workbook has Jan 2026 column; bank CSV starts 2 Feb 2026. |
| 11 | **Regenerate April PDFs** | After distribution layout fix, April folder may have old layout if not re-run. |
| 12 | **Spreadsheet import placeholder dates** | `pfm:seed` still uses last-day-of-month; bank-imported txs have real dates. |
| 13 | **Currency display consistency** | Statements use NGN; PFM UI uses USD formatter. Cosmetic unless user wants one currency. |
| 14 | **Verify PDF statements on production** | Member monthly download after Puppeteer Chrome deploy. |

### Low — engineering hygiene

| # | Task | Notes |
|---|------|-------|
| 15 | **Unify bank parsers** | Root `bank-statement-parser.js` vs PFM `parse-bank-sources.js` overlap. |
| 16 | **PFM bank-import tests** | `scripts/test-ledger-import-audit.js` covers proxy + contribution-type checks; expand as needed. |
| 17 | **Rebuild PFM exe** | After schema/profile/UI changes. |
| 18 | **Ejiro / withdrawal regression** | Always verify Ejiro balance when touching `statement-generator.js`. |

---

## 5. Known issues & gotchas

1. **Wrong May column** — Workbook has May columns for 2023–2026. Always match **year row + month header** (May 2026 = column index **46** on current sheets). Do not use `indexOf('May')` alone.

2. **Bank narrative errors** — Three April-ish mislabels documented in compare script output. Never blindly sum all `Member Deposit` rows without description checks.

3. **Proxy Zelle deposits** — `from X for Y` must credit **Y**, not X (e.g. Yinka for Ejiro/Titilope). Import auto-fixes via `member-name-match.js`; Admin → Import shows **Ledger warnings** if still wrong. After `git push`, re-import corrected `cooperative-bank-ledger-reference.xlsx`.

4. **Gbanju 4/20/2026** — ₦434.34 loan repayment mislabeled `Member Deposit` in bank file.

5. **Oluwabiyi 3/16 and 4/10** — ₦443.55 loan payments mislabeled `Member Deposit`. Mar 2026 **$100.13** was also mis-tagged `loan_repayment` in master ledger (fixed to `deposit`).

6. **Two Oluwatosin members** — `Oluwatosin Omotuyole` vs `Oluwatosin Ogunbowale`; bank alias patterns disambiguate.

7. **Sonia Udom CSV row** — First name `Sonia`, last name `Abraham Udom`; mapped to ledger `Sonia Udom`.

8. **Akili spelling** — Application `Tcha Binidi` → ledger `Akili Tcha Bindi`.

9. **`replaceExisting: true` on spreadsheet import** — Wipes ledger. Profiles survive in `member_profiles` table but re-link only if members re-imported with same names.

10. **Puppeteer** — Requires Chrome or Edge on Windows. Worker runs in separate process (`scripts/run-generation-worker.js`).

11. **Timezone date display** — `YYYY-MM-DD` strings parsed as `new Date('2026-06-08')` show one day early in US time zones. Fixed in `formatDate()` / `formatDisplayDate()` by parsing as local calendar date. Verify after any new date formatting code.

12. **User rules** — Do not git commit unless asked. Use `gh` for PRs. Real shell environment.

13. **Documentation** — `.cursor/rules/continuous-documentation.mdc` is `alwaysApply: true`. Update docs in the **same turn** as every change. Read `AGENT_HANDOVER.md` first every session. The user must never need to ask for doc updates.

14. **Assurance bank ledger auto-sync** — On **cloud**, CSV export syncs from DB after imports (xlsx is never auto-overwritten). On **local PC**, CSV sync is **off** unless `PFM_LEDGER_CSV_SYNC=1` so a stale dev DB cannot overwrite `cooperative-bank-ledger-reference.csv`. See **§1B**.

15. **Dashboard Current Bank Balance** — Uses `checking_balance` setting if set, else **ledger sum** from DB (`getLedgerEndingBalance`). Preview balance-check fix (`cd5e05d`) only changes Import **warning text**; it does **not** fix DB or xlsx. Production drift = incomplete Full Ledger Refresh or post-reconcile corruption.

---

## 6. Verification checklist (after changes)

```powershell
# Ledger + profiles
npm run pfm:seed
npm run pfm:profiles
npm run pfm:import-bank   # After updating bank CSV / All deposits.xlsx

# Reconciliation
npm run compare:bank
node peer-finance-manager/scripts/test-ledger-import-audit.js

# Statements
npm run generate:may-2026
# Manually spot-check: Ejiro ($991.00 contributions), Yinka ($2,430.98), proxy warnings clear on Import tab

# Apps start
npm start   # → http://localhost:3457 (Assurance Cooperative Manager)
```

---

## 7. User communication context

- User is building this incrementally; **loans, expenses, and unclear items** will be provided later.
- User confirmed **regular member deposits** can be tracked now with workbook + bank CSV + Narrative column.
- User cares about **statement presentation** (distribution placement was explicitly corrected).
- **Assurance Status 4 2026** is authoritative through April 2026 end.
- Transcript of full build history: `.cursor/projects/.../agent-transcripts/0476ec24-f606-4198-a323-74c9b1aec2c6/0476ec24-f606-4198-a323-74c9b1aec2c6.jsonl`

---

## 8. Suggested next session plan

1. **Restore golden ledger** per §1A (`rebuild-ledger-from-bank.js` + verify **453 / $15,471.49**) → Admin → **Full Ledger Refresh**
2. Fix **auto-sync clobber** in `cooperative-bank-ledger-csv.js` before more ledger edits
3. July monthly: **Import New Bank Activity** with `stmt (7).csv` (append only, after step 1)
4. Import loan records + schedules when user provides data
5. Profile for Kehinde Agboola if application supplied

---

## 9. UI copy conventions (user-mandated)

Documented in `.cursor/rules/ui-copy-standards.mdc`. Apply to all new or edited user-facing text.

1. **Title Case** — Headers, paragraph hints, labels, buttons, badges, and section titles use Title Case (e.g. `Cooperative Books`, `Import Profiles`, `On File`). **Do not capitalize** 2–3 letter words (`in`, `and`, `for`, `to`, `is`, etc.) unless first or last in the heading. Always capitalize **Cooperative** when referring to the member-owned organization.

2. **Slash compounds — no spaces** — When joining terms with `/`, do not space around the slash:
   - `Contributions Account/Loan Account` (not `Contributions Account / Loan Account`)
   - `Distribution/Interest`, `Zelle/Bank`, `Members/Profiles`, `22/24`
   - Same rule on PDF statement labels (e.g. `Interest/Distribution`)

---

## 10. Contact points in codebase (quick grep targets)

| Looking for… | Search / file |
|--------------|---------------|
| Balance logic | `hasStatementWithdrawal` in `statement-generator.js` |
| Distribution column | `distributionColIndex` in `statement-generator.js` |
| Name aliases (bank) | `MEMBER_BANK_ALIASES` in `bank-statement-parser.js` |
| Name aliases (applications) | `APPLICATION_TO_LEDGER` in `member-name-match.js` |
| Loan rules | `peer-finance-manager/lib/constants.js` |
| Date formatting (UI) | `formatDate` in `peer-finance-manager/public/app.js` |
| Date formatting (PDF) | `formatDisplayDate` in `loan-statement-generator.js` |
| Member self-service | `peer-finance-manager/lib/member-self-service.js` |
| Bank ledger import | `peer-finance-manager/lib/import-bank-ledger.js` |
| Master ledger auto-sync (danger) | `peer-finance-manager/lib/cooperative-bank-ledger-csv.js` — see §1A |
| Golden rebuild script | `peer-finance-manager/scripts/rebuild-ledger-from-bank.js` |
| Ledger vs stmt audit | `peer-finance-manager/scripts/audit-bank-ledger-discrepancy.js` |
| CD dashboard | `peer-finance-manager/lib/cooperative-books.js`, `cd-balance-service.js` |
| DB tables | `peer-finance-manager/db/schema.sql` |

---

*End of handover. UI copy: `.cursor/rules/ui-copy-standards.mdc`. Continuous docs: `.cursor/rules/continuous-documentation.mdc` (always apply).*

**User docs:** [USER-GUIDE.md](./USER-GUIDE.md) · **Publish updates:** [UPDATE-AND-PUBLISH.md](./UPDATE-AND-PUBLISH.md) · **Technical:** [README.md](./README.md)
