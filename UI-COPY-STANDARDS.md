# UI Copy Standards

Rules for all **user-facing text** in the app: headers, hints, labels, buttons, table headers, status messages, PDF statements, and book detail screens.

Agents and developers should follow this document and `.cursor/rules/ui-copy-standards.mdc` when changing the UI.

---

## Title Case

Use **Title Case** for headers, paragraph hints, form labels, buttons, badges, and section titles.

| Wrong | Right |
|-------|-------|
| Cooperative books | Cooperative Books |
| Deposit account | Deposit Account |
| Import profiles | Import Profiles |
| On file | On File |

---

## Slash Compounds (No Spaces)

When joining terms with a slash, **do not** put spaces around `/`.

| Wrong | Right |
|-------|-------|
| Deposit Account / Loan Account | Deposit Account/Loan Account |
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
| Cooperative Asset Management — Member Deposit Accounts | Cooperative Asset Management: Member Deposit Accounts |
| None — Use Distribution Column | None: Use Distribution Column |
| Done — 24 PDFs saved | Done: 24 PDFs saved |
| Empty table cell — | : |

**Where this applies:**
- `peer-finance-manager/public/index.html`
- `peer-finance-manager/public/app.js`
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

**OK to keep "Bank"** when it means **Bank of America** or **Zelle/Bank** payment details (external bank, not the cooperative).

---

*Last updated: June 2026*
