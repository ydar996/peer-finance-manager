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
  let beginning = null;
  let ending = null;
  for (const line of lines.slice(0, 8)) {
    if (line.includes("Beginning balance")) {
      beginning = Number(line.split(",")[1]);
    }
    if (line.includes("Ending balance")) {
      ending = Number(line.split(",")[1]);
    }
  }
  const rows = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
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

const xlsxPath = "C:/Users/yinka/Documents/AssurCoop/data/cooperative-bank-ledger-reference.xlsx";
const stmtPath = "C:/Users/yinka/Downloads/stmt (6).csv";

const allX = XLSX.utils
  .sheet_to_json(XLSX.readFile(xlsxPath).Sheets["Cooperative Bank Ledger"], { defval: "" })
  .filter((r) => r["ISO Date"]);

const { rows: stmt, beginning: boaOpen, ending: boaEnd } = parseStmt(stmtPath);

const pre2025 = allX.filter((r) => r["ISO Date"] < "2025-01-01");
const from2025 = allX.filter((r) => r["ISO Date"] >= "2025-01-01");

const preSum = pre2025.reduce((s, r) => s + Number(r.Amount), 0);
const from2025Sum = from2025.reduce((s, r) => s + Number(r.Amount), 0);
const xlsxLastBal = Number(allX[allX.length - 1]["Running Balance"]);

console.log("=== ANCHOR CHECK ===");
console.log("BoA opening 2025-01-01:", boaOpen);
console.log("XLSX pre-2025 rows:", pre2025.length, "sum:", preSum.toFixed(2));
console.log("Pre-2025 sum vs BoA opening gap:", (preSum - boaOpen).toFixed(2));
console.log("If anchor correct: preSum should =", boaOpen);

console.log("\n=== 2025+ SUMS ===");
console.log("XLSX 2025+ tx count:", from2025.length, "sum:", from2025Sum.toFixed(2));
console.log("BoA stmt tx count:", stmt.length, "net change:", (boaEnd - boaOpen).toFixed(2));
console.log("Computed from BoA anchor:", (boaOpen + from2025Sum).toFixed(2), "vs BoA ending", boaEnd);
console.log("2025+ excess in xlsx:", (from2025Sum - (boaEnd - boaOpen)).toFixed(2));

console.log("\n=== RUNNING BALANCE COLUMN ===");
console.log("XLSX last Running Balance col:", xlsxLastBal);
console.log("Sum ALL xlsx amounts (from 0):", allX.reduce((s, r) => s + Number(r.Amount), 0).toFixed(2));
console.log("BoA open + 2025+ sum:", (boaOpen + from2025Sum).toFixed(2));

// 2025+ row-by-row diff
const xMap = new Map(from2025.map((r) => [key(r, "x"), r]));
const sMap = new Map(stmt.map((r) => [key(r, "s"), r]));
const onlyX = [];
const onlyS = [];
for (const [k, r] of xMap) if (!sMap.has(k)) onlyX.push(r);
for (const [k, r] of sMap) if (!xMap.has(k)) onlyS.push(r);

console.log("\n=== 2025+ ONLY IN XLSX ===", onlyX.length, "sum", onlyX.reduce((s, r) => s + Number(r.Amount), 0).toFixed(2));
onlyX.forEach((r) =>
  console.log(" +", r["ISO Date"], r.Amount, r["Ledger Type"], r.Narrative, String(r.Description).slice(0, 55))
);

console.log("\n=== 2025+ ONLY IN STMT ===", onlyS.length, "sum", onlyS.reduce((s, r) => s + r.amount, 0).toFixed(2));
onlyS.forEach((r) => console.log(" -", r.date, r.amount, String(r.description).slice(0, 55)));

// Amount mismatches on same key
const mismatches = [];
for (const [k, sr] of sMap) {
  const xr = xMap.get(k);
  if (!xr) continue;
  if (Math.abs(Number(xr.Amount) - sr.amount) > 0.01) {
    mismatches.push({ key: k, xAmt: xr.Amount, sAmt: sr.amount });
  }
}
console.log("\n=== AMOUNT MISMATCHES (same conf/date key) ===", mismatches.length);
mismatches.forEach((m) => console.log(m));

// Oluwabiyi Ledger Type vs Narrative conflicts
console.log("\n=== OLUWABIYI Ledger Type vs Narrative ===");
allX
  .filter((r) => String(r.Member).includes("Oluwabiyi"))
  .filter((r) => {
    const lt = String(r["Ledger Type"] || "").trim();
    const nar = String(r.Narrative || "").trim();
    if (!lt || !nar) return false;
    const ltNorm = lt === "deposit" ? "Member Deposit" : lt.replace(/_/g, " ");
    return nar !== ltNorm && !(lt === "loan_repayment" && nar === "Loan Repayment") && !(lt === "deposit" && nar === "Member Deposit");
  })
  .forEach((r) =>
    console.log(r["ISO Date"], r.Amount, "LedgerType=", r["Ledger Type"], "Narrative=", r.Narrative)
  );

console.log("\n=== OLUWABIYI $443.55 with Ledger Type=deposit ===");
allX
  .filter(
    (r) =>
      String(r.Member).includes("Oluwabiyi") &&
      Math.abs(Number(r.Amount) - 443.55) < 0.01 &&
      String(r["Ledger Type"]).trim() === "deposit"
  )
  .forEach((r) =>
    console.log(r["ISO Date"], r.Amount, r["Ledger Type"], r.Narrative, String(r.Description).slice(0, 50))
  );
