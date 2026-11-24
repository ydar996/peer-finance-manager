"use strict";

// One-time password-setup tokens for member portal emails. The raw token is
// only ever in the emailed link; the database stores its SHA-256 hash, so a
// leaked backup or query result cannot mint a working link. Single-use and
// time-boxed (default 24h).

const crypto = require("crypto");
const { getDb } = require("../db/database");
const { publicSiteOrigin } = require("./portal-urls");

const DEFAULT_TTL_HOURS = 24;

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_setup_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_user
      ON password_setup_tokens(user_id);
  `);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createPasswordSetupToken(userId, { ttlHours = DEFAULT_TTL_HOURS } = {}) {
  const db = getDb();
  ensureTable(db);
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `DELETE FROM password_setup_tokens WHERE user_id = ? OR expires_at < datetime('now')`
  ).run(userId);
  db.prepare(
    `INSERT INTO password_setup_tokens (token_hash, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+' || ? || ' hours'))`
  ).run(hashToken(token), userId, ttlHours);
  return token;
}

function consumePasswordSetupToken(token) {
  const db = getDb();
  ensureTable(db);
  const hash = hashToken(token);
  const row = db
    .prepare(
      `SELECT token_hash, user_id
       FROM password_setup_tokens
       WHERE token_hash = ? AND expires_at >= datetime('now')`
    )
    .get(hash);
  if (!row) return null;
  db.prepare(`DELETE FROM password_setup_tokens WHERE token_hash = ?`).run(hash);
  return row.user_id;
}

function buildPasswordSetupUrl(token, organizationSlug) {
  const base = `${publicSiteOrigin()}/set-password`;
  const org = String(organizationSlug || "").trim().toLowerCase();
  return `${base}?token=${encodeURIComponent(token)}${org ? `&org=${encodeURIComponent(org)}` : ""}`;
}

module.exports = {
  createPasswordSetupToken,
  consumePasswordSetupToken,
  buildPasswordSetupUrl,
};
