const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getDb } = require("../db/database");
const { getDataDir } = require("./paths");
const { getOrgSlug } = require("./org-context");
const { TRANSACTION_TYPES } = require("./constants");
const { trace } = require("./trace-log");
const { todayIso: cooperativeTodayIso } = require("./cooperative-time");

const CSV_BASENAME = "cooperative-bank-ledger-reference.csv";
const XLSX_BASENAME = "cooperative-bank-ledger-reference.xlsx";

const LEDGER_SOURCES = ["bank_import", "manual"];

const LEDGER_TYPES = [
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.DISTRIBUTION,
  TRANSACTION_TYPES.LOAN_REPAYMENT,
  TRANSACTION_TYPES.LOAN_DISBURSEMENT,
  TRANSACTION_TYPES.EXPENSE,
  TRANSACTION_TYPES.CD_PURCHASE,
  TRANSACTION_TYPES.CD_LIQUIDATION,
  TRANSACTION_TYPES.INVESTMENT,
];

const TYPE_TO_NARRATIVE = {
  [TRANSACTION_TYPES.DEPOSIT]: "Member Deposit",
  [TRANSACTION_TYPES.WITHDRAWAL]: "Member Withdrawal",
  [TRANSACTION_TYPES.DISTRIBUTION]: "Member Deposit",
  [TRANSACTION_TYPES.LOAN_REPAYMENT]: "Loan Repayment",
  [TRANSACTION_TYPES.LOAN_DISBURSEMENT]: "Loan Disbursement",
  [TRANSACTION_TYPES.EXPENSE]: "Expenses",
  [TRANSACTION_TYPES.CD_PURCHASE]: "Purchase of Certificate of Deposit",
  [TRANSACTION_TYPES.CD_LIQUIDATION]: "Liquidation of Certificate of Deposit",
  [TRANSACTION_TYPES.INVESTMENT]: "Investment in Caribe Restaurant and Lounge",
};

function getCooperativeBankLedgerCsvPath() {
  return path.join(getDataDir(), CSV_BASENAME);
}

function getCooperativeBankLedgerXlsxPath() {
  return path.join(getDataDir(), XLSX_BASENAME);
}

function isoToUs(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function formatRunningBalance(amount) {
  const n = Math.round(Number(amount) * 100) / 100;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stripExpenseCategoryPrefix(description) {
  return String(description || "").replace(/^[A-Za-z /]+: /, "");
}

function descriptionForCsvExport(row) {
  let description = stripExpenseCategoryPrefix(row.description);
  if (row.source !== "manual" || !row.member_name) {
    return description;
  }
  const name = row.member_name;
  const lower = description.toLowerCase();
  if (lower.includes(name.toLowerCase())) return description;

  if (row.type === TRANSACTION_TYPES.LOAN_REPAYMENT) {
    return `${description} from ${name}`;
  }
  if (
    row.type === TRANSACTION_TYPES.DEPOSIT ||
    row.type === TRANSACTION_TYPES.DISTRIBUTION
  ) {
    return `${description} from ${name}`;
  }
  if (row.type === TRANSACTION_TYPES.WITHDRAWAL) {
    return `${description} to ${name}`;
  }
  if (row.type === TRANSACTION_TYPES.LOAN_DISBURSEMENT) {
    return `${description} for ${name}`;
  }
  return `${description} (${name})`;
}

function loadLedgerRowsFromDb(db) {
  const placeholders = LEDGER_TYPES.map(() => "?").join(", ");
  const sourcePlaceholders = LEDGER_SOURCES.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT t.transaction_date,
              t.type,
              t.amount,
              t.description,
              t.source,
              m.name AS member_name
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
       WHERE t.source IN (${sourcePlaceholders})
         AND t.type IN (${placeholders})
       ORDER BY t.transaction_date, t.id`
    )
    .all(...LEDGER_SOURCES, ...LEDGER_TYPES);
}

function buildExportRows(rows) {
  const mapped = rows.map((row, index) => {
    const amount = Number(row.amount);
    const narrative = TYPE_TO_NARRATIVE[row.type] || row.type;
    const description = descriptionForCsvExport(row);

    return {
      index: index + 1,
      dateIso: row.transaction_date,
      dateUs: isoToUs(row.transaction_date),
      memberName: row.member_name || "",
      description,
      amount,
      runningBalance: 0,
      narrative,
      ledgerType: row.type,
      source: row.source,
    };
  });
  return finalizeExportRows(mapped);
}

function sortExportRowsByDate(exportRows) {
  return [...exportRows].sort((a, b) => {
    const dateCmp = String(a.dateIso || "").localeCompare(String(b.dateIso || ""));
    if (dateCmp !== 0) return dateCmp;
    return (a.index || 0) - (b.index || 0);
  });
}

function finalizeExportRows(exportRows) {
  const sorted = sortExportRowsByDate(exportRows);
  let running = 0;
  return sorted.map((row, idx) => {
    running += Number(row.amount) || 0;
    return {
      ...row,
      index: idx + 1,
      dateUs: row.dateUs || isoToUs(row.dateIso),
      runningBalance: Math.round(running * 100) / 100,
    };
  });
}

function sortedReferenceHeaderLines(note) {
  const today = cooperativeTodayIso();
  return [
    "Description,,Summary Amt.,,",
    note || "Cooperative bank ledger reference : sorted by transaction date,,,",
    `Generated on ${today},,,,`,
    ",,,,",
    "Date,Description,Amount,Running Bal.,Member,Narrative",
  ];
}

function parsedTransactionsToExportRows(transactions) {
  return transactions.map((tx, index) => ({
    index: index + 1,
    dateIso: tx.date,
    dateUs: isoToUs(tx.date),
    memberName: tx.member || "",
    description: String(tx.description || ""),
    amount: Number(tx.amount),
    runningBalance: 0,
    narrative: TYPE_TO_NARRATIVE[tx.ledgerType] || tx.ledgerType,
    ledgerType: tx.ledgerType,
    source: tx.source,
  }));
}

function buildSortedReferenceCsvFromUpload({
  workbookPath,
  statementPath,
  workbookOriginalName,
  statementOriginalName,
}) {
  const db = getDb();
  const memberNames = db
    .prepare(`SELECT name FROM members ORDER BY name`)
    .all()
    .map((r) => r.name);
  const { loadMergedBankTransactions } = require("./parse-bank-sources");
  const transactions = loadMergedBankTransactions({
    xlsxPath: workbookPath || null,
    csvPath: statementPath || null,
    memberNames,
    xlsxOriginalName: workbookOriginalName || null,
    csvOriginalName: statementOriginalName || null,
  });
  if (!transactions.length) {
    throw new Error("No transactions found in the uploaded file(s).");
  }
  const exportRows = finalizeExportRows(parsedTransactionsToExportRows(transactions));
  return {
    content: writeBankStatementCsv(
      exportRows,
      null,
      sortedReferenceHeaderLines(
        "Sorted from your uploaded file : replace cooperative-bank-ledger-reference.csv with this download,,,"
      )
    ),
    transactionCount: exportRows.length,
  };
}

function buildSortedReferenceCsvFromDb() {
  const db = getDb();
  const raw = loadLedgerRowsFromDb(db);
  const exportRows = buildExportRows(raw);
  return {
    content: writeBankStatementCsv(
      exportRows,
      null,
      sortedReferenceHeaderLines(
        "Sorted from live Cooperative Books on Peer Finance Manager,,,"
      )
    ),
    exportRows,
    transactionCount: exportRows.length,
  };
}

function writeBankStatementCsv(exportRows, outPath, headerLines) {
  const lines = headerLines || [
    "Description,,Summary Amt.,,",
    `Synced from Peer Finance Manager on ${cooperativeTodayIso()},,,,`,
    ",,,,",
    "Date,Description,Amount,Running Bal.,Member,Narrative",
  ];

  for (const row of exportRows) {
    lines.push(
      [
        row.dateUs,
        csvEscape(row.description),
        formatAmount(row.amount),
        formatRunningBalance(row.runningBalance),
        csvEscape(row.memberName || ""),
        row.narrative,
      ].join(",")
    );
  }

  const content = `${lines.join("\n")}\n`;
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content, "utf8");
  }
  return content;
}

function conflictRowsToExportRows(missingFromImport) {
  const mapped = missingFromImport.map((row, index) => ({
    index: index + 1,
    dateIso: row.date,
    dateUs: row.dateLabel,
    memberName: row.memberName || "",
    description: row.description,
    amount: Number(row.amount),
    runningBalance: 0,
    narrative: row.narrative,
    ledgerType: row.type,
  }));
  return finalizeExportRows(mapped);
}

const MISSING_MANUAL_ROWS_CSV_BASENAME = "cooperative-bank-ledger-missing-manual-rows.csv";

function buildMissingManualRowsCsvContent(missingFromImport) {
  const exportRows = conflictRowsToExportRows(missingFromImport);
  const today = cooperativeTodayIso();
  return writeBankStatementCsv(exportRows, null, [
    "Description,,Summary Amt.,,",
    "Missing manual transactions from Peer Finance Manager,,,",
    `Copy the rows below into cooperative-bank-ledger-reference.csv then re-import.,,,`,
    `Generated on ${today},,,,`,
    ",,,,",
    "Date,Description,Amount,Running Bal.,Member,Narrative",
  ]);
}

function writeWorkbook(exportRows, outPath) {
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
    ["Cooperative Bank Ledger : synced from Peer Finance Manager"],
    ["Generated", cooperativeTodayIso()],
    ["Organization slug", getOrgSlug()],
    ["Includes", "bank_import and manual ledger transactions"],
    ["Transaction count", exportRows.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "About");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(wb, outPath);
}

function syncCooperativeBankLedgerCsvFiles({ writeXlsx = false } = {}) {
  const { exportRows, transactionCount } = buildSortedReferenceCsvFromDb();
  const csvPath = getCooperativeBankLedgerCsvPath();
  const xlsxPath = getCooperativeBankLedgerXlsxPath();

  writeBankStatementCsv(exportRows, csvPath, sortedReferenceHeaderLines(
    "Synced from Peer Finance Manager : sorted by transaction date,,,"
  ));
  if (writeXlsx) {
    writeWorkbook(exportRows, xlsxPath);
  }

  return {
    csvPath,
    xlsxPath: writeXlsx ? xlsxPath : null,
    transactionCount,
  };
}

function queueCooperativeBankLedgerCsvSync(reason) {
  setImmediate(() => {
    try {
      const result = syncCooperativeBankLedgerCsvFiles();
      trace.info("Cooperative bank ledger CSV synced", { reason, ...result });
    } catch (err) {
      trace.warn("Cooperative bank ledger CSV sync failed", {
        reason,
        error: err.message,
      });
    }
  });
}

function getLedgerEndingBalance(asOfDateIso = null) {
  const db = getDb();
  let rows = loadLedgerRowsFromDb(db);
  if (asOfDateIso) {
    rows = rows.filter((row) => String(row.transaction_date) <= asOfDateIso);
  }
  if (!rows.length) return null;
  const exportRows = buildExportRows(rows);
  const last = exportRows[exportRows.length - 1];
  return {
    balance: last.runningBalance,
    asOf: last.dateIso,
  };
}

module.exports = {
  CSV_BASENAME,
  XLSX_BASENAME,
  MISSING_MANUAL_ROWS_CSV_BASENAME,
  LEDGER_TYPES,
  TYPE_TO_NARRATIVE,
  getCooperativeBankLedgerCsvPath,
  getCooperativeBankLedgerXlsxPath,
  syncCooperativeBankLedgerCsvFiles,
  queueCooperativeBankLedgerCsvSync,
  loadLedgerRowsFromDb,
  buildExportRows,
  getLedgerEndingBalance,
  writeBankStatementCsv,
  writeWorkbook,
  sortedReferenceHeaderLines,
  buildMissingManualRowsCsvContent,
  buildSortedReferenceCsvFromDb,
  buildSortedReferenceCsvFromUpload,
  finalizeExportRows,
  sortExportRowsByDate,
};
