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

function parseIsoDateOrThrow(value, label) {
  const iso = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`${label} must be a date (YYYY-MM-DD)`);
  }
  return iso;
}

function parsePercentToDecimal(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`${label} must be a percent between 0 and 100`);
  }
  return String(n / 100);
}

/** Map Record-tab form fields (percents and dates) to cooperative_settings keys. */
function parseCdTermPayload(body = {}) {
  const values = {};
  const termStart = body.termStartBalance ?? body.cd_term_start_balance;
  if (termStart != null && termStart !== "") {
    const n = Number(termStart);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error("Beginning Balance (This Term) must be a non-negative number");
    }
    values.cd_term_start_balance = String(n);
  }
  if (body.annualRatePercent != null && body.annualRatePercent !== "") {
    values.cd_annual_rate = parsePercentToDecimal(body.annualRatePercent, "Annual Rate");
  } else if (body.cd_annual_rate != null && body.cd_annual_rate !== "") {
    values.cd_annual_rate = String(body.cd_annual_rate);
  }
  if (body.apyPercent != null && body.apyPercent !== "") {
    values.cd_apy = parsePercentToDecimal(body.apyPercent, "APY");
  } else if (body.cd_apy != null && body.cd_apy !== "") {
    values.cd_apy = String(body.cd_apy);
  }
  if (body.renewalDate) {
    values.cd_renewal_date = parseIsoDateOrThrow(body.renewalDate, "Renewal Date");
  } else if (body.cd_renewal_date) {
    values.cd_renewal_date = parseIsoDateOrThrow(body.cd_renewal_date, "Renewal Date");
  }
  if (body.maturityDate) {
    values.cd_maturity_date = parseIsoDateOrThrow(body.maturityDate, "Maturity Date");
  } else if (body.cd_maturity_date) {
    values.cd_maturity_date = parseIsoDateOrThrow(body.cd_maturity_date, "Maturity Date");
  }
  if (body.openedDate) {
    values.cd_opened_date = parseIsoDateOrThrow(body.openedDate, "Opened Date");
  } else if (body.cd_opened_date) {
    values.cd_opened_date = parseIsoDateOrThrow(body.cd_opened_date, "Opened Date");
  }
  const termDaysRaw = body.termDays ?? body.cd_term_days;
  if (termDaysRaw != null && termDaysRaw !== "") {
    const n = Number(termDaysRaw);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("Term Length (Days) must be a positive number");
    }
    values.cd_term_days = String(Math.round(n));
  } else if (values.cd_renewal_date && values.cd_maturity_date) {
    const days = daysBetweenIso(values.cd_renewal_date, values.cd_maturity_date);
    if (days > 0) values.cd_term_days = String(days);
  }
  return Object.keys(values).length ? values : null;
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

  const run = db.transaction(() => {
    setCooperativeSetting(db, "cd_balance", amount);
    setCooperativeSetting(db, "cd_balance_as_of", asOf);
    if (termSettings) setCdTermSettings(db, termSettings);
    const result = db
      .prepare(
        `INSERT INTO cd_balance_updates (balance, as_of_date, note)
         VALUES (?, ?, ?)`
      )
      .run(amount, asOf, note ? String(note).trim() : null);
    return result.lastInsertRowid;
  });

  const updateId = run();
  const savedSettings = getCdTermSettings(db);
  const accruedInterest = Math.max(0, amount - (Number(savedSettings.cd_term_start_balance) || openPrincipal));

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
      termSettings: savedSettings,
    }),
  };
}

module.exports = {
  getCdBalanceSnapshot,
  updateCdBalance,
  getOpenCdPrincipal,
  getCdTermMetrics,
  parseCdTermPayload,
  CD_TERM_DEFAULTS,
};
