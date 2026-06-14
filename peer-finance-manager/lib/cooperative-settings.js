const { getDb } = require("../db/database");

function ensureSettingsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cooperative_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function setCooperativeSetting(db, key, value) {
  db.prepare(
    `INSERT INTO cooperative_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(key, String(value));
}

function getCooperativeSetting(key) {
  const db = getDb();
  ensureSettingsTable(db);
  const row = db.prepare(`SELECT value FROM cooperative_settings WHERE key = ?`).get(key);
  return row ? row.value : null;
}

module.exports = {
  ensureSettingsTable,
  setCooperativeSetting,
  getCooperativeSetting,
};
