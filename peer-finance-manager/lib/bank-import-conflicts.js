const { getDb } = require("../db/database");
const { loadMergedBankTransactions } = require("./parse-bank-sources");
const { auditLedgerImport } = require("./ledger-import-audit");
const {
  LEDGER_TYPES,
  buildExportRows,
  TYPE_TO_NARRATIVE,
} = require("./cooperative-bank-ledger-csv");

function roundAmount(amount) {
  return Math.round(Number(amount) * 100) / 100;
}

function loadMemberNames(db) {
  return db.prepare(`SELECT name FROM members ORDER BY name`).all().map((r) => r.name);
}

function loadManualLedgerRows(db) {
  const placeholders = LEDGER_TYPES.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT t.id,
              t.transaction_date,
              t.type,
              t.amount,
              t.description,
              t.source,
              m.name AS member_name
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
       WHERE t.source = 'manual'
         AND t.type IN (${placeholders})
       ORDER BY t.transaction_date, t.id`
    )
    .all(...LEDGER_TYPES);
}

function parsedTransactionsToExportRows(transactions) {
  return transactions.map((tx, index) => ({
    index: index + 1,
    dateIso: tx.date,
    dateUs: formatDateUs(tx.date),
    memberName: tx.member || "",
    description: String(tx.description || ""),
    amount: Number(tx.amount),
    narrative: TYPE_TO_NARRATIVE[tx.ledgerType] || tx.ledgerType,
    ledgerType: tx.ledgerType,
    source: tx.source,
  }));
}

function formatDateUs(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function ledgerRowFingerprint(row) {
  const member = String(row.memberName || "")
    .toLowerCase()
    .trim();
  const desc = String(row.description || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${row.dateIso}|${row.ledgerType}|${roundAmount(row.amount)}|${member}|${desc}`;
}

function buildFingerprintPool(exportRows) {
  const pool = new Map();
  for (const row of exportRows) {
    const key = ledgerRowFingerprint(row);
    pool.set(key, (pool.get(key) || 0) + 1);
  }
  return pool;
}

function takeFromPool(pool, key) {
  const count = pool.get(key) || 0;
  if (count <= 0) return false;
  if (count === 1) pool.delete(key);
  else pool.set(key, count - 1);
  return true;
}

function loadImportExportRows({
  workbookPath,
  statementPath,
  workbookOriginalName,
  statementOriginalName,
  memberNames,
}) {
  const transactions = loadMergedBankTransactions({
    xlsxPath: workbookPath || null,
    csvPath: statementPath || null,
    memberNames,
    xlsxOriginalName: workbookOriginalName || null,
    csvOriginalName: statementOriginalName || null,
  });
  return parsedTransactionsToExportRows(transactions);
}

function computeImportEndingStats(importRows) {
  if (!importRows?.length) {
    return { endingBalance: null, lastDate: null };
  }
  const sorted = [...importRows].sort((a, b) =>
    String(a.dateIso || "").localeCompare(String(b.dateIso || ""))
  );
  let running = 0;
  for (const row of sorted) {
    running += Number(row.amount) || 0;
  }
  return {
    endingBalance: roundAmount(running),
    lastDate: sorted[sorted.length - 1]?.dateIso || null,
  };
}

function formatConflictRow(exportRow, transactionId) {
  return {
    transactionId: transactionId || null,
    date: exportRow.dateIso,
    dateLabel: exportRow.dateUs,
    type: exportRow.ledgerType,
    narrative: exportRow.narrative,
    amount: exportRow.amount,
    memberName: exportRow.memberName || null,
    description: exportRow.description,
    source: "manual",
  };
}

function findImportAudit({
  workbookPath,
  statementPath,
  workbookOriginalName,
  statementOriginalName,
}) {
  const db = getDb();
  const memberNames = loadMemberNames(db);
  const transactions = loadMergedBankTransactions({
    xlsxPath: workbookPath || null,
    csvPath: statementPath || null,
    memberNames,
    xlsxOriginalName: workbookOriginalName || null,
    csvOriginalName: statementOriginalName || null,
  });
  return auditLedgerImport(transactions, memberNames);
}

/**
 * Returns manual ledger rows that would be dropped because they do not
 * appear in the CSV/workbook about to be imported.
 */
function findManualLedgerMissingFromImport({
  workbookPath,
  statementPath,
  workbookOriginalName,
  statementOriginalName,
}) {
  const db = getDb();
  const manualRaw = loadManualLedgerRows(db);
  const importAudit = findImportAudit({
    workbookPath,
    statementPath,
    workbookOriginalName,
    statementOriginalName,
  });

  if (!manualRaw.length) {
    const memberNames = loadMemberNames(db);
    const importRows = loadImportExportRows({
      workbookPath,
      statementPath,
      workbookOriginalName,
      statementOriginalName,
      memberNames,
    });
    const { endingBalance, lastDate } = computeImportEndingStats(importRows);
    return {
      manualCount: 0,
      importCount: importRows.length,
      endingBalance,
      lastDate,
      missingFromImport: [],
      hasConflicts: false,
      importAudit,
    };
  }

  const memberNames = loadMemberNames(db);
  const importRows = loadImportExportRows({
    workbookPath,
    statementPath,
    workbookOriginalName,
    statementOriginalName,
    memberNames,
  });
  const manualRows = buildExportRows(manualRaw);
  const importPool = buildFingerprintPool(importRows);

  const missingFromImport = [];
  for (let i = 0; i < manualRows.length; i++) {
    const manual = manualRows[i];
    const key = ledgerRowFingerprint(manual);
    if (!takeFromPool(importPool, key)) {
      missingFromImport.push(formatConflictRow(manual, manualRaw[i].id));
    }
  }

  const { endingBalance, lastDate } = computeImportEndingStats(importRows);

  return {
    manualCount: manualRaw.length,
    importCount: importRows.length,
    endingBalance,
    lastDate,
    missingFromImport,
    hasConflicts: missingFromImport.length > 0,
    importAudit,
  };
}

module.exports = {
  findManualLedgerMissingFromImport,
  findImportAudit,
};
