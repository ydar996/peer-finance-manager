"use strict";

// Two-factor authentication (TOTP) for Cooperative admin and staff accounts.
// Secrets live on the org DB users row; pending-login tickets live in the
// registry alongside sessions.

const crypto = require("crypto");
const { getDb } = require("../db/database");
const { runWithOrg, getOrgSlug } = require("./org-context");
const { getRegistryDb } = require("./organization-service");
const { generateSecret, verifyTotp, buildOtpauthUri } = require("./totp");

const MFA_ISSUER = "Peer Finance Manager";
const MFA_TICKET_TTL_MS = 3 * 60 * 1000;
const MFA_TICKET_MAX_ATTEMPTS = 5;
const MFA_ROLES = new Set(["admin", "staff"]);

function ensureMfaSchema() {
  const db = getRegistryDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mfa_tickets (
      id TEXT PRIMARY KEY,
      organization_slug TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (organization_slug) REFERENCES organizations(slug) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_tickets_org ON mfa_tickets(organization_slug);
  `);
}

function ensureUserMfaColumns(db) {
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  if (!cols.includes("mfa_secret")) {
    db.exec(`ALTER TABLE users ADD COLUMN mfa_secret TEXT`);
  }
  if (!cols.includes("mfa_enabled_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN mfa_enabled_at TEXT`);
  }
}

function getUserMfaRow(userId) {
  const db = getDb();
  ensureUserMfaColumns(db);
  return db
    .prepare(`SELECT id, role, mfa_secret, mfa_enabled_at FROM users WHERE id = ? AND active = 1`)
    .get(Number(userId));
}

function mfaEligible(role) {
  return MFA_ROLES.has(String(role || ""));
}

/** Is this user required to pass a TOTP challenge at login? */
function isMfaEnabled(userId) {
  const row = getUserMfaRow(userId);
  return Boolean(row?.mfa_enabled_at && row?.mfa_secret);
}

function getMfaStatus(user) {
  const row = getUserMfaRow(user.id);
  return {
    eligible: mfaEligible(user.role),
    enabled: Boolean(row?.mfa_enabled_at && row?.mfa_secret),
    enabledAt: row?.mfa_enabled_at || null,
  };
}

/** Begin enrollment: stores a pending secret (not yet active). */
function startMfaEnrollment(user) {
  if (!mfaEligible(user.role)) {
    throw new Error("Two-factor authentication is available for Admin and Staff accounts");
  }
  const db = getDb();
  ensureUserMfaColumns(db);
  const secret = generateSecret();
  db.prepare(`UPDATE users SET mfa_secret = ?, mfa_enabled_at = NULL WHERE id = ?`).run(
    secret,
    Number(user.id)
  );
  return {
    secret,
    otpauthUri: buildOtpauthUri({
      secret,
      account: user.email || user.username || `user-${user.id}`,
      issuer: MFA_ISSUER,
    }),
  };
}

/** Confirm enrollment: requires a valid code from the pending secret. */
function confirmMfaEnrollment(userId, code) {
  const db = getDb();
  ensureUserMfaColumns(db);
  const row = db
    .prepare(`SELECT mfa_secret, mfa_enabled_at FROM users WHERE id = ? AND active = 1`)
    .get(Number(userId));
  if (!row?.mfa_secret) throw new Error("Start two-factor setup first");
  if (row.mfa_enabled_at) return { enabled: true };
  if (!verifyTotp(row.mfa_secret, code)) {
    throw new Error("That code did not match. Check the time on your device and try again.");
  }
  db.prepare(`UPDATE users SET mfa_enabled_at = datetime('now') WHERE id = ?`).run(
    Number(userId)
  );
  return { enabled: true };
}

/** Turn MFA off for the signed-in user (caller must already be authed). */
function disableMfa(userId) {
  const db = getDb();
  ensureUserMfaColumns(db);
  db.prepare(`UPDATE users SET mfa_secret = NULL, mfa_enabled_at = NULL WHERE id = ?`).run(
    Number(userId)
  );
  return { enabled: false };
}

/** Admin reset for a locked-out account. */
function adminResetMfa(targetUserId) {
  return runWithOrg(getOrgSlug(), () => disableMfa(targetUserId));
}

/** Issue a short-lived ticket a login can exchange after the TOTP step. */
function createMfaTicket(organizationSlug, userId) {
  ensureMfaSchema();
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MFA_TICKET_TTL_MS).toISOString();
  getRegistryDb()
    .prepare(
      `INSERT INTO mfa_tickets (id, organization_slug, user_id, expires_at) VALUES (?, ?, ?, ?)`
    )
    .run(id, organizationSlug, Number(userId), expiresAt);
  return id;
}

/**
 * Validate a ticket and the TOTP code. Consumes the ticket on success and on
 * too many failures. Returns { organizationSlug, userId }.
 */
function verifyMfaChallenge(ticketId, code) {
  ensureMfaSchema();
  const registry = getRegistryDb();
  const ticket = registry
    .prepare(`SELECT id, organization_slug, user_id, expires_at, attempts FROM mfa_tickets WHERE id = ?`)
    .get(String(ticketId || ""));
  if (!ticket) throw new Error("Sign-in session expired. Log in again.");
  const expired = new Date(ticket.expires_at).getTime() < Date.now();
  if (expired || ticket.attempts >= MFA_TICKET_MAX_ATTEMPTS) {
    registry.prepare(`DELETE FROM mfa_tickets WHERE id = ?`).run(ticket.id);
    throw new Error("Sign-in session expired. Log in again.");
  }

  const orgSlug = ticket.organization_slug;
  const row = runWithOrg(orgSlug, () => getUserMfaRow(ticket.user_id));
  const ok = row?.mfa_secret && verifyTotp(row.mfa_secret, code);
  if (!ok) {
    registry
      .prepare(`UPDATE mfa_tickets SET attempts = attempts + 1 WHERE id = ?`)
      .run(ticket.id);
    throw new Error("That code did not match. Check your authenticator app and try again.");
  }

  registry.prepare(`DELETE FROM mfa_tickets WHERE id = ?`).run(ticket.id);
  return { organizationSlug: orgSlug, userId: ticket.user_id };
}

module.exports = {
  ensureMfaSchema,
  ensureUserMfaColumns,
  mfaEligible,
  isMfaEnabled,
  getMfaStatus,
  startMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  adminResetMfa,
  createMfaTicket,
  verifyMfaChallenge,
};
