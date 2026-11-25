#!/usr/bin/env node
/**
 * Generates a fake bank statement (xlsx) for the canary demo org, shaped so the
 * Import tab parses it cleanly: a summary block (Beginning/Ending Balance),
 * a transactions table with Tran Date/Narration/Debit/Credit/Balance, member
 * deposit narrations that resolve to real canary members, and debits that hit
 * the expense keywords so every row classifies without manual fixes.
 *
 * Opening balance = the cooperative's stored reconcile anchor, so the ending
 * balance reconciles exactly once all rows import.
 *
 * Usage: node scripts/make-demo-statement.js <canary.db> <out.xlsx> [endDate YYYY-MM-DD]
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const XLSX = require("xlsx");

const SRC = process.argv[2];
const OUT = process.argv[3];
const END_DATE = process.argv[4] || "2026-11-25";
if (!SRC || !OUT) {
  console.error("Usage: node scripts/make-demo-statement.js <canary.db> <out.xlsx> [endDate YYYY-MM-DD]");
  process.exit(1);
}

const db = new Database(SRC, { readonly: true });

const account = db
  .prepare("SELECT * FROM bank_accounts WHERE is_primary = 1 LIMIT 1")
  .get() || db.prepare("SELECT * FROM bank_accounts ORDER BY id LIMIT 1").get();
const bank = String(account.institution_name || "UBA").toUpperCase();
const acctLabel = account.account_label || `${bank} Account`;
const acctNumber = account.account_number || "";

const members = db
  .prepare("SELECT name FROM members ORDER BY id")
  .all()
  .map((r) => r.name);

const getSetting = (key) =>
  db.prepare("SELECT value FROM cooperative_settings WHERE key = ?").get(key)?.value ?? null;

// Opening balance: the verified reconcile anchor when present, else the live
// ledger balance at the last transaction date.
let opening = Number(getSetting("bank_reconcile_balance"));
let startDate = String(getSetting("bank_reconcile_as_of") || "");
const lastTx = db.prepare("SELECT MAX(transaction_date) d FROM transactions").get().d;
if (!Number.isFinite(opening)) {
  const row = db
    .prepare("SELECT ROUND(SUM(amount), 2) s FROM transactions WHERE transaction_date <= ?")
    .get(lastTx);
  opening = Number(row.s || 0);
  startDate = lastTx;
}
if (lastTx && lastTx > startDate) startDate = lastTx;

const start = new Date(`${startDate}T00:00:00Z`);
start.setUTCDate(start.getUTCDate() + 1);
const end = new Date(`${END_DATE}T00:00:00Z`);
if (!(start < end)) {
  throw new Error(`Start ${startDate} + 1 is not before end ${END_DATE}`);
}
const days = Math.round((end - start) / 86400000);

const upper = (s) => String(s).toUpperCase();
const dmy = (d) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

// A spread of realistic credit narrations matching the cooperative's own
// statement wording, each naming a real member so import resolves them.
const depositTemplates = [
  (m) => `NIP CR/${bank}/${upper(m)}/MONTHLY CONTRIBUTION`,
  (m) => `INWARD TRANSFER FROM ${bank}/ ${upper(m)}-Savings deposit`,
  (m) => `BY TRANSFER-NIP CR/${bank}/${upper(m)}/CANARY COOP SAVINGS`,
  (m) => `MOBILE TRF CR ${upper(m)} ${bank}/MONTHLY SAVINGS`,
  (m) => `NIP CR/${bank}/${upper(m)}/MONTHLY CONTRIBUTION`,
];
// Debit narrations all contain an expense keyword so they classify as expenses.
const expenseTemplates = [
  "MONTHLY ACCOUNT MAINTENANCE FEE",
  "SERVICE FEE - SMS ALERT CHARGES",
  `BANK FEE - NIP TRANSFER COMMISSION`,
  "SERVICE FEE - CHEQUE BOOK ISSUE",
  "MAINTENANCE FEE - E-BANKING CHANNELS",
];

const m = (i) => members[i % members.length];

// [offsetDaysFromStart, narration, debit, credit]
const plan = [
  [0, depositTemplates[0](m(0)), 0, 87500],
  [1, depositTemplates[1](m(1)), 0, 131250],
  [2, expenseTemplates[0], 1312.5, 0],
  [3, depositTemplates[2](m(4)), 0, 262500],
  [6, expenseTemplates[1], 1575, 0],
  [7, `INWARD TRANSFER FROM ${bank}/ ${upper(m(8))}-Membership Fee`, 0, 252220.5],
  [8, depositTemplates[3](m(10)), 0, 105000],
  [9, expenseTemplates[2], 4375, 0],
  [10, depositTemplates[1](m(12)), 0, 175000],
  [11, depositTemplates[4](m(14)), 0, 525000],
  [13, expenseTemplates[3], 2625, 0],
  [14, depositTemplates[2](m(16)), 0, 96250],
  [14, expenseTemplates[4], 1837.5, 0],
];

// Spread rows over the window even if start/end move.
const span = days - 1;
const scale = span >= plan[plan.length - 1][0] ? 1 : span / plan[plan.length - 1][0];

let balance = opening;
const txRows = [];
let credits = 0;
let debits = 0;
for (const [offset, narration, debit, credit] of plan) {
  const d = new Date(start.getTime() + Math.round(offset * scale) * 86400000);
  if (d > end) continue;
  balance += credit - debit;
  credits += credit;
  debits += debit;
  txRows.push([dmy(d), dmy(d), narration, debit || "", credit || "", Math.round(balance * 100) / 100]);
}
// Last row must land on the statement end date for a clean "as of end" reconcile.
if (txRows.length && txRows[txRows.length - 1][0] !== dmy(end)) {
  txRows[txRows.length - 1][0] = dmy(end);
  txRows[txRows.length - 1][1] = dmy(end);
}

const end2dp = Math.round(balance * 100) / 100;
const aoa = [
  [`${bank === "UBA" ? "UNITED BANK FOR AFRICA (UBA)" : `${bank} BANK`}`],
  [`Account Statement: ${acctLabel} ${acctNumber}`],
  ["Canary Demo Cooperative"],
  [`Statement Period: ${dmy(start)} - ${dmy(end)}`],
  ["Beginning Balance", opening],
  ["Total Credits", Math.round(credits * 100) / 100],
  ["Total Debits", Math.round(debits * 100) / 100],
  ["Ending Balance", end2dp],
  [],
  ["Tran Date", "Value Date", "Narration", "Debit", "Credit", "Balance"],
  ...txRows,
];

const ws = XLSX.utils.aoa_to_sheet(aoa);
ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 62 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Transactions");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
XLSX.writeFile(wb, OUT);

console.log(`Wrote ${OUT}`);
console.log(`Account: ${acctLabel} (${acctNumber}) | opening ${opening.toLocaleString()} -> ending ${end2dp.toLocaleString()}`);
console.log(`Rows: ${txRows.length} | credits ${credits.toLocaleString()} | debits ${debits.toLocaleString()}`);
console.log(`Members used: ${[m(0), m(1), m(4), m(8), m(10), m(12), m(14), m(16)].join(", ")}`);
