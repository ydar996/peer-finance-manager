const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  setCooperativeSetting,
  getCooperativeSetting,
} = require("./cooperative-settings");
const { getLedgerEndingBalance } = require("./cooperative-bank-ledger-csv");

function ensureCheckingBalanceHistoryTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checking_balance_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance REAL NOT NULL,
      as_of_date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_checking_balance_updates_date ON checking_balance_updates(as_of_date);
  `);
}

function resolveCheckingBalanceForReport(asOfDateIso) {
  const asOf = String(asOfDateIso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("Report as-of date is required to resolve checking balance");
  }

  const balanceRaw = getCooperativeSetting("checking_balance");
  const statementAsOf = getCooperativeSetting("checking_balance_as_of");
  const statementBalance = balanceRaw != null ? Number(balanceRaw) : null;

  if (
    statementBalance != null &&
    Number.isFinite(statementBalance) &&
    statementAsOf &&
    statementAsOf <= asOf
  ) {
    return {
      balance: Math.round(statementBalance * 100) / 100,
      asOf: statementAsOf,
      source: "statement",
    };
  }

  const ledger = getLedgerEndingBalance(asOf);
  if (ledger?.balance != null) {
    return {
      balance: ledger.balance,
      asOf: ledger.asOf,
      source: "ledger",
    };
  }

  throw new Error(
    "No checking account balance is available for this report date. Import the bank ledger or enter a statement balance on the Record tab."
  );
}

function getCheckingBalanceSnapshot() {
  const db = getDb();
  ensureSettingsTable(db);
  ensureCheckingBalanceHistoryTable(db);

  const balanceRaw = getCooperativeSetting("checking_balance");
  const asOf = getCooperativeSetting("checking_balance_as_of");
  const balance = balanceRaw != null ? Number(balanceRaw) : null;
  const ledger = getLedgerEndingBalance();

  const history = db
    .prepare(
      `SELECT id, balance, as_of_date, note, created_at
       FROM checking_balance_updates
       ORDER BY as_of_date DESC, id DESC`
    )
    .all();

  return {
    balance,
    asOf: asOf || null,
    ledgerBalance: ledger?.balance ?? null,
    ledgerAsOf: ledger?.asOf ?? null,
    history,
  };
}

function updateCheckingBalance({ balance, asOfDate, note }) {
  const amount = Number(balance);
  if (!Number.isFinite(amount)) {
    throw new Error("Bank balance must be a number");
  }

  const asOf = String(asOfDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("As-of date is required (YYYY-MM-DD)");
  }

  const db = getDb();
  ensureSettingsTable(db);
  ensureCheckingBalanceHistoryTable(db);

  const run = db.transaction(() => {
    setCooperativeSetting(db, "checking_balance", amount);
    setCooperativeSetting(db, "checking_balance_as_of", asOf);
    const result = db
      .prepare(
        `INSERT INTO checking_balance_updates (balance, as_of_date, note)
         VALUES (?, ?, ?)`
      )
      .run(amount, asOf, note ? String(note).trim() : null);
    return result.lastInsertRowid;
  });

  const updateId = run();
  const ledger = getLedgerEndingBalance();

  return {
    id: updateId,
    balance: amount,
    asOf,
    note: note ? String(note).trim() : null,
    ledgerBalance: ledger?.balance ?? null,
    ledgerAsOf: ledger?.asOf ?? null,
  };
}

module.exports = {
  getCheckingBalanceSnapshot,
  updateCheckingBalance,
  resolveCheckingBalanceForReport,
};
