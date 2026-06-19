const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  setCooperativeSetting,
  getCooperativeSetting,
} = require("./cooperative-settings");

const CD_TERM_SETTING_KEYS = [
  "cd_term_start_balance",
  "cd_renewal_date",
  "cd_maturity_date",
  "cd_annual_rate",
  "cd_apy",
  "cd_term_days",
  "cd_opened_date",
];

const CD_TERM_DEFAULTS = {
  cd_term_start_balance: "7176.28",
  cd_renewal_date: "2026-04-15",
  cd_maturity_date: "2026-07-14",
  cd_annual_rate: "0.0296",
  cd_apy: "0.03",
  cd_term_days: "90",
  cd_opened_date: "2025-07-19",
};

function daysBetweenIso(startIso, endIso) {
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86400000));
}

function getCdTermSettings(db) {
  ensureSettingsTable(db);
  const settings = {};
  for (const key of CD_TERM_SETTING_KEYS) {
    const row = db.prepare(`SELECT value FROM cooperative_settings WHERE key = ?`).get(key);
    settings[key] = row ? row.value : CD_TERM_DEFAULTS[key] || null;
  }
  return settings;
}

function setCdTermSettings(db, values = {}) {
  for (const key of CD_TERM_SETTING_KEYS) {
    if (values[key] != null && values[key] !== "") {
      setCooperativeSetting(db, key, values[key]);
    }
  }
}

function getCdTermMetrics({ balance, asOf, termSettings }) {
  if (balance == null || !asOf) return null;

  const termStartBalance = Number(termSettings.cd_term_start_balance);
  const annualRate = Number(termSettings.cd_annual_rate || "0.0296");
  const apy = Number(termSettings.cd_apy || "0.03");
  const termDays = Number(termSettings.cd_term_days || "90");
  const maturityDate = termSettings.cd_maturity_date;
  const renewalDate = termSettings.cd_renewal_date;
  const openedDate = termSettings.cd_opened_date;

  if (!Number.isFinite(termStartBalance) || !maturityDate) return null;

  const termInterestEarned = Math.max(0, balance - termStartBalance);
  const daysRemaining = daysBetweenIso(asOf, maturityDate);
  const futureInterest = balance * annualRate * (daysRemaining / 365);
  const totalProjectedTermInterest = termStartBalance * annualRate * (termDays / 365);

  return {
    termStartBalance,
    termInterestEarned,
    futureInterest,
    totalProjectedTermInterest,
    maturityDate,
    renewalDate,
    openedDate,
    annualRate,
    apy,
    termDays,
    daysRemaining,
  };
}

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
  const termSettings = getCdTermSettings(db);
  const termMetrics =
    balance != null && asOf ? getCdTermMetrics({ balance, asOf, termSettings }) : null;
  const accruedInterest =
    termMetrics != null
      ? termMetrics.termInterestEarned
      : balance != null
        ? Math.max(0, balance - openPrincipal)
        : null;

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
    termSettings,
    termMetrics,
    history,
  };
}

function updateCdBalance({ balance, asOfDate, note, termSettings }) {
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
  const settings = getCdTermSettings(db);
  const accruedInterest = Math.max(0, amount - (Number(settings.cd_term_start_balance) || openPrincipal));

  const run = db.transaction(() => {
    setCooperativeSetting(db, "cd_balance", amount);
    setCooperativeSetting(db, "cd_balance_as_of", asOf);
    if (termSettings) setCdTermSettings(db, termSettings);
    else setCdTermSettings(db, CD_TERM_DEFAULTS);
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
    termMetrics: getCdTermMetrics({
      balance: amount,
      asOf,
      termSettings: getCdTermSettings(db),
    }),
  };
}

module.exports = {
  getCdBalanceSnapshot,
  updateCdBalance,
  getOpenCdPrincipal,
  getCdTermMetrics,
  CD_TERM_DEFAULTS,
};
