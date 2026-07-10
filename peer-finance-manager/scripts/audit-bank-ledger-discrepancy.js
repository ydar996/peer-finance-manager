#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { parseReferenceLedgerXlsx, parseStmtCsv } = require("../lib/parse-bank-sources");

const stmt5 = process.argv[2] || "C:/Users/yinka/Downloads/stmt (5).csv";
const bankFull =
  process.argv[3] || path.join(__dirname, "../../data/bank-statement-2026.csv");
const ledgerXlsx =
  process.argv[4] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.xlsx");

function parseMoney(value) {
  return Number(String(value || "").replace(/,/g, "").replace(/"/g, ""));
}

function readSummary(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/).slice(0, 6)) {
    if (!line.trim()) continue;
    const m = line.match(/^([^,]+),,?("?)([\d,.]+)\2/);
    if (!m) continue;
    const label = m[1].trim();
    const amt = parseMoney(m[3]);
    if (label.includes("Beginning")) out.beginning = amt;
    if (label.includes("Ending")) out.ending = amt;
    if (label.includes("Total credits")) out.credits = amt;
    if (label.includes("Total debits")) out.debits = amt;
  }
  return out;
}

function fuzzyKey(tx) {
  const conf = (tx.description || "").match(/conf#?\s*([a-z0-9]+)/i);
  if (conf) return `${tx.date}|${tx.amount}|${conf[1].toLowerCase()}`;
  const check = (tx.description || "").match(/check\s*(\d+)/i);
  if (check) return `${tx.date}|${tx.amount}|check${check[1]}`;
  return `${tx.date}|${tx.amount}|${String(tx.description || "").slice(0, 30)}`;
}

function sumTxs(txs) {
  return Math.round(txs.reduce((s, t) => s + t.amount, 0) * 100) / 100;
}

function runningBalance(txs) {
  let bal = 0;
  for (const tx of txs) bal = Math.round((bal + tx.amount) * 100) / 100;
  return bal;
}

const s5Summary = readSummary(stmt5);
const bankSummary = readSummary(bankFull);
const ledger = parseReferenceLedgerXlsx(ledgerXlsx, []);
const bankFullTxs = parseStmtCsv(bankFull, []);
const stmt5Txs = parseStmtCsv(stmt5, []);
const bankKeys = new Set(bankFullTxs.map(fuzzyKey));

console.log("=== SUMMARY BALANCES ===");
console.log("Bank stmt (5):", s5Summary);
console.log("Bank full CSV:", bankSummary);
console.log("Ledger raw computed balance:", runningBalance(ledger).toFixed(2));

const xxxxxRows = ledger.filter((tx) => /XXXXX/i.test(tx.description || ""));
console.log("\n=== PHANTOM DUPLICATE ROWS (masked XXXXX CO ID) ===");
for (const tx of xxxxxRows) {
  console.log(`${tx.date}  ${tx.amount.toFixed(2)}  ${(tx.description || "").slice(0, 72)}`);
}
console.log(`Count: ${xxxxxRows.length}  Sum: ${sumTxs(xxxxxRows).toFixed(2)}`);

const cleaned = ledger.filter((tx) => !/XXXXX/i.test(tx.description || ""));
const cleanedBal = runningBalance(cleaned);
console.log("\n=== AFTER REMOVING XXXXX DUPLICATES ===");
console.log("Cleaned ledger balance:", cleanedBal.toFixed(2));
console.log("Bank stmt (5) ending:", s5Summary.ending?.toFixed(2));
console.log("Gap (cleaned - bank):", (cleanedBal - (s5Summary.ending || 0)).toFixed(2));

const preJuneClean = cleaned.filter((t) => t.date < "2026-06-01");
console.log("\nCleaned ledger through May:", runningBalance(preJuneClean).toFixed(2));
console.log("Bank beginning 05/30:", s5Summary.beginning?.toFixed(2));
console.log(
  "Pre-June gap:",
  (runningBalance(preJuneClean) - (s5Summary.beginning || 0)).toFixed(2)
);

const badDates = cleaned.filter((tx) => !/^\d{4}-\d{2}-\d{2}$/.test(tx.date));
console.log("\n=== BAD / EXCEL SERIAL DATES IN LEDGER ===");
for (const tx of badDates) {
  console.log(`date=${tx.date}  ${tx.amount.toFixed(2)}  ${(tx.description || "").slice(0, 65)}`);
}

const cleanedKeys = new Set(cleaned.map(fuzzyKey));
const missingFromLedger = bankFullTxs.filter((tx) => !cleanedKeys.has(fuzzyKey(tx)));
console.log("\n=== IN BANK CSV BUT NOT IN CLEANED LEDGER ===");
for (const tx of missingFromLedger) {
  console.log(`${tx.date}  ${tx.amount.toFixed(2)}  ${tx.ledgerType}  ${(tx.description || "").slice(0, 65)}`);
}
console.log("Missing sum:", sumTxs(missingFromLedger).toFixed(2));

const extraInLedger = cleaned.filter(
  (tx) => !bankKeys.has(fuzzyKey(tx)) && tx.date >= "2026-01-01"
);
console.log("\n=== IN CLEANED LEDGER BUT NOT IN BANK CSV (2026+) ===");
for (const tx of extraInLedger) {
  console.log(`${tx.date}  ${tx.amount.toFixed(2)}  ${tx.ledgerType}  ${(tx.description || "").slice(0, 65)}`);
}
console.log("Extra sum:", sumTxs(extraInLedger).toFixed(2));

console.log("\n=== JUNE 2026 COMPARISON ===");
const juneBank = stmt5Txs;
const juneLedger = cleaned.filter((t) => t.date >= "2026-06-01" && t.date <= "2026-06-30");
console.log("June bank txs:", juneBank.length, "sum", sumTxs(juneBank).toFixed(2));
console.log("June ledger txs:", juneLedger.length, "sum", sumTxs(juneLedger).toFixed(2));

const juneBankKeys = new Set(juneBank.map(fuzzyKey));
const juneOnlyBank = juneBank.filter((tx) => !new Set(juneLedger.map(fuzzyKey)).has(fuzzyKey(tx)));
const juneOnlyLedger = juneLedger.filter((tx) => !juneBankKeys.has(fuzzyKey(tx)));
console.log("June only in bank:", juneOnlyBank.map((t) => `${t.date} ${t.amount}`).join(", ") || "none");
console.log("June only in ledger:", juneOnlyLedger.map((t) => `${t.date} ${t.amount}`).join(", ") || "none");

console.log("\n=== ROOT CAUSE ===");
console.log(
  `Ledger exceeds bank by $${(runningBalance(ledger) - (s5Summary.ending || 0)).toFixed(2)}.`
);
console.log(
  `Removing ${xxxxxRows.length} phantom XXXXX duplicate rows ($${sumTxs(xxxxxRows).toFixed(2)}) fixes most of the gap.`
);
if (missingFromLedger.length) {
  console.log(
    `Bank has ${missingFromLedger.length} transaction(s) not yet in ledger ($${sumTxs(missingFromLedger).toFixed(2)}).`
  );
}
