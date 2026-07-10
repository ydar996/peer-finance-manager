#!/usr/bin/env node
/**
 * Build Assurance reference ledger = golden master through 6/29 + July stmt rows.
 *
 * Usage:
 *   node scripts/build-assurance-reference-with-july.js
 *   node scripts/build-assurance-reference-with-july.js "C:\Users\yinka\Downloads\stmt (8).csv"
 *   node scripts/build-assurance-reference-with-july.js [stmt.csv] [out.xlsx]
 *
 * Saheed 7/8 $500 must be Loan Repayment (Yomi Salami), not Member Deposit from stmt text.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { initPaths } = require("../lib/paths");
const { runWithOrg } = require("../lib/org-context");
const { ASSURANCE_SLUG } = require("../lib/organization-service");
const { getDb } = require("../db/database");
const {
  finalizeExportRows,
  writeWorkbook,
  TYPE_TO_NARRATIVE,
} = require("../lib/cooperative-bank-ledger-csv");
const {
  resolveLedgerMemberName,
  resolveDepositMemberFromDescription,
} = require("../lib/member-name-match");

initPaths(path.join(__dirname, "..", ".."));

const coopRoot = path.join(__dirname, "..", "..");
const masterPath = path.join(
  coopRoot,
  "data",
  "master-ledger",
  "cooperative-bank-ledger-master.xlsx"
);
const defaultStmt = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Downloads",
  "stmt (8).csv"
);

const stmtPath = process.argv[2] || defaultStmt;
const outPath =
  process.argv[3] ||
  path.join(coopRoot, "data", "cooperative-bank-ledger-reference.xlsx");

const GOLDEN_THROUGH = "2026-06-29";
const GOLDEN_ENDING = 15471.49;
const EXPECTED_ROWS = 457;
const EXPECTED_ENDING = 16241.55;

/** Bank text overrides stmt auto-classification. */
const ROW_OVERRIDES = [
  {
    test: (row) => row.dateIso === "2026-07-08" && /SAHEED SALAMI/i.test(row.description),
    ledgerType: "loan_repayment",
    memberName: "Yomi Salami",
  },
];

function isoToUs(iso) {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function parseMoney(value) {
  const n = Number(String(value || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseStmtSummary(text) {
  const lines = text.split(/\r?\n/);
  let beginning = null;
  let ending = null;
  for (const line of lines) {
    if (/^Beginning balance/i.test(line)) beginning = parseMoney(line.split(",")[2]);
    if (/^Ending balance/i.test(line)) ending = parseMoney(line.split(",")[2]);
  }
  return { beginning, ending };
}

function parseStmtTransactions(text, memberNames) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!/^\d{2}\/\d{2}\/\d{4},/.test(line)) continue;
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
    if (parts.length < 3) continue;
    const dateUs = parts[0].trim();
    const description = parts[1].trim();
    const amount = parseMoney(parts[2]);
    if (!dateUs || amount == null || amount === 0) continue;
    const [m, d, y] = dateUs.split("/").map(Number);
    const dateIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dateIso <= GOLDEN_THROUGH) continue;

    let memberName =
      resolveDepositMemberFromDescription(description, memberNames) ||
      resolveLedgerMemberName(description, memberNames);
    let ledgerType = /loan/i.test(description) ? "loan_repayment" : "deposit";

    const row = { dateIso, description, amount, memberName, ledgerType };
    for (const override of ROW_OVERRIDES) {
      if (override.test(row)) {
        row.ledgerType = override.ledgerType;
        row.memberName = override.memberName;
      }
    }
    rows.push(row);
  }
  return rows;
}

function loadMasterRows() {
  const wb = XLSX.readFile(masterPath);
  const sheet = wb.Sheets["Cooperative Bank Ledger"];
  if (!sheet) throw new Error("Cooperative Bank Ledger sheet missing in master");
  const raw = XLSX.utils.sheet_to_json(sheet);
  return raw.map((row, i) => ({
    index: i + 1,
    dateIso: String(row["ISO Date"] || "").slice(0, 10),
    dateUs: row.Date || isoToUs(String(row["ISO Date"] || "").slice(0, 10)),
    memberName: row.Member || "",
    description: String(row.Description || ""),
    amount: Number(row.Amount),
    runningBalance: 0,
    narrative: row.Narrative || TYPE_TO_NARRATIVE[row["Ledger Type"]] || row["Ledger Type"],
    ledgerType: row["Ledger Type"],
    source: row.Source || "bank_import",
  }));
}

runWithOrg(ASSURANCE_SLUG, () => {
  if (!fs.existsSync(masterPath)) {
    throw new Error(`Master not found: ${masterPath}`);
  }
  if (!fs.existsSync(stmtPath)) {
    throw new Error(`Statement not found: ${stmtPath}`);
  }

  const db = getDb();
  const memberNames = db.prepare(`SELECT name FROM members ORDER BY name`).all().map((r) => r.name);

  const base = loadMasterRows();
  const lastBase = base[base.length - 1];
  if (base.length !== 453) {
    throw new Error(`Master row count ${base.length}; expected 453`);
  }
  if (Math.abs((lastBase?.runningBalance || 0) - GOLDEN_ENDING) > 0.02 && lastBase) {
    const exportBase = finalizeExportRows(base);
    const ending = exportBase[exportBase.length - 1]?.runningBalance;
    if (Math.abs(ending - GOLDEN_ENDING) > 0.02) {
      throw new Error(`Master ending ${ending}; expected ${GOLDEN_ENDING}`);
    }
  }

  const stmtText = fs.readFileSync(stmtPath, "utf8");
  const summary = parseStmtSummary(stmtText);
  if (summary.beginning != null && Math.abs(summary.beginning - GOLDEN_ENDING) > 0.02) {
    throw new Error(
      `Stmt beginning ${summary.beginning} does not match master ending ${GOLDEN_ENDING}`
    );
  }

  const julySource = parseStmtTransactions(stmtText, memberNames);
  const july = julySource.map((row, i) => ({
    index: base.length + i + 1,
    dateIso: row.dateIso,
    dateUs: isoToUs(row.dateIso),
    memberName: row.memberName || "",
    description: row.description,
    amount: row.amount,
    runningBalance: 0,
    narrative: TYPE_TO_NARRATIVE[row.ledgerType] || row.ledgerType,
    ledgerType: row.ledgerType,
    source: "bank_import",
  }));

  const exportRows = finalizeExportRows([...base, ...july]);
  writeWorkbook(exportRows, outPath);
  const last = exportRows[exportRows.length - 1];

  if (exportRows.length !== EXPECTED_ROWS) {
    throw new Error(`Built ${exportRows.length} rows; expected ${EXPECTED_ROWS}`);
  }
  if (Math.abs(last.runningBalance - EXPECTED_ENDING) > 0.02) {
    throw new Error(`Built ending ${last.runningBalance}; expected ${EXPECTED_ENDING}`);
  }
  if (summary.ending != null && Math.abs(summary.ending - last.runningBalance) > 0.02) {
    throw new Error(`Stmt ending ${summary.ending} != built ${last.runningBalance}`);
  }

  console.log("Wrote", outPath);
  console.log("Master rows:", base.length, "July rows:", july.length, "Total:", exportRows.length);
  console.log("Ending:", last.runningBalance, "through", last.dateIso);
  console.log("Stmt:", stmtPath);
  if (summary.ending != null) console.log("Stmt ending verified:", summary.ending);
  const saheed = exportRows.find((r) =>
    r.dateIso === "2026-07-08" && /SAHEED SALAMI/i.test(r.description)
  );
  console.log(
    "Saheed 7/8:",
    saheed?.ledgerType,
    saheed?.narrative,
    "member",
    saheed?.memberName
  );
});
