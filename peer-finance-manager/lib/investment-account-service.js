const { getDb } = require("../db/database");
const { addTransaction } = require("./balance-service");
const { TRANSACTION_TYPES } = require("./constants");
const { queueCooperativeBankLedgerCsvSync } = require("./cooperative-bank-ledger-csv");

const FALLBACK_ACCOUNT_NAME = "Unclassified Investments";

function ensureInvestmentAccountSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS investment_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      institution_name TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active_from TEXT,
      active_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_investment_accounts_name
      ON investment_accounts(LOWER(name));
  `);
  const txCols = db.prepare(`PRAGMA table_info(transactions)`).all().map((c) => c.name);
  if (!txCols.includes("investment_account_id")) {
    db.exec(`ALTER TABLE transactions ADD COLUMN investment_account_id INTEGER`);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_investment_account
      ON transactions(investment_account_id);
  `);
}

/**
 * Creates an account per distinct description and links unassigned rows.
 * Bank-imported rows are skipped: their narration is transaction text,
 * not an account name. For those rows the ledger bank account is the
 * account of record until the administrator assigns a curated account.
 * Idempotent.
 */
function syncAccountsFromTransactions(db) {
  const rows = db
    .prepare(
      `SELECT DISTINCT TRIM(COALESCE(description, '')) AS label
       FROM transactions
       WHERE type = ? AND investment_account_id IS NULL
         AND COALESCE(source, '') != 'bank_import'`
    )
    .all(TRANSACTION_TYPES.INVESTMENT);
  const findStmt = db.prepare(`SELECT id FROM investment_accounts WHERE LOWER(name) = LOWER(?)`);
  const insertStmt = db.prepare(`INSERT INTO investment_accounts (name) VALUES (?)`);
  const assignStmt = db.prepare(
    `UPDATE transactions SET investment_account_id = ?
     WHERE type = ? AND investment_account_id IS NULL
       AND COALESCE(source, '') != 'bank_import'
       AND TRIM(COALESCE(description, '')) = ?`
  );
  for (const row of rows) {
    const name = row.label || FALLBACK_ACCOUNT_NAME;
    let account = findStmt.get(name);
    if (!account) {
      account = { id: insertStmt.run(name).lastInsertRowid };
    }
    assignStmt.run(account.id, TRANSACTION_TYPES.INVESTMENT, row.label);
  }
}

/**
 * Removes accounts the auto-sync created from imported narrations: no
 * institution/notes and every linked row is a bank import whose
 * description equals the account name. Curated accounts survive.
 */
function pruneAutoCreatedAccounts(db) {
  const stale = db
    .prepare(
      `SELECT ia.id
       FROM investment_accounts ia
       WHERE TRIM(COALESCE(ia.institution_name, '')) = ''
         AND TRIM(COALESCE(ia.notes, '')) = ''
         AND EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.investment_account_id = ia.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.investment_account_id = ia.id
             AND (COALESCE(t.source, '') != 'bank_import'
                  OR TRIM(COALESCE(t.description, '')) != ia.name)
         )`
    )
    .all();
  if (!stale.length) return;
  const unlink = db.prepare(
    `UPDATE transactions SET investment_account_id = NULL WHERE investment_account_id = ?`
  );
  const drop = db.prepare(`DELETE FROM investment_accounts WHERE id = ?`);
  db.transaction(() => {
    for (const row of stale) {
      unlink.run(row.id);
      drop.run(row.id);
    }
  })();
}

function mapAccountRow(row) {
  return {
    id: row.id,
    name: row.name,
    institutionName: row.institution_name || "",
    notes: row.notes || "",
    activeFrom: row.active_from || null,
    activeTo: row.active_to || null,
    entryCount: row.entryCount || 0,
    totalAmount: row.totalAmount || 0,
    netAmount: row.netAmount || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listInvestmentAccounts() {
  const db = getDb();
  ensureInvestmentAccountSchema(db);
  syncAccountsFromTransactions(db);
  pruneAutoCreatedAccounts(db);
  return db
    .prepare(
      `SELECT ia.*,
              COUNT(t.id) AS entryCount,
              COALESCE(SUM(ABS(t.amount)), 0) AS totalAmount,
              COALESCE(SUM(t.amount), 0) AS netAmount
       FROM investment_accounts ia
       LEFT JOIN transactions t
         ON t.investment_account_id = ia.id AND t.type = ?
       GROUP BY ia.id
       ORDER BY ia.name ASC`
    )
    .all(TRANSACTION_TYPES.INVESTMENT)
    .map(mapAccountRow);
}

function getInvestmentAccount(id) {
  const db = getDb();
  ensureInvestmentAccountSchema(db);
  return db.prepare(`SELECT * FROM investment_accounts WHERE id = ?`).get(Number(id));
}

function createInvestmentAccount({ name, institutionName, notes, activeFrom, activeTo } = {}) {
  const db = getDb();
  ensureInvestmentAccountSchema(db);
  const label = String(name || "").trim();
  if (!label) throw new Error("Account name is required.");
  const existing = db
    .prepare(`SELECT id FROM investment_accounts WHERE LOWER(name) = LOWER(?)`)
    .get(label);
  if (existing) throw new Error(`An investment account named "${label}" already exists.`);

  const info = db
    .prepare(
      `INSERT INTO investment_accounts (name, institution_name, notes, active_from, active_to)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      label,
      String(institutionName || "").trim(),
      String(notes || "").trim(),
      activeFrom || null,
      activeTo || null
    );
  return getInvestmentAccount(info.lastInsertRowid);
}

function updateInvestmentAccount(id, patch = {}) {
  const db = getDb();
  ensureInvestmentAccountSchema(db);
  const current = getInvestmentAccount(id);
  if (!current) throw new Error("Investment account not found.");

  const nextName =
    patch.name != null ? String(patch.name).trim() : String(current.name).trim();
  if (!nextName) throw new Error("Account name is required.");
  const dupe = db
    .prepare(`SELECT id FROM investment_accounts WHERE LOWER(name) = LOWER(?) AND id != ?`)
    .get(nextName, Number(id));
  if (dupe) throw new Error(`An investment account named "${nextName}" already exists.`);

  const renamed = nextName !== current.name;
  db.transaction(() => {
    db.prepare(
      `UPDATE investment_accounts SET
        name = ?, institution_name = ?, notes = ?, active_from = ?, active_to = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      nextName,
      patch.institutionName != null
        ? String(patch.institutionName).trim()
        : current.institution_name,
      patch.notes != null ? String(patch.notes).trim() : current.notes,
      patch.activeFrom !== undefined ? patch.activeFrom || null : current.active_from,
      patch.activeTo !== undefined ? patch.activeTo || null : current.active_to,
      Number(id)
    );
    if (renamed) {
      db.prepare(
        `UPDATE transactions SET description = ?
         WHERE investment_account_id = ? AND type = ?
           AND (TRIM(COALESCE(description, '')) = ? OR TRIM(COALESCE(description, '')) = '')`
      ).run(nextName, Number(id), TRANSACTION_TYPES.INVESTMENT, current.name);
    }
  })();

  return getInvestmentAccount(id);
}

function deleteInvestmentAccount(id) {
  const db = getDb();
  ensureInvestmentAccountSchema(db);
  const current = getInvestmentAccount(id);
  if (!current) throw new Error("Investment account not found.");

  const linked = db
    .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE investment_account_id = ?`)
    .get(Number(id)).c;
  if (linked > 0) {
    throw new Error(
      `"${current.name}" has ${linked} ledger transaction${linked === 1 ? "" : "s"} and cannot be deleted. Reassign its entries or set an Active To date to retire it instead.`
    );
  }

  db.prepare(`DELETE FROM investment_accounts WHERE id = ?`).run(Number(id));
  return { deleted: true, id: Number(id), name: current.name };
}

function listInvestmentEntries() {
  const db = getDb();
  ensureInvestmentAccountSchema(db);
  syncAccountsFromTransactions(db);
  pruneAutoCreatedAccounts(db);
  return db
    .prepare(
      `SELECT id, transaction_date AS transactionDate, amount, description,
              investment_account_id AS accountId
       FROM transactions
       WHERE type = ?
       ORDER BY transaction_date, id`
    )
    .all(TRANSACTION_TYPES.INVESTMENT);
}

function assignInvestmentEntries(accountId, transactionIds) {
  const db = getDb();
  ensureInvestmentAccountSchema(db);
  const account = getInvestmentAccount(accountId);
  if (!account) throw new Error("Investment account not found.");
  const ids = Array.isArray(transactionIds)
    ? transactionIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  if (!ids.length) throw new Error("No ledger entries selected.");
  const stmt = db.prepare(
    `UPDATE transactions SET investment_account_id = ?
     WHERE id = ? AND type = ?`
  );
  db.transaction(() => {
    for (const txId of ids) stmt.run(Number(accountId), txId, TRANSACTION_TYPES.INVESTMENT);
  })();
  return { assigned: ids.length, accountId: Number(accountId) };
}

function recordInvestment({
  accountId,
  newAccountName,
  newAccountInstitution,
  direction,
  amount,
  transactionDate,
  description,
  reference,
} = {}) {
  const db = getDb();
  ensureInvestmentAccountSchema(db);

  let account;
  if (accountId) {
    account = getInvestmentAccount(accountId);
    if (!account) throw new Error("Investment account not found.");
  } else {
    account = createInvestmentAccount({
      name: newAccountName,
      institutionName: newAccountInstitution,
    });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Amount must be greater than zero");
  }
  if (!transactionDate) throw new Error("Date is required");

  const isReturn = String(direction || "placement") === "return";
  const signedAmount = isReturn ? Math.abs(numericAmount) : -Math.abs(numericAmount);

  const txId = addTransaction({
    memberId: null,
    type: TRANSACTION_TYPES.INVESTMENT,
    amount: signedAmount,
    transactionDate,
    description: String(description || "").trim() || account.name,
    reference: reference || null,
    source: "manual",
  });
  db.prepare(`UPDATE transactions SET investment_account_id = ? WHERE id = ?`).run(
    account.id,
    txId
  );

  queueCooperativeBankLedgerCsvSync("manual_investment");
  return { transactionId: txId, amount: signedAmount, accountId: account.id };
}

module.exports = {
  ensureInvestmentAccountSchema,
  syncAccountsFromTransactions,
  pruneAutoCreatedAccounts,
  listInvestmentAccounts,
  getInvestmentAccount,
  createInvestmentAccount,
  updateInvestmentAccount,
  deleteInvestmentAccount,
  listInvestmentEntries,
  assignInvestmentEntries,
  recordInvestment,
};
