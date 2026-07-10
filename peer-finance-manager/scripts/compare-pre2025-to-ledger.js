#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const pre2025Path = process.argv[2] || "C:/Users/yinka/Downloads/pre 2025.xlsx";
const ledgerCsv =
  process.argv[3] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.csv");

function excelDateToIso(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86400000).toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function parsePre2025Xlsx(filePath) {
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  return rows
    .map((row) => {
      const desc = String(row.Description || "").trim();
      if (!desc || /beginning balance/i.test(desc)) return null;
      const amount = Number(String(row.Amount || "").replace(/,/g, ""));
      if (!Number.isFinite(amount)) return null;
      const dateIso = excelDateToIso(row.Date);
      if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
      return {
        dateIso,
        amount,
        running: Number(String(row["Running Balance"] || "").replace(/,/g, "")),
        description: desc,
        member: String(row.Depositor || row.Depositor_1 || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.amount - b.amount);
}

function parseLedgerCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
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
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    const amount = Number(String(parts[2] || "").replace(/,/g, ""));
    if (!parts[0] || !Number.isFinite(amount)) continue;
    const [m, d, y] = parts[0].split("/").map(Number);
    const dateIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    rows.push({
      dateIso,
      amount,
      running: Number(String(parts[3] || "").replace(/,/g, "")),
      description: parts[1] || "",
      member: parts[4] || "",
    });
  }
  return rows;
}

function rowKey(row) {
  const conf = String(row.description || "").match(/conf#?\s*([a-z0-9]+)/i);
  if (conf) return `${row.dateIso}|${row.amount.toFixed(2)}|${conf[1].toLowerCase()}`;
  const check = String(row.description || "").match(/check\s*(\d+)/i);
  if (check) return `${row.dateIso}|${row.amount.toFixed(2)}|check${check[1]}`;
  return `${row.dateIso}|${row.amount.toFixed(2)}|${String(row.description || "").slice(0, 45).toLowerCase()}`;
}

const pre = parsePre2025Xlsx(pre2025Path);
const ledger = parseLedgerCsv(ledgerCsv).filter((r) => r.dateIso < "2025-01-01");

const preKeys = new Set(pre.map(rowKey));
const ledgerKeys = new Set(ledger.map(rowKey));

const missingFromLedger = pre.filter((r) => !ledgerKeys.has(rowKey(r)));
const extraInLedger = ledger.filter((r) => !preKeys.has(rowKey(r)));

const preSum = Math.round(pre.reduce((s, r) => s + r.amount, 0) * 100) / 100;
const ledgerSum = Math.round(ledger.reduce((s, r) => s + r.amount, 0) * 100) / 100;

console.log("=== PRE-2025 BANK EXTRACT ===");
console.log("File:", pre2025Path);
console.log("Rows:", pre.length);
console.log("Sum of amounts:", preSum.toFixed(2));
console.log("Ending running balance:", pre.at(-1)?.running?.toFixed(2), "on", pre.at(-1)?.dateIso);

console.log("\n=== COOPERATIVE LEDGER (before 2025) ===");
console.log("Rows:", ledger.length);
console.log("Sum of amounts:", ledgerSum.toFixed(2));
console.log("Ending running balance:", ledger.at(-1)?.running?.toFixed(2), "on", ledger.at(-1)?.dateIso);

console.log("\nGap (bank extract - ledger):", (preSum - ledgerSum).toFixed(2));
console.log(
  "Running balance gap:",
  ((pre.at(-1)?.running || 0) - (ledger.at(-1)?.running || 0)).toFixed(2)
);

console.log("\nIn bank extract but MISSING from ledger (" + missingFromLedger.length + "):");
for (const r of missingFromLedger) {
  console.log(
    `  ${r.dateIso}  ${r.amount.toFixed(2)}  ${r.member || "(no member)"}  ${r.description.slice(0, 60)}`
  );
}

console.log("\nIn ledger but NOT in bank extract (" + extraInLedger.length + "):");
for (const r of extraInLedger.slice(0, 30)) {
  console.log(
    `  ${r.dateIso}  ${r.amount.toFixed(2)}  ${r.member || "(no member)"}  ${r.description.slice(0, 60)}`
  );
}
if (extraInLedger.length > 30) {
  console.log(`  ... and ${extraInLedger.length - 30} more`);
}
