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
  let beginning = null;
  let ending = null;
  for (const line of lines.slice(0, 10)) {
    const cols = parseCsvLine(line);
    const label = cols[0] || "";
    const val = Number(String(cols[1] || cols[2] || "").replace(/,/g, "").replace(/"/g, ""));
    if (/beginning/i.test(label) && Number.isFinite(val)) beginning = val;
    if (/ending/i.test(label) && Number.isFinite(val)) ending = val;
  }
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
  return { rows, beginning, ending };
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

const allX = XLSX.utils
  .sheet_to_json(
    XLSX.readFile("C:/Users/yinka/Documents/AssurCoop/data/cooperative-bank-ledger-reference.xlsx")
      .Sheets["Cooperative Bank Ledger"],
    { defval: "" }
  )
  .filter((r) => r["ISO Date"]);

const { rows: stmt, beginning: boaOpen, ending: boaEnd } = parseStmt("C:/Users/yinka/Downloads/stmt (6).csv");
const from2025 = allX.filter((r) => r["ISO Date"] >= "2025-01-01");
const pre2025 = allX.filter((r) => r["ISO Date"] < "2025-01-01");

const stmtSum = stmt.reduce((s, r) => s + r.amount, 0);
const x2025Sum = from2025.reduce((s, r) => s + Number(r.Amount), 0);

console.log("BoA open:", boaOpen, "end:", boaEnd, "stmt tx sum:", stmtSum.toFixed(2));
console.log("BoA net change (end-open):", (boaEnd - boaOpen).toFixed(2));
console.log("Pre-2025 sum:", pre2025.reduce((s, r) => s + Number(r.Amount), 0).toFixed(2), "vs open gap:", (pre2025.reduce((s, r) => s + Number(r.Amount), 0) - boaOpen).toFixed(2));
console.log("2025+ xlsx sum:", x2025Sum.toFixed(2), "vs stmt net:", (boaEnd - boaOpen).toFixed(2), "excess:", (x2025Sum - (boaEnd - boaOpen)).toFixed(2));
console.log("Total gap (xlsx end - boa end):", (allX.reduce((s, r) => s + Number(r.Amount), 0) - boaEnd).toFixed(2));

// Duplicate keys in xlsx 2025+
const keyCounts = new Map();
for (const r of from2025) {
  const k = key(r, "x");
  if (!keyCounts.has(k)) keyCounts.set(k, []);
  keyCounts.get(k).push(r);
}
const dupes = [...keyCounts.entries()].filter(([, arr]) => arr.length > 1);
console.log("\nDuplicate keys in xlsx 2025+:", dupes.length);
dupes.forEach(([k, arr]) => {
  console.log(" DUP", k);
  arr.forEach((r) => console.log("   ", r["ISO Date"], r.Amount, r.Member, String(r.Description).slice(0, 50)));
});

// Stmt keys with multiple xlsx matches (collision)
const sMap = new Map(stmt.map((r) => [key(r, "s"), r]));
const xByKey = new Map();
for (const r of from2025) {
  const k = key(r, "x");
  if (!xByKey.has(k)) xByKey.set(k, []);
  xByKey.get(k).push(r);
}

let extraFromDupes = 0;
for (const [k, arr] of xByKey) {
  if (arr.length > 1 && sMap.has(k)) {
    const extra = arr.slice(1);
    const sum = extra.reduce((s, r) => s + Number(r.Amount), 0);
    extraFromDupes += sum;
    console.log("Matched key with extra xlsx rows:", k, "extra sum", sum.toFixed(2));
    extra.forEach((r) => console.log("   EXTRA", r["ISO Date"], r.Amount, String(r.Description).slice(0, 50)));
  }
}
console.log("Extra from duplicate matched keys:", extraFromDupes.toFixed(2));

// Rows in xlsx 2025+ with no stmt match
const onlyX = from2025.filter((r) => !sMap.has(key(r, "x")));
console.log("\nUnmatched xlsx 2025+ rows:", onlyX.length, "sum", onlyX.reduce((s, r) => s + Number(r.Amount), 0).toFixed(2));
onlyX.forEach((r) => console.log(" +", r["ISO Date"], r.Amount, String(r.Description).slice(0, 60)));

// Rows in stmt with no xlsx match  
const xKeys = new Set(from2025.map((r) => key(r, "x")));
const onlyS = stmt.filter((r) => !xKeys.has(key(r, "s")));
console.log("\nUnmatched stmt rows:", onlyS.length, "sum", onlyS.reduce((s, r) => s + r.amount, 0).toFixed(2));
onlyS.forEach((r) => console.log(" -", r.date, r.amount, String(r.description).slice(0, 60)));

console.log("\nReconciliation:");
console.log("  Pre-2025 shortfall:", (pre2025.reduce((s, r) => s + Number(r.Amount), 0) - boaOpen).toFixed(2));
console.log("  Unmatched xlsx 2025+:", onlyX.reduce((s, r) => s + Number(r.Amount), 0).toFixed(2));
console.log("  Duplicate extras:", extraFromDupes.toFixed(2));
console.log("  Unmatched stmt (should subtract):", onlyS.reduce((s, r) => s + r.amount, 0).toFixed(2));
