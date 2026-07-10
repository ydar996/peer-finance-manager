const XLSX = require("xlsx");
const fs = require("fs");

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function parseStmtCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex((l) => /^Date,Description/i.test(l));
  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 3) continue;
    const m = String(cols[0]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) continue;
    const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    const amount = Number(String(cols[2]).replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;
    rows.push({
      date: iso,
      description: cols[1],
      amount,
      runningBalance: Number(String(cols[3] || "").replace(/,/g, "")),
    });
  }
  return rows;
}

function rowKey(row, mode) {
  const desc = mode === "xlsx" ? row.Description : row.description;
  const conf = (String(desc).match(/conf#?\s*([a-z0-9]+)/i) || [])[1] || "";
  const date = mode === "xlsx" ? row["ISO Date"] : row.date;
  const amount = Number(mode === "xlsx" ? row.Amount : row.amount).toFixed(2);
  if (conf) return `${date}|${amount}|${conf.toLowerCase()}`;
  const check = String(desc).match(/check\s*(\d+)/i);
  if (check) return `${date}|${amount}|check${check[1]}`;
  return `${date}|${amount}|${String(desc).slice(0, 48).toLowerCase()}`;
}

const xlsxPath = "C:/Users/yinka/Documents/AssurCoop/data/cooperative-bank-ledger-reference.xlsx";
const stmtPath = "C:/Users/yinka/Downloads/stmt (6).csv";
const csvPath = "C:/Users/yinka/Documents/AssurCoop/data/cooperative-bank-ledger-reference.csv";

const wb = XLSX.readFile(xlsxPath);
const xrows = XLSX.utils
  .sheet_to_json(wb.Sheets["Cooperative Bank Ledger"], { defval: "" })
  .filter((r) => r["ISO Date"]);

const stmt = parseStmtCsv(stmtPath);

console.log("=== ENDING BALANCES ===");
console.log("XLSX:", xrows.length, "rows,", "last", xrows[xrows.length - 1]["ISO Date"], "bal", xrows[xrows.length - 1]["Running Balance"]);
console.log("STMT:", stmt.length, "rows,", "last", stmt[stmt.length - 1].date, "bal", stmt[stmt.length - 1].runningBalance);
console.log("Gap:", (xrows[xrows.length - 1]["Running Balance"] - stmt[stmt.length - 1].runningBalance).toFixed(2));

console.log("\n=== OLUWABIYI 2026 (XLSX) ===");
xrows
  .filter((r) => String(r.Member).includes("Oluwabiyi") && String(r["ISO Date"]).startsWith("2026"))
  .forEach((r) =>
    console.log(r["ISO Date"], r.Amount, r["Ledger Type"] || r.Narrative, String(r.Description).slice(0, 55))
  );

const xMap = new Map();
const sMap = new Map();
for (const r of xrows) xMap.set(rowKey(r, "xlsx"), r);
for (const r of stmt) sMap.set(rowKey(r, "stmt"), r);

const onlyX = [];
const onlyS = [];
for (const [k, r] of xMap) if (!sMap.has(k)) onlyX.push(r);
for (const [k, r] of sMap) if (!xMap.has(k)) onlyS.push(r);

console.log("\n=== ONLY IN XLSX (not in stmt 6) ===", onlyX.length);
onlyX.forEach((r) =>
  console.log("+", r["ISO Date"], r.Amount, r["Ledger Type"] || r.Narrative, String(r.Description).slice(0, 60))
);

console.log("\n=== ONLY IN STMT (not in xlsx) ===", onlyS.length);
onlyS.forEach((r) =>
  console.log("-", r.date, r.amount, String(r.description).slice(0, 60))
);

console.log("\n=== ONLY-IN-XLSX SUM ===", onlyX.reduce((s, r) => s + Number(r.Amount), 0).toFixed(2));
console.log("=== ONLY-IN-STMT SUM ===", onlyS.reduce((s, r) => s + Number(r.amount), 0).toFixed(2));

// Find first date where running balances diverge for matching conf keys
let firstDiverge = null;
for (const r of stmt) {
  const k = rowKey(r, "stmt");
  const x = xMap.get(k);
  if (!x) continue;
  const xBal = Number(x["Running Balance"]);
  const sBal = Number(r.runningBalance);
  if (Math.abs(xBal - sBal) > 0.02) {
    firstDiverge = { key: k, stmtBal: sBal, xlsxBal: xBal, date: r.date, amount: r.amount };
    break;
  }
}
console.log("\n=== FIRST RUNNING-BALANCE DIVERGENCE (matched row) ===");
console.log(firstDiverge);

// Compare pre-2025 portion
const xPre2025 = xrows.filter((r) => String(r["ISO Date"]) < "2025-01-01");
const sPre2025 = stmt.filter((r) => r.date < "2025-01-01");
console.log("\n=== PRE-2025 ===");
console.log("XLSX pre-2025 rows:", xPre2025.length, "sum", xPre2025.reduce((s, r) => s + Number(r.Amount), 0).toFixed(2));
console.log("STMT starts 2025-01-01 only, no pre-2025");

if (fs.existsSync(csvPath)) {
  const { parseBankStatementCsv } = require("../../lib/bank-statement-parser");
  const csvTx = parseBankStatementCsv(csvPath, []);
  console.log("\n=== LOCAL CSV ===");
  console.log("CSV tx count:", csvTx.length);
  const oluCsv = csvTx.filter(
    (t) =>
      (t.member || "").includes("Oluwabiyi") &&
      t.date.iso.startsWith("2026") &&
      (Math.abs(t.amount - 443.55) < 0.01 || Math.abs(t.amount - 100.13) < 0.01)
  );
  oluCsv.forEach((t) => console.log(" CSV", t.date.iso, t.amount, t.narrative));
}
