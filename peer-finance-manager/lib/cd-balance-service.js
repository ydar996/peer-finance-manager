const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  setCooperativeSetting,
  getCooperativeSetting,
} = require("./cooperative-settings");

function ensureCdBalanceHistoryTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cd_balance_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance REAL NOT NULL,
      as_of_date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cd_balance_updates_date ON cd_balance_updates(as_of_date);
  `);
}

function getOpenCdPrincipal() {
  const db = getDb();
  const events = db
    .prepare(
      `SELECT type, amount
       FROM transactions
       WHERE type IN ('cd_purchase', 'cd_liquidation')
       ORDER BY transaction_date, id`
    )
    .all();

  const openLots = [];
  for (const ev of events) {
    if (ev.type === "cd_purchase") {
      openLots.push({ principal: Math.abs(ev.amount) });
      continue;
    }
    openLots.shift();
  }
  return openLots.reduce((sum, lot) => sum + lot.principal, 0);
}

function getCdBalanceSnapshot() {
  const db = getDb();
  ensureSettingsTable(db);
  ensureCdBalanceHistoryTable(db);

  const balanceRaw = getCooperativeSetting("cd_balance");
  const asOf = getCooperativeSetting("cd_balance_as_of");
  const balance = balanceRaw != null ? Number(balanceRaw) : null;
  const openPrincipal = getOpenCdPrincipal();
  const accruedInterest =
    balance != null ? Math.max(0, balance - openPrincipal) : null;

  const history = db
    .prepare(
      `SELECT id, balance, as_of_date, note, created_at
       FROM cd_balance_updates
       ORDER BY as_of_date DESC, id DESC`
    )
    .all();

  return {
    balance,
    asOf: asOf || null,
    openPrincipal,
    accruedInterest,
    history,
  };
}

function updateCdBalance({ balance, asOfDate, note }) {
  const amount = Number(balance);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("CD balance must be a non-negative number");
  }

  const asOf = String(asOfDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("As-of date is required (YYYY-MM-DD)");
  }

  const db = getDb();
  ensureSettingsTable(db);
  ensureCdBalanceHistoryTable(db);

  const openPrincipal = getOpenCdPrincipal();
  const accruedInterest = Math.max(0, amount - openPrincipal);

  const run = db.transaction(() => {
    setCooperativeSetting(db, "cd_balance", amount);
    setCooperativeSetting(db, "cd_balance_as_of", asOf);
    const result = db
      .prepare(
        `INSERT INTO cd_balance_updates (balance, as_of_date, note)
         VALUES (?, ?, ?)`
      )
      .run(amount, asOf, note ? String(note).trim() : null);
    return result.lastInsertRowid;
  });

  const updateId = run();

  return {
    id: updateId,
    balance: amount,
    asOf,
    note: note ? String(note).trim() : null,
    openPrincipal,
    accruedInterest,
  };
}

module.exports = {
  getCdBalanceSnapshot,
  updateCdBalance,
  getOpenCdPrincipal,
};
