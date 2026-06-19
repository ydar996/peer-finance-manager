# UI Copy Standards

Rules for all **user-facing text** in the app: headers, hints, labels, buttons, table headers, status messages, PDF statements, and book detail screens.

Agents and developers should follow this document and `.cursor/rules/ui-copy-standards.mdc` when changing the UI.

**Agents:** Also follow [AGENT_HANDOVER.md](./AGENT_HANDOVER.md) §0 — document every change and outstanding task immediately for the next agent.

---

## Title Case

Use **Title Case** for headers, paragraph hints, form labels, buttons, badges, and section titles.

| Wrong | Right |
|-------|-------|
| Cooperative books | Cooperative Books |
| Deposit account | Contributions Account |
| Import profiles | Import Profiles |
| On file | On File |

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

*Last updated: June 19, 2026*
