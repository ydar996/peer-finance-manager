#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const {
  parseBankStatementCsv,
  aggregateMemberActivity,
  NARRATIVE,
} = require("../lib/bank-statement-parser");
const { generateStatements } = require("../lib/statement-generator");

const ROOT = path.join(__dirname, "..");
const bankCsv =
  process.argv[2] || path.join(__dirname, "..", "data", "bank-statement-2026.csv");
const sourceWorkbook =
  process.argv[3] || path.join(ROOT, "Assurance Status 4 2026.xlsx");
const sourceSheet = "April 2026";
const targetWorkbook = path.join(ROOT, "Assurance Status 5 2026.xlsx");
const targetSheet = "May 2026";
const statementYear = 2026;
const statementMonth = 5;

function findMayColumn(headerRow, yearRow) {
  for (let i = 0; i < headerRow.length; i++) {
    if (headerRow[i] === "May" && Number(yearRow[i]) === statementYear) {
      return i;
    }
  }
  return -1;
}

function prepareMayWorkbook(memberDeposits) {
  const wb = XLSX.readFile(sourceWorkbook);
  const ws = wb.Sheets[sourceSheet];
  if (!ws) throw new Error(`Source sheet ${sourceSheet} not found`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const yearRow = rows[0] || [];
  const headerRow = rows[1] || [];
  const mayCol = findMayColumn(headerRow, yearRow);
  if (mayCol < 0) throw new Error("May 2026 column not found in source workbook");

  const totalIdx = headerRow.indexOf("Total Deposits");
  const regIdx = headerRow.indexOf("Registration Income");
  const balIdx = headerRow.indexOf("Account Balance");

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[0] || typeof row[0] !== "string") continue;
    if (row[0].toLowerCase() === "total") continue;

    const name = row[0].trim();
    const mayAmount = memberDeposits[name] || 0;
    const prevMay = Number(row[mayCol]) || 0;
    const delta = mayAmount - prevMay;

    row[mayCol] = mayAmount || null;
    if (delta !== 0) {
      row[totalIdx] = (Number(row[totalIdx]) || 0) + delta;
      row[balIdx] = row[totalIdx] + (Number(row[regIdx]) || 0);
    }
  }

  const newWs = XLSX.utils.aoa_to_sheet(rows);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, newWs, targetSheet);
  XLSX.writeFile(outWb, targetWorkbook);
  return targetWorkbook;
}

async function main() {
  if (!fs.existsSync(bankCsv)) {
    throw new Error(`Bank CSV not found: ${bankCsv}`);
  }
  if (!fs.existsSync(sourceWorkbook)) {
    throw new Error(`Source workbook not found: ${sourceWorkbook}`);
  }

  const wb = XLSX.readFile(sourceWorkbook);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sourceSheet], {
    header: 1,
    defval: null,
  });
  const memberNames = rows
    .slice(2)
    .filter((r) => r && r[0] && typeof r[0] === "string" && r[0].toLowerCase() !== "total")
    .map((r) => String(r[0]).trim());

  const transactions = parseBankStatementCsv(bankCsv, memberNames);
  const { totals: mayDeposits, details } = aggregateMemberActivity(
    transactions,
    statementYear,
    statementMonth,
    NARRATIVE.MEMBER_DEPOSIT
  );

  console.log("May 2026 member deposits from bank statement:");
  Object.entries(mayDeposits)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, amt]) => {
      const dates = (details[name] || []).map((t) => t.date.iso).join(", ");
      console.log(`  ${name}: ${amt.toFixed(2)} (${dates})`);
    });

  const unmatched = transactions.filter(
    (t) =>
      t.date.year === statementYear &&
      t.date.month === statementMonth &&
      t.narrative === NARRATIVE.MEMBER_DEPOSIT &&
      !t.member
  );
  if (unmatched.length) {
    console.warn("\nUnmatched May deposits (review manually):");
    unmatched.forEach((t) =>
      console.warn(`  ${t.date.iso} ${t.amount} — ${t.description}`)
    );
  }

  const workbookPath = prepareMayWorkbook(mayDeposits);
  console.log(`\nPrepared workbook: ${workbookPath}`);

  const result = await generateStatements({
    workbookPath,
    sheetName: targetSheet,
    baseDir: ROOT,
  });

  console.log(`\nGenerated ${result.count} statements in ${result.outputDir}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
