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

function parseStmt(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  const hi = lines.findIndex((l) => /^Date,Description/i.test(l));
  const rows = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const m = String(cols[0]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) continue;
    const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    const amount = Number(String(cols[2]).replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;
    rows.push({ date: iso, description: cols[1], amount });
  }
  return rows;
}

function key(row, mode) {
  const desc = mode === "x" ? row.Description : row.description;
  const conf = (String(desc).match(/conf#?\s*([a-z0-9]+)/i) || [])[1] || "";
  const date = mode === "x" ? row["ISO Date"] : row.date;
  const amt = Number(mode === "x" ? row.Amount : row.amount).toFixed(2);
  if (conf) return `${date}|${amt}|${conf.toLowerCase()}`;
  const check = String(desc).match(/check\s*(\d+)/i);
  if (check) return `${date}|${amt}|check${check[1]}`;
  return `${date}|${amt}|${String(desc).slice(0, 48).toLowerCase()}`;
}

const xrows = XLSX.utils
  .sheet_to_json(
    XLSX.readFile("C:/Users/yinka/Documents/AssurCoop/data/cooperative-bank-ledger-reference.xlsx")
      .Sheets["Cooperative Bank Ledger"],
    { defval: "" }
  )
  .filter((r) => r["ISO Date"] >= "2025-01-01");

const stmt = parseStmt("C:/Users/yinka/Downloads/stmt (6).csv");
const xMap = new Map(xrows.map((r) => [key(r, "x"), r]));
const sMap = new Map(stmt.map((r) => [key(r, "s"), r]));

const onlyX = [];
const onlyS = [];
for (const [k, r] of xMap) if (!sMap.has(k)) onlyX.push(r);
for (const [k, r] of sMap) if (!xMap.has(k)) onlyS.push(r);

console.log("2025+ only in XLSX:", onlyX.length, "sum", onlyX.reduce((s, r) => s + Number(r.Amount), 0).toFixed(2));
onlyX.forEach((r) =>
  console.log(" +X", r["ISO Date"], r.Amount, r["Ledger Type"], String(r.Description).slice(0, 65))
);
console.log("\n2025+ only in STMT:", onlyS.length, "sum", onlyS.reduce((s, r) => s + r.amount, 0).toFixed(2));
onlyS.forEach((r) => console.log(" -S", r.date, r.amount, String(r.description).slice(0, 65)));
