const crypto = require("crypto");
const { getRegistryDb } = require("./organization-service");

const SESSION_DAYS = 7;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const DEFAULT_PLATFORM_ADMIN_EMAIL =
  process.env.PLATFORM_ADMIN_EMAIL || "ydaramola@gmail.com";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts[0] !== "scrypt" || parts.length !== 3) return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(expected, actual);
}

// Fixed dummy hash so unknown emails take the same time as real ones
// (prevents account-enumeration via response timing).
const DUMMY_PASSWORD_HASH = (() => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync("not-a-real-password", salt, 64, SCRYPT_PARAMS);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
})();

function sessionExpiryIso() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d.toISOString();
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function ensurePlatformAuthTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'super_admin',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_sessions (
      id TEXT PRIMARY KEY,
      platform_user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_platform_sessions_user ON platform_sessions(platform_user_id);
  `);
}

function mapPlatformUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || row.email,
    role: row.role,
    active: Boolean(row.active),
  };
}

function ensurePlatformAdminUser({
  email = DEFAULT_PLATFORM_ADMIN_EMAIL,
  password,
  displayName = "Platform Administrator",
} = {}) {
  const db = getRegistryDb();
  ensurePlatformAuthTables(db);
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Platform admin email is required");

  const existing = db
    .prepare(
      `SELECT id, email, password_hash FROM platform_users WHERE lower(email) = lower(?)`
    )
    .get(normalized);

  // An explicit password (arg or PLATFORM_ADMIN_PASSWORD env) is the
  // operator's recovery path: it rotates the hash and revokes sessions.
  // Without it, a restart must never revert a password set through the app.
  const recoveryPassword = password ?? process.env.PLATFORM_ADMIN_PASSWORD;

  if (existing) {
    if (recoveryPassword) {
      if (String(recoveryPassword).length < 8) {
        throw new Error("Platform admin password must be at least 8 characters");
      }
      if (!verifyPassword(recoveryPassword, existing.password_hash)) {
        db.prepare(
          `UPDATE platform_users SET password_hash = ?, display_name = ?, active = 1 WHERE id = ?`
        ).run(hashPassword(recoveryPassword), displayName, existing.id);
        db.prepare(`DELETE FROM platform_sessions WHERE platform_user_id = ?`).run(
          existing.id
        );
        return { created: false, email: normalized, id: existing.id, passwordRotated: true };
      }
    }
    db.prepare(
      `UPDATE platform_users SET display_name = ?, active = 1 WHERE id = ?`
    ).run(displayName, existing.id);
    return { created: false, email: normalized, id: existing.id };
  }

  let seedPassword = recoveryPassword;
  if (!seedPassword) {
    if (process.env.NODE_ENV === "production") {
      seedPassword = crypto.randomBytes(12).toString("base64url").slice(0, 16);
      console.warn(
        "[security] PLATFORM_ADMIN_PASSWORD is not set; generated a one-time platform admin password below. Set PLATFORM_ADMIN_PASSWORD in the environment to take control."
      );
      console.warn(`[security] platform admin password: ${seedPassword}`);
    } else {
      seedPassword = "12345678";
    }
  }
  if (String(seedPassword).length < 8) {
    throw new Error("Platform admin password must be at least 8 characters");
  }

  const result = db
    .prepare(
      `INSERT INTO platform_users (email, password_hash, display_name, role, active)
       VALUES (?, ?, ?, 'super_admin', 1)`
    )
    .run(normalized, hashPassword(seedPassword), displayName);
  return { created: true, email: normalized, id: result.lastInsertRowid };
}

function platformLogin(email, password) {
  const db = getRegistryDb();
  ensurePlatformAuthTables(db);
  const row = db
    .prepare(`SELECT * FROM platform_users WHERE lower(email) = lower(?) AND active = 1`)
    .get(normalizeEmail(email));
  if (!row) {
    try {
      verifyPassword(password, DUMMY_PASSWORD_HASH);
    } catch (_) {
      /* timing equalization only */
    }
    throw new Error("Invalid email or password");
  }
  if (!verifyPassword(password, row.password_hash)) {
    throw new Error("Invalid email or password");
  }
  const token = createSessionToken();
  db.prepare(
    `INSERT INTO platform_sessions (id, platform_user_id, expires_at) VALUES (?, ?, ?)`
  ).run(token, row.id, sessionExpiryIso());
  return { token, user: mapPlatformUser(row) };
}

function platformLogout(token) {
  if (!token) return;
  getRegistryDb().prepare(`DELETE FROM platform_sessions WHERE id = ?`).run(token);
}

function getPlatformSession(token) {
  if (!token) return null;
  const db = getRegistryDb();
  ensurePlatformAuthTables(db);
  const session = db
    .prepare(
      `SELECT s.id, s.expires_at, u.id AS user_id, u.email, u.display_name, u.role, u.active
       FROM platform_sessions s
       JOIN platform_users u ON u.id = s.platform_user_id
       WHERE s.id = ?`
    )
    .get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM platform_sessions WHERE id = ?`).run(token);
    return null;
  }
  if (!session.active) return null;
  return {
    token: session.id,
    user: mapPlatformUser({
      id: session.user_id,
      email: session.email,
      display_name: session.display_name,
      role: session.role,
      active: session.active,
    }),
  };
}

module.exports = {
  ensurePlatformAdminUser,
  platformLogin,
  platformLogout,
  getPlatformSession,
  DEFAULT_PLATFORM_ADMIN_EMAIL,
};
