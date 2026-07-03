#!/usr/bin/env node
/**
 * Build deduplicated master cooperative bank ledger (inception → 2026-06-29)
 * from pre 2025.xlsx + stmt (6).csv, with labels from cooperative-bank-ledger-reference.xlsx.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const {
  parseReferenceLedgerXlsx,
  inferNarrativeFromDescription,
  narrativeToLedgerType,
  resolveLoanDisbursementMember,
  refineMemberLedgerType,
} = require("../lib/parse-bank-sources");
const {
  finalizeExportRows,
  writeWorkbook,
  TYPE_TO_NARRATIVE,
} = require("../lib/cooperative-bank-ledger-csv");
const { resolveLedgerMemberName } = require("../lib/member-name-match");
const { runWithOrg } = require("../lib/org-context");

const PRE2025_PATH =
  process.argv[2] || "C:/Users/yinka/Downloads/pre 2025.xlsx";
const STMT_PATH = process.argv[3] || "C:/Users/yinka/Downloads/stmt (6).csv";
const REF_XLSX_PATH =
  process.argv[4] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.xlsx");
const OUT_DIR =
  process.argv[5] || path.join(__dirname, "../../data/master-ledger");
const OUT_XLSX = path.join(OUT_DIR, "cooperative-bank-ledger-master.xlsx");

/** Rows to remove from reference xlsx (duplicate bank/mobile entries). */
const REF_ROWS_TO_DROP = new Set([25, 74, 189, 207]);

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

function excelDateToIso(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && value > 20000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86400000).toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function isoToUs(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function fuzzyKey(tx) {
  const desc = tx.description || "";
  const date = tx.date || tx.dateIso;
  const amount = Number(tx.amount).toFixed(2);
  const conf = String(desc).match(/conf#?\s*([a-z0-9]+)/i);
  if (conf) return `${date}|${amount}|${conf[1].toLowerCase()}`;
  const check = String(desc).match(/check\s*(\d+)/i);
  if (check) return `${date}|${amount}|check${check[1]}`;
  const mobile = String(desc).match(/MOBILE\s+\d{2}\/\d{2}\s+(\d+)/i);
  if (mobile) return `${date}|${amount}|mobile${mobile[1]}`;
  return `${date}|${amount}|${String(desc).slice(0, 48).toLowerCase()}`;
}

function readBankSummary(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/).slice(0, 8)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const label = cols[0] || "";
    const val =
      parseMoney(cols[1]) ??
      parseMoney(cols[2]) ??
      parseMoney(cols[3]);
    if (/beginning/i.test(label) && val != null) out.beginning = val;
    if (/ending/i.test(label) && val != null) out.ending = val;
  }
  if (out.beginning == null || out.ending == null) {
    const txs = parseBankStatementRobust(filePath);
    if (txs.length) {
      let running = 0;
      for (const tx of txs) running = Math.round((running + tx.amount) * 100) / 100;
      const firstBal = txs[0]?.runningBalance;
      if (out.beginning == null && firstBal != null) {
        out.beginning = Math.round((firstBal - txs[0].amount) * 100) / 100;
      }
      if (out.ending == null) out.ending = txs.at(-1)?.runningBalance ?? running;
    }
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

    transactions.push({ date: dateIso, description, amount, runningBalance: running });
    if (running != null) prevRunning = running;
  }

  return transactions;
}

function parsePre2025Xlsx(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((n) => /sheet/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  const parsed = [];

  for (const row of rows) {
    const desc = String(row.Description || "").trim();
    if (!desc || /beginning balance/i.test(desc)) continue;
    const amount = Number(String(row.Amount || "").replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;
    const dateIso = excelDateToIso(row.Date);
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
    parsed.push({
      date: dateIso,
      description: desc,
      amount,
      member: String(row.Depositor || row.Depositor_1 || "").trim(),
      source: "pre_2025_xlsx",
    });
  }

  return dedupeByKey(parsed);
}

function dedupeByKey(txs) {
  const seen = new Set();
  const out = [];
  for (const tx of txs) {
    const key = fuzzyKey(tx);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tx);
  }
  return out;
}

function parseRefXlsxRows(filePath, { excludeDropped = true } = {}) {
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Cooperative Bank Ledger"], { defval: "" });
  if (!excludeDropped) return rows.filter((r) => r["ISO Date"]);
  return rows.filter((r) => r["ISO Date"] && !REF_ROWS_TO_DROP.has(Number(r["#"])));
}

function supplementalPre2025FromRef(refRows, preKeys) {
  const supplemental = [];
  for (const row of refRows) {
    if (String(row["ISO Date"]) >= "2025-01-01") continue;
    const tx = {
      date: row["ISO Date"],
      description: String(row.Description || "").trim(),
      amount: Number(row.Amount),
      member: String(row.Member || "").trim(),
      ledgerType: String(row["Ledger Type"] || "").trim(),
      narrative: String(row.Narrative || "").trim(),
      source: "reference_xlsx_supplement",
    };
    if (!Number.isFinite(tx.amount)) continue;
    if (!preKeys.has(fuzzyKey(tx))) supplemental.push(tx);
  }
  return dedupeByKey(supplemental);
}

function buildRefLabelIndex(refParsed) {
  const map = new Map();
  for (const tx of refParsed) {
    const key = fuzzyKey(tx);
    if (!map.has(key)) map.set(key, tx);
  }
  return map;
}

function resolveMemberForTx({ description, ledgerType, member, memberNames }) {
  if (member) return member;
  if (ledgerType === "loan_disbursement") {
    return resolveLoanDisbursementMember(description, memberNames) || "";
  }
  if (ledgerType === "loan_repayment" && /BKOFAMERICA MOBILE/i.test(description)) {
    return resolveLedgerMemberName("Oluwabiyi Omotuyole", memberNames) || "Oluwabiyi Omotuyole";
  }
  return member || "";
}

function classifyTx(bankTx, labelIndex, memberNames) {
  const prior = labelIndex.get(fuzzyKey(bankTx));
  if (prior) {
    const ledgerType = refineMemberLedgerType({
      ledgerType: prior.ledgerType,
      description: bankTx.description,
      amount: bankTx.amount,
      member: prior.member,
    });
    return {
      ledgerType,
      narrative: TYPE_TO_NARRATIVE[ledgerType] || prior.transactionType || prior.narrative || "",
      member: resolveMemberForTx({
        description: bankTx.description,
        ledgerType,
        member: prior.member,
        memberNames,
      }),
    };
  }

  let narrative = inferNarrativeFromDescription(bankTx.description, "");
  let ledgerType = narrativeToLedgerType(narrative);
  if (!ledgerType && /,\s*loan\b/i.test(bankTx.description)) ledgerType = "loan_repayment";
  if (!ledgerType && /BKOFAMERICA MOBILE/i.test(bankTx.description)) ledgerType = "loan_repayment";
  if (!ledgerType && /monthly fee/i.test(bankTx.description)) ledgerType = "expense";
  if (!ledgerType) {
    throw new Error(
      `Could not classify: ${bankTx.date} ${bankTx.amount} ${String(bankTx.description).slice(0, 60)}`
    );
  }

  ledgerType = refineMemberLedgerType({
    ledgerType,
    description: bankTx.description,
    amount: bankTx.amount,
    member: bankTx.member || "",
  });

  return {
    ledgerType,
    narrative: TYPE_TO_NARRATIVE[ledgerType] || narrative,
    member: resolveMemberForTx({
      description: bankTx.description,
      ledgerType,
      member: bankTx.member || "",
      memberNames,
    }),
  };
}

function toExportRow(tx, classified, source) {
  return {
    dateIso: tx.date,
    dateUs: isoToUs(tx.date),
    memberName: classified.member || tx.member || "",
    description: tx.description,
    amount: tx.amount,
    narrative: classified.narrative,
    ledgerType: classified.ledgerType,
    source,
  };
}

function patchReferenceXlsx(filePath) {
  const refRows = parseRefXlsxRows(filePath);
  const exportRows = [];
  for (const row of refRows) {
    exportRows.push({
      dateIso: row["ISO Date"],
      dateUs: row.Date || isoToUs(row["ISO Date"]),
      memberName: row.Member || "",
      description: row.Description,
      amount: Number(row.Amount),
      narrative: row.Narrative,
      ledgerType: row["Ledger Type"],
      source: row.Source || "reference_ledger",
    });
  }
  writeWorkbook(finalizeExportRows(exportRows), filePath);
}

function runningBalance(txs) {
  let bal = 0;
  for (const tx of txs) bal = Math.round((bal + tx.amount) * 100) / 100;
  return bal;
}

function main() {
  const summary = readBankSummary(STMT_PATH);
  const pre2025 = parsePre2025Xlsx(PRE2025_PATH);
  const preKeys = new Set(pre2025.map(fuzzyKey));
  const refRows = parseRefXlsxRows(REF_XLSX_PATH);
  const supplemental = supplementalPre2025FromRef(refRows, preKeys);
  const refParsed = parseReferenceLedgerXlsx(REF_XLSX_PATH, []);
  const dropKeys = new Set(
    parseRefXlsxRows(REF_XLSX_PATH, { excludeDropped: false })
      .filter((r) => REF_ROWS_TO_DROP.has(Number(r["#"])))
      .map((r) =>
        fuzzyKey({
          date: r["ISO Date"],
          description: r.Description,
          amount: Number(r.Amount),
        })
      )
  );
  const refParsedClean = refParsed.filter((tx) => !dropKeys.has(fuzzyKey(tx)));
  const labelIndex = buildRefLabelIndex(refParsedClean);
  const memberNames = [];

  const bankTxs = parseBankStatementRobust(STMT_PATH);

  const exportRows = [];

  for (const tx of [...pre2025, ...supplemental].sort((a, b) => a.date.localeCompare(b.date))) {
    const classified = classifyTx(tx, labelIndex, memberNames);
    exportRows.push(toExportRow(tx, classified, tx.source));
  }

  const preBal = runningBalance(
    exportRows.map((r) => ({ amount: r.amount }))
  );
  const openingGap = Math.round((preBal - (summary.beginning || 0)) * 100) / 100;

  for (const bankTx of bankTxs) {
    const classified = classifyTx(bankTx, labelIndex, memberNames);
    exportRows.push(toExportRow(bankTx, classified, "stmt_csv"));
  }

  const finalized = finalizeExportRows(exportRows);
  const computedEnd = finalized.at(-1)?.runningBalance ?? 0;
  const endGap = Math.round((computedEnd - (summary.ending || 0)) * 100) / 100;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  runWithOrg("assurance", () => {
    writeWorkbook(finalized, OUT_XLSX);
    if (process.argv.includes("--sync-reference")) {
      writeWorkbook(finalized, REF_XLSX_PATH);
    }
  });

  console.log("=== MASTER LEDGER BUILT ===");
  console.log("Output:", OUT_XLSX);
  console.log("Reference xlsx deduped:", REF_XLSX_PATH);
  console.log("Pre-2025 from pre 2025.xlsx:", pre2025.length, "rows");
  console.log("Pre-2025 supplemental (fees/checks from ref):", supplemental.length, "rows");
  for (const row of supplemental) {
    console.log(
      `  + ${row.date}  ${row.amount.toFixed(2)}  ${row.description.slice(0, 55)}`
    );
  }
  console.log("2025+ from stmt (6).csv:", bankTxs.length, "rows");
  console.log("Total transactions:", finalized.length);
  console.log("Pre-2025 balance:", preBal.toFixed(2), "(BoA opening:", summary.beginning?.toFixed(2), ")");
  console.log("Opening gap:", openingGap.toFixed(2));
  console.log("Ending balance:", computedEnd.toFixed(2), "(BoA:", summary.ending?.toFixed(2), ")");
  console.log("Ending gap:", endGap.toFixed(2));
  console.log("\nRemoved from reference xlsx row #:", [...REF_ROWS_TO_DROP].join(", "));

  if (Math.abs(openingGap) > 0.01 || Math.abs(endGap) > 0.01) {
    console.error("\nERROR: balances do not match BoA statement.");
    process.exit(1);
  }
}

main();
