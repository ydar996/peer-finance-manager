# Saheed Loan 1: System State (Coop Admin Splits)

**Member:** **Yomi Salami** (bank alias `SAHEED SALAMI`).

---

## What the App Does (Not the Coop Admin)

- Imports the **full $600** Nov 6, 2025 bank deposit as **Loan Repayment** (one row, unchanged until you act).
- Books Loan 1 interest at **$263.18** when the agreed schedule is on file and payoff is complete.
- Enables **Split** and **Reclassify** on the **$600** bank row.

**The app does not split or reclassify this payment for you.** No agent script should add a **$196.82** deposit or save a ledger adjustment unless **you** do it in the admin UI.

---

## What the Coop Admin Does

When ready, use **Members & Accounts → Yomi Salami → Loan Account** and **Split** the **11/6/2025 $600** row per your cooperative records (your worksheet: part loan payoff, part November contribution).

Only the Coop Admin decides the split lines and clicks **Save Split**.

---

## Verified Ledger State (Local DB)

- **11/6/2025:** one `bank_import` row, **$600**, type **loan_repayment**
- **No** `ledger_adjustments` split saved for that date

---

## Do Not Use for This Fix

`peer-finance-manager/scripts/fix-march-2026-reconciliation.js` inserts a manual **$196.82** deposit for Yomi. That bypasses the Coop Admin **Split** workflow. Do not run it for Saheed/Yomi Loan 1.
