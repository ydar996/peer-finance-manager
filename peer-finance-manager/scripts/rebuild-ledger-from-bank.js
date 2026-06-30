#!/usr/bin/env node
/**
 * Rebuild cooperative-bank-ledger-reference from an authoritative bank CSV.
 * Uses running-balance fallback when amount column is misparsed (BoA CSV quirk).
 */
const fs = require("fs");
const path = require("path");
const { parseReferenceLedgerXlsx } = require("../lib/parse-bank-sources");
const {
  writeBankStatementCsv,
  sortedReferenceHeaderLines,
  finalizeExportRows,
} = require("../lib/cooperative-bank-ledger-csv");
const { TYPE_TO_NARRATIVE } = require("../lib/cooperative-bank-ledger-csv");
const {
  inferNarrativeFromDescription,
  narrativeToLedgerType,
  resolveLoanDisbursementMember,
} = require("../lib/parse-bank-sources");
const { resolveLedgerMemberName } = require("../lib/member-name-match");
const { runWithOrg } = require("../lib/org-context");
const { getDb } = require("../db/database");

const bankPath =
  process.argv[2] || "C:/Users/yinka/Downloads/stmt (6).csv";
const ledgerPath =
  process.argv[3] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.xlsx");
const outDir = process.argv[4] || path.join(__dirname, "../../data");

function parseMoney(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").replace(/"/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

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

function parseDate(value) {
  const m = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function readBankSummary(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/).slice(0, 6)) {
    if (!line.trim()) continue;
    const m = line.match(/^([^,]+),,?("?)([\d,.-]+)\2/);
    if (!m) continue;
    const label = m[1].trim();
    const amt = parseMoney(m[3]);
    if (label.includes("Beginning")) out.beginning = amt;
    if (label.includes("Ending")) out.ending = amt;
  }
  return out;
}

function parseBankStatementRobust(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const headerIndex = lines.findIndex((l) => /^Date,Description/i.test(l));
  if (headerIndex < 0) throw new Error("Could not find Date,Description header");

  const transactions = [];
  let prevRunning = null;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;

    const dateIso = parseDate(cols[0]);
    if (!dateIso) continue;

    const numericCols = cols
      .map((col, idx) => ({ idx, value: parseMoney(col) }))
      .filter((entry) => entry.value != null);

    const firstNumericIdx =
      numericCols.length >= 2
        ? numericCols[numericCols.length - 2].idx
        : numericCols.length === 1
          ? numericCols[0].idx
          : cols.length;
    const description = cols.slice(1, firstNumericIdx).join(", ").trim() || cols[1] || "";

    if (description.toLowerCase().includes("beginning balance")) {
      prevRunning =
        numericCols.length > 0 ? numericCols[numericCols.length - 1].value : null;
      continue;
    }

    let amount = null;
    let running = null;

    if (numericCols.length >= 2) {
      running = numericCols[numericCols.length - 1].value;
      amount = numericCols[numericCols.length - 2].value;
    } else if (numericCols.length === 1) {
      running = numericCols[0].value;
    }

    if (amount == null && running != null && prevRunning != null) {
      amount = Math.round((running - prevRunning) * 100) / 100;
    }
    if (amount == null) continue;

    if (running == null && prevRunning != null) {
      running = Math.round((prevRunning + amount) * 100) / 100;
    }

    transactions.push({
      date: dateIso,
      description,
      amount,
      runningBalance: running,
    });

    if (running != null) prevRunning = running;
  }

  return transactions;
}

function findPriorLedgerRow(bankTx, existingByKey, existing) {
  const key = fuzzyKey(bankTx);
  if (existingByKey.has(key)) return existingByKey.get(key);
  const conf = (bankTx.description || "").match(/conf#?\s*([a-z0-9]+)/i);
  if (conf) {
    const confKey = conf[1].toLowerCase();
    const match = existing.find(
      (tx) =>
        tx.date === bankTx.date &&
        Math.abs(Number(tx.amount) - Number(bankTx.amount)) < 0.01 &&
        String(tx.description || "").toLowerCase().includes(confKey)
    );
    if (match) return match;
  }
  return existing.find(
    (tx) =>
      tx.date === bankTx.date && Math.abs(Number(tx.amount) - Number(bankTx.amount)) < 0.01
  );
}

function normalizeDescription(description, ledgerType) {
  const text = String(description || "").trim();
  if (ledgerType !== "loan_disbursement") return text;
  const checkMatch = text.match(/check\s*(\d{4})/i);
  return checkMatch ? `Check ${checkMatch[1]}` : text;
}

function resolveMemberForTx({ description, ledgerType, member, memberNames }) {
  if (member) return member;
  if (ledgerType === "loan_disbursement") {
    return resolveLoanDisbursementMember(description, memberNames) || "";
  }
  if (
    ledgerType === "loan_repayment" &&
    /BKOFAMERICA MOBILE/i.test(description)
  ) {
    return (
      resolveLedgerMemberName("Oluwabiyi Omotuyole", memberNames) ||
      "Oluwabiyi Omotuyole"
    );
  }
  return "";
}

function loadMemberNames() {
  let names = [];
  runWithOrg("assurance", () => {
    names = getDb()
      .prepare(`SELECT name FROM members ORDER BY name`)
      .all()
      .map((row) => row.name);
  });
  return names;
}
function classifyBankTx(bankTx, existingByKey, existing, memberNames) {
  const prior = findPriorLedgerRow(bankTx, existingByKey, existing);
  if (prior?.ledgerType) {
    return {
      ledgerType: prior.ledgerType,
      transactionType: prior.transactionType || TYPE_TO_NARRATIVE[prior.ledgerType] || "",
      member: resolveMemberForTx({
        description: bankTx.description,
        ledgerType: prior.ledgerType,
        member: prior.member,
        memberNames,
      }),
    };
  }
  const narrative = inferNarrativeFromDescription(bankTx.description, "");
  let ledgerType = narrativeToLedgerType(narrative);
  if (!ledgerType && /,\s*loan\b/i.test(bankTx.description)) {
    ledgerType = "loan_repayment";
  }
  if (!ledgerType && /BKOFAMERICA MOBILE/i.test(bankTx.description)) {
    ledgerType = "loan_repayment";
  }
  if (!ledgerType) {
    throw new Error(
      `Could not classify: ${bankTx.date} ${bankTx.amount} ${bankTx.description.slice(0, 60)}`
    );
  }
  return {
    ledgerType,
    transactionType: TYPE_TO_NARRATIVE[ledgerType] || narrative,
    member: resolveMemberForTx({
      description: bankTx.description,
      ledgerType,
      member: "",
      memberNames,
    }),
  };
}

function fuzzyKey(tx) {
  const conf = (tx.description || "").match(/conf#?\s*([a-z0-9]+)/i);
  if (conf) return `${tx.date}|${tx.amount}|${conf[1].toLowerCase()}`;
  const check = (tx.description || "").match(/check\s*(\d+)/i);
  if (check) return `${tx.date}|${tx.amount}|check${check[1]}`;
  const mobile = (tx.description || "").match(/MOBILE\s+\d{2}\/\d{2}\s+(\d+)/i);
  if (mobile) return `${tx.date}|${tx.amount}|mobile${mobile[1]}`;
  return `${tx.date}|${tx.amount}|${normDesc(tx.description).slice(0, 48)}`;
}

function normDesc(d) {
  return String(d || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoToUs(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function runningBalance(txs) {
  let bal = 0;
  for (const tx of txs) bal = Math.round((bal + tx.amount) * 100) / 100;
  return bal;
}

function main() {
  const summary = readBankSummary(bankPath);
  const bankTxs = parseBankStatementRobust(bankPath);
  const memberNames = loadMemberNames();

  let existing = [];
  if (fs.existsSync(ledgerPath)) {
    existing = parseReferenceLedgerXlsx(ledgerPath, memberNames).filter(
      (tx) => !/XXXXX/i.test(tx.description || "")
    );
  }

  const existingByKey = new Map();
  for (const tx of existing) {
    const key = fuzzyKey(tx);
    if (!existingByKey.has(key)) existingByKey.set(key, tx);
  }

  const pre2025 = existing
    .filter((tx) => tx.date < "2025-01-01")
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const pre2025Bal = runningBalance(pre2025);
  const openingGap = Math.round(((summary.beginning || 0) - pre2025Bal) * 100) / 100;

  console.log("Bank opening (2025-01-01):", summary.beginning?.toFixed(2));
  console.log("Existing pre-2025 ledger balance:", pre2025Bal.toFixed(2));
  console.log("Pre-2025 gap:", openingGap.toFixed(2));
  console.log("Bank transactions (2025+):", bankTxs.length);

  const exportRows = [];

  for (const tx of pre2025) {
    const description = normalizeDescription(tx.description, tx.ledgerType);
    exportRows.push({
      dateIso: tx.date,
      dateUs: isoToUs(tx.date),
      memberName: resolveMemberForTx({
        description,
        ledgerType: tx.ledgerType,
        member: tx.member,
        memberNames,
      }),
      description,
      amount: tx.amount,
      narrative: TYPE_TO_NARRATIVE[tx.ledgerType] || tx.transactionType || "",
      ledgerType: tx.ledgerType,
      source: tx.source || "reference_ledger",
    });
  }

  for (const bankTx of bankTxs) {
    const classified = classifyBankTx(bankTx, existingByKey, existing, memberNames);
    const description = normalizeDescription(bankTx.description, classified.ledgerType);
    exportRows.push({
      dateIso: bankTx.date,
      dateUs: isoToUs(bankTx.date),
      memberName: resolveMemberForTx({
        description,
        ledgerType: classified.ledgerType,
        member: classified.member,
        memberNames,
      }),
      description,
      amount: bankTx.amount,
      narrative: classified.transactionType,
      ledgerType: classified.ledgerType,
      source: "stmt_csv",
    });
  }

  const finalized = finalizeExportRows(
    exportRows.map((row, index) => ({ ...row, index: index + 1, runningBalance: 0 }))
  );

  const computedEnd = finalized.length
    ? finalized[finalized.length - 1].runningBalance
    : 0;
  const endGap = Math.round((computedEnd - (summary.ending || 0)) * 100) / 100;

  console.log("\nRebuilt transaction count:", finalized.length);
  console.log("Computed ending balance:", computedEnd.toFixed(2));
  console.log("Bank ending balance:", summary.ending?.toFixed(2));
  console.log("Ending gap:", endGap.toFixed(2));

  if (Math.abs(endGap) > 0.01) {
    console.error("\nERROR: Rebuilt ledger does not match bank ending balance.");
    process.exit(1);
  }

  if (Math.abs(openingGap) > 0.01) {
    console.error(
      `\nERROR: Pre-2025 ledger does not match bank opening. Gap ${openingGap.toFixed(2)}.`
    );
    process.exit(1);
  }

  const csvPath = path.join(outDir, "cooperative-bank-ledger-reference.csv");
  const xlsxPath = path.join(outDir, "cooperative-bank-ledger-reference.xlsx");
  const today = new Date().toISOString().slice(0, 10);

  writeBankStatementCsv(
    finalized,
    csvPath,
    sortedReferenceHeaderLines(
      `Rebuilt from bank statement on ${today} — ending balance ${summary.ending?.toFixed(2)},,,`
    )
  );
  writeWorkbookDirect(finalized, xlsxPath, today);

  console.log("\nWrote:", csvPath);
  console.log("Wrote:", xlsxPath);
}

function writeWorkbookDirect(exportRows, outPath, today) {
  const XLSX = require("xlsx");
  const sheetRows = exportRows.map((row) => ({
    "#": row.index,
    Date: row.dateUs,
    "ISO Date": row.dateIso,
    Member: row.memberName,
    Description: row.description,
    Amount: row.amount,
    "Running Balance": row.runningBalance,
    Narrative: row.narrative,
    "Ledger Type": row.ledgerType,
    Source: row.source,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, "Cooperative Bank Ledger");

  const summary = [
    ["Cooperative Bank Ledger — rebuilt from bank statement"],
    ["Generated", today],
    ["Ending balance verified", exportRows.at(-1)?.runningBalance ?? ""],
    ["Transaction count", exportRows.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "About");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(wb, outPath);
}

main();
