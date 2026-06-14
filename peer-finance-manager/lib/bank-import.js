const XLSX = require("xlsx");
const { getDb } = require("../db/database");

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

module.exports = {
  registerBankImport,
  parseBankStatementPreview,
  listBankImports,
};
