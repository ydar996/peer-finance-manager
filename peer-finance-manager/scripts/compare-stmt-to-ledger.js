#!/usr/bin/env node
/** Compare BoA stmt CSV against master ledger xlsx and live DB. */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { initPaths } = require("../lib/paths");
initPaths(path.join(__dirname, ".."));

const stmtPath =
  process.argv[2] || path.join(__dirname, "../../data/bank-statement-2026.csv");
const xlsxPath =
  process.argv[3] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.xlsx");
const org = process.argv[4] || "assurance";

function parseMoney(value) {
  return Number(String(value || "").replace(/,/g, "").replace(/"/g, ""));
}

function readStmtSummary(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/).slice(0, 8)) {
    if (!line.trim()) continue;
    const m = line.match(/^([^,]+),,?("?)([\d,.-]+)\2/);
    if (!m) continue;
    const label = m[1].trim();
    const amt = parseMoney(m[3]);
    if (/Beginning/i.test(label)) out.beginning = amt;
    if (/Ending/i.test(label)) out.ending = amt;
    if (/Total credits/i.test(label)) out.credits = amt;
    if (/Total debits/i.test(label)) out.debits = amt;
  }
  return out;
}

function parseStmtRows(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Date,Description,Amount")) {
      start = i + 1;
      break;
    }
  }
  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = [];
    let cur = "";
    let inQ = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    const dateUs = parts[0];
    if (!dateUs || /beginning balance/i.test(parts[1] || "")) continue;
    const amount = parseMoney(parts[2]);
    if (!Number.isFinite(amount)) continue;
    const [m, d, y] = dateUs.split("/").map(Number);
    const dateIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    rows.push({
      dateIso,
      dateUs,
      amount,
      running: parseMoney(parts[3]),
      description: parts[1] || "",
    });
  }
  return rows;
}

function stmtKey(row) {
  const conf = String(row.description || "").match(/conf#?\s*([a-z0-9]+)/i);
  if (conf) return `${row.dateIso}|${row.amount.toFixed(2)}|${conf[1].toLowerCase()}`;
  const check = String(row.description || "").match(/check\s*(\d+)/i);
  if (check) return `${row.dateIso}|${row.amount.toFixed(2)}|check${check[1]}`;
  const mobile = String(row.description || "").match(/MOBILE\s+\d{2}\/\d{2}\s+(\d+)/i);
  if (mobile) return `${row.dateIso}|${row.amount.toFixed(2)}|mobile${mobile[1]}`;
  return `${row.dateIso}|${row.amount.toFixed(2)}|${String(row.description || "").slice(0, 40).toLowerCase()}`;
}

function loadXlsxRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row) => {
      const amount = Number(row.Amount);
      if (!Number.isFinite(amount)) return null;
      let dateIso = String(row["ISO Date"] || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) && row.Date) {
        const [m, d, y] = String(row.Date).split("/").map(Number);
        dateIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
      return {
        dateIso,
        amount,
        description: String(row.Description || ""),
        member: String(row.Member || ""),
      };
    })
    .filter(Boolean);
}

function xlsxKey(row) {
  const conf = String(row.description || "").match(/conf#?\s*([a-z0-9]+)/i);
  if (conf) return `${row.dateIso}|${row.amount.toFixed(2)}|${conf[1].toLowerCase()}`;
  const check = String(row.description || "").match(/check\s*(\d+)/i);
  if (check) return `${row.dateIso}|${row.amount.toFixed(2)}|check${check[1]}`;
  return `${row.dateIso}|${row.amount.toFixed(2)}|${String(row.description || "").slice(0, 40).toLowerCase()}`;
}

function sumRows(rows) {
  return Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
}

const summary = readStmtSummary(stmtPath);
const stmtRows = parseStmtRows(stmtPath);
const xlsxRows = loadXlsxRows(xlsxPath);

const stmtSince2025 = stmtRows.filter((r) => r.dateIso >= "2025-01-01");
const xlsxSince2025 = xlsxRows.filter((r) => r.dateIso >= "2025-01-01");

const stmtKeys = new Set(stmtSince2025.map(stmtKey));
const xlsxKeys = new Set(xlsxSince2025.map(xlsxKey));

const inStmtNotXlsx = stmtSince2025.filter((r) => !xlsxKeys.has(stmtKey(r)));
const inXlsxNotStmt = xlsxSince2025.filter((r) => !stmtKeys.has(xlsxKey(r)));

console.log("=== BANK STATEMENT SUMMARY ===");
console.log(stmtPath);
console.log(summary);
console.log("Stmt tx rows (excl. beginning):", stmtRows.length);
console.log("Stmt computed sum of amounts:", sumRows(stmtRows).toFixed(2));

console.log("\n=== MASTER XLSX ===");
console.log("Xlsx rows:", xlsxRows.length, "sum:", sumRows(xlsxRows).toFixed(2));

console.log("\n=== SINCE 2025-01-01 ===");
console.log("Stmt rows:", stmtSince2025.length, "sum:", sumRows(stmtSince2025).toFixed(2));
console.log("Xlsx rows:", xlsxSince2025.length, "sum:", sumRows(xlsxSince2025).toFixed(2));

console.log("\nIn stmt but NOT in xlsx (since 2025):", inStmtNotXlsx.length);
for (const r of inStmtNotXlsx.slice(0, 20)) {
  console.log(`  ${r.dateIso}  ${r.amount.toFixed(2)}  ${r.description.slice(0, 65)}`);
}
if (inStmtNotXlsx.length > 20) console.log(`  ... and ${inStmtNotXlsx.length - 20} more`);

console.log("\nIn xlsx but NOT in stmt (since 2025):", inXlsxNotStmt.length);
for (const r of inXlsxNotStmt.slice(0, 20)) {
  console.log(`  ${r.dateIso}  ${r.amount.toFixed(2)}  ${r.member}  ${r.description.slice(0, 55)}`);
}
if (inXlsxNotStmt.length > 20) console.log(`  ... and ${inXlsxNotStmt.length - 20} more`);

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, getDb } = require("../db/database");
const { getLedgerEndingBalance } = require("../lib/cooperative-bank-ledger-csv");

runWithOrg(org, () => {
  openOrgDatabase(org);
  const db = getDb();
  const dbSum = db
    .prepare(
      `SELECT ROUND(SUM(amount),2) AS total, COUNT(*) AS n
       FROM transactions WHERE source IN ('bank_import','manual')`
    )
    .get();
  const ledger = getLedgerEndingBalance("2026-06-30");
  console.log("\n=== LIVE DATABASE ===");
  console.log("DB rows:", dbSum.n, "sum:", dbSum.total);
  console.log("Ledger ending through 6/30:", ledger?.balance, ledger?.asOf);
  console.log("Gap vs bank stmt ending:", ((summary.ending || 0) - (ledger?.balance || 0)).toFixed(2));
});
