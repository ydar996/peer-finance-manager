const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getDb } = require("../db/database");
const { getOrgDataDir } = require("./organization-service");
const { getOrgSlug } = require("./org-context");
const { importBankLedger } = require("./import-bank-ledger");
const { getCdBalanceSnapshot } = require("./cd-balance-service");

/**
 * Placeholder for Bank of America statement import.
 * When you provide a sample BoA export, this module will match:
 * - Zelle deposits to member accounts
 * - Loan repayments to active loans (not member deposits)
 * - Cooperative expenses
 */
function registerBankImport(filename) {
  const db = getDb();
  const result = db
    .prepare(`INSERT INTO bank_imports (filename, status) VALUES (?, 'pending')`)
    .run(filename);
  return result.lastInsertRowid;
}

function parseBankStatementPreview(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: null,
  });
  return {
    sheetName,
    rowCount: rows.length,
    columns: rows.length ? Object.keys(rows[0]) : [],
    preview: rows.slice(0, 5),
    message:
      "Preview only. Provide a labeled BoA export template to enable automatic matching.",
  };
}

function listBankImports() {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM bank_imports ORDER BY imported_at DESC`)
    .all();
}

function archiveUploadedBankFiles({ workbookPath, statementPath } = {}) {
  const orgSlug = getOrgSlug();
  const archiveDir = path.join(getOrgDataDir(orgSlug), "bank-imports");
  fs.mkdirSync(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const saved = {};

  if (workbookPath) {
    const ext = path.extname(workbookPath) || ".xlsx";
    const latest = path.join(archiveDir, `latest-workbook${ext}`);
    const stamped = path.join(archiveDir, `workbook-${stamp}${ext}`);
    fs.copyFileSync(workbookPath, latest);
    fs.copyFileSync(workbookPath, stamped);
    saved.workbook = path.basename(latest);
  }
  if (statementPath) {
    const latest = path.join(archiveDir, "latest-statement.csv");
    const stamped = path.join(archiveDir, `statement-${stamp}.csv`);
    fs.copyFileSync(statementPath, latest);
    fs.copyFileSync(statementPath, stamped);
    saved.statement = path.basename(latest);
  }
  return saved;
}

function runBankImportFromUpload({ workbookPath, statementPath, cdBalance } = {}) {
  if (!workbookPath && !statementPath) {
    throw new Error("Upload the cooperative workbook (.xlsx) and/or bank statement (.csv).");
  }

  let resolvedCdBalance = cdBalance;
  if (resolvedCdBalance == null || resolvedCdBalance === "") {
    const snapshot = getCdBalanceSnapshot();
    resolvedCdBalance = snapshot.balance;
  }

  const archived = archiveUploadedBankFiles({ workbookPath, statementPath });
  const result = importBankLedger({
    xlsxPath: workbookPath || null,
    csvPath: statementPath || null,
    cdBalance: resolvedCdBalance,
    replaceSpreadsheetDeposits: true,
  });

  return { ...result, archived };
}

module.exports = {
  registerBankImport,
  parseBankStatementPreview,
  listBankImports,
  runBankImportFromUpload,
};
