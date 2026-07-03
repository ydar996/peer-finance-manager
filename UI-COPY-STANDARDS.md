# UI Copy Standards

Rules for all **user-facing text** in the app: headers, hints, labels, buttons, table headers, status messages, PDF statements, and book detail screens.

Agents and developers should follow this document and `.cursor/rules/ui-copy-standards.mdc` when changing the UI.

**Agents:** Follow [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) §0 and `.cursor/rules/continuous-documentation.mdc`. Document every change in the **same turn** — the user must never have to ask for doc updates.

---

## Title Case

Use **Title Case** for headers, paragraph hints, form labels, buttons, badges, and section titles.

**Small words (2–3 letters)** stay lowercase unless they are the first or last word of the heading: e.g. `a`, `an`, `the`, `and`, `but`, `or`, `for`, `nor`, `on`, `at`, `to`, `by`, `in`, `of`, `is`, `as`, `if`, `up`.

| Wrong | Right |
|-------|-------|
| Cooperative books | Cooperative Books |
| Each Cooperative Is Isolated And Secure | Each Cooperative is Isolated and Secure |
| Simple Plans For Every Cooperative | Simple Plans for Every Cooperative |
| Deposit account | Contributions Account |
| Import profiles | Import Profiles |
| On file | On File |

**Cooperative** (the member-owned organization) is always capitalized when referring to the entity: `Cooperative`, `Cooperatives`, `Your Cooperative`, not `cooperative` / `cooperatives`.

This applies on **every user-facing surface** (all tenants): static UI, API error messages, emails, PDF reports, and public About/Bylaws HTML. Runtime enforcement uses `capitalizeCooperativeWording()` in `lib/text-format.js` (public page sanitize/save, API `error` JSON). Filenames such as `cooperative-bank-ledger-reference.csv` stay lowercase.

## Full-Width Headings and Leads

Do **not** put artificial `max-width` on headings, section titles, hints, or lead paragraphs. They use the full content column and wrap only when the viewport is actually too narrow. Form fields and login cards may still use layout `max-width`.

---

## Slash Compounds (No Spaces)

When joining terms with a slash, **do not** put spaces around `/`.

| Wrong | Right |
|-------|-------|
| Contributions Account / Loan Account | Contributions Account/Loan Account |
| Distribution / Interest | Distribution/Interest |
| Zelle / Bank | Zelle/Bank |
| Members / Profiles | Members/Profiles |
| 22 / 24 | 22/24 |

---

## Em Dashes (Forbidden)

**Never use em dashes** (`—`) in user-facing app copy.

Use a **colon** (`:`) instead for clause breaks and separators.

| Wrong | Right |
|-------|-------|
| Cooperative Asset Management — Member Contributions Accounts | Cooperative Asset Management: Member Contributions Accounts |
| None — Use Distribution Column | None: Use Distribution Column |
| Done — 24 PDFs saved | Done: 24 PDFs saved |
| Empty table cell — | : |

**Where this applies:**
- `peer-finance-manager/public/index.html`
- `peer-finance-manager/public/app.js`
- `peer-finance-manager/public/product.html`
- `peer-finance-manager/public/cooperative-public.html`
- `peer-finance-manager/lib/loan-statement-generator.js`
- `peer-finance-manager/lib/cooperative-books.js`
- Any new UI strings or PDF labels

**En dashes** (`–`) are also forbidden in user-facing copy. Use a colon, or a normal hyphen (`-`) only when spelling a compound word or filename (e.g. `peer-finance-manager`).

---

## Cooperative Wording (Not "Banking")

When referring to the **cooperative** or **organizations using the app**, do not use the word **Banking**.

| Wrong | Right |
|-------|-------|
| Cooperative Banking | Cooperative Asset Management |
| Banking Profiles | Profiles (or Member Profiles) |

Use **Contribution** (not Deposit) for money received from members. Use **Contributions Account** (not Deposit Account) for the member ledger account.

**OK to keep "Bank"** when it means **Bank of America** or **Zelle/Bank** payment details (external bank, not the cooperative).

**Keep "Certificate of Deposit"** when referring to the cooperative's CD investment at Bank of America.

---

*Last updated: July 3, 2026*
