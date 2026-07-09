const { getDb } = require("../db/database");

function ensureBankAccountSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_label TEXT NOT NULL,
      institution_name TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'USD',
      statement_format TEXT NOT NULL DEFAULT 'auto',
      is_primary INTEGER NOT NULL DEFAULT 0,
      active_from TEXT,
      active_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_primary ON bank_accounts(is_primary);
  `);
}

function listBankAccounts({ includeInactive = true } = {}) {
  const db = getDb();
  ensureBankAccountSchema(db);
  const rows = db
    .prepare(
      `SELECT id, account_label AS accountLabel, institution_name AS institutionName,
              currency, statement_format AS statementFormat, is_primary AS isPrimary,
              active_from AS activeFrom, active_to AS activeTo,
              created_at AS createdAt, updated_at AS updatedAt
       FROM bank_accounts
       ORDER BY is_primary DESC, account_label ASC`
    )
    .all();
  if (includeInactive) return rows;
  const today = new Date().toISOString().slice(0, 10);
  return rows.filter((row) => {
    if (row.activeTo && row.activeTo < today) return false;
    if (row.activeFrom && row.activeFrom > today) return false;
    return true;
  });
}

function getBankAccount(id) {
  const db = getDb();
  ensureBankAccountSchema(db);
  return (
    db
      .prepare(
        `SELECT id, account_label AS accountLabel, institution_name AS institutionName,
                currency, statement_format AS statementFormat, is_primary AS isPrimary,
                active_from AS activeFrom, active_to AS activeTo
         FROM bank_accounts WHERE id = ?`
      )
      .get(Number(id)) || null
  );
}

function getPrimaryBankAccount() {
  const db = getDb();
  ensureBankAccountSchema(db);
  let row = db
    .prepare(
      `SELECT id, account_label AS accountLabel, institution_name AS institutionName,
              currency, statement_format AS statementFormat, is_primary AS isPrimary
       FROM bank_accounts WHERE is_primary = 1 ORDER BY id LIMIT 1`
    )
    .get();
  if (row) return row;
  row = db
    .prepare(
      `SELECT id, account_label AS accountLabel, institution_name AS institutionName,
              currency, statement_format AS statementFormat, is_primary AS isPrimary
       FROM bank_accounts ORDER BY id LIMIT 1`
    )
    .get();
  return row || null;
}

function ensureDefaultBankAccount({ institutionName = "", currency = "USD" } = {}) {
  const db = getDb();
  ensureBankAccountSchema(db);
  const existing = getPrimaryBankAccount();
  if (existing) return existing;

  const result = db
    .prepare(
      `INSERT INTO bank_accounts (account_label, institution_name, currency, is_primary)
       VALUES (?, ?, ?, 1)`
    )
    .run(
      "Main Operating Account",
      String(institutionName || "").trim(),
      String(currency || "USD").trim().toUpperCase() || "USD"
    );

  return getBankAccount(result.lastInsertRowid);
}

function createBankAccount({
  accountLabel,
  institutionName,
  currency,
  statementFormat,
  isPrimary,
  activeFrom,
  activeTo,
}) {
  const db = getDb();
  ensureBankAccountSchema(db);
  const label = String(accountLabel || "").trim();
  if (!label) throw new Error("Account label is required.");

  const run = db.transaction(() => {
    if (isPrimary) {
      db.prepare(`UPDATE bank_accounts SET is_primary = 0`).run();
    }
    const info = db
      .prepare(
        `INSERT INTO bank_accounts
          (account_label, institution_name, currency, statement_format, is_primary, active_from, active_to)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        label,
        String(institutionName || "").trim(),
        String(currency || "USD").trim().toUpperCase() || "USD",
        String(statementFormat || "auto").trim() || "auto",
        isPrimary ? 1 : 0,
        activeFrom || null,
        activeTo || null
      );
    return info.lastInsertRowid;
  });

  const id = run();
  return getBankAccount(id);
}

function updateBankAccount(id, patch = {}) {
  const db = getDb();
  ensureBankAccountSchema(db);
  const current = getBankAccount(id);
  if (!current) throw new Error("Bank account not found.");

  const run = db.transaction(() => {
    if (patch.isPrimary) {
      db.prepare(`UPDATE bank_accounts SET is_primary = 0`).run();
    }
    db.prepare(
      `UPDATE bank_accounts SET
        account_label = ?,
        institution_name = ?,
        currency = ?,
        statement_format = ?,
        is_primary = ?,
        active_from = ?,
        active_to = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      patch.accountLabel != null ? String(patch.accountLabel).trim() : current.accountLabel,
      patch.institutionName != null ? String(patch.institutionName).trim() : current.institutionName,
      patch.currency != null
        ? String(patch.currency).trim().toUpperCase()
        : current.currency,
      patch.statementFormat != null ? String(patch.statementFormat).trim() : current.statementFormat,
      patch.isPrimary != null ? (patch.isPrimary ? 1 : 0) : current.isPrimary ? 1 : 0,
      patch.activeFrom !== undefined ? patch.activeFrom || null : current.activeFrom,
      patch.activeTo !== undefined ? patch.activeTo || null : current.activeTo,
      Number(id)
    );
  });

  run();
  return getBankAccount(id);
}

module.exports = {
  ensureBankAccountSchema,
  listBankAccounts,
  getBankAccount,
  getPrimaryBankAccount,
  ensureDefaultBankAccount,
  createBankAccount,
  updateBankAccount,
};
