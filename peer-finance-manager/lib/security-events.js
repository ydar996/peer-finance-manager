const { getRegistryDb } = require("./organization-service");

// Append-only security event log, stored in the registry DB so events span
// every organization. Records are never updated or deleted by the app;
// retention is handled by export + manual pruning (see docs/SECURITY-OPS.md).
//
// Every helper is fire-and-forget safe: logging must never break a request.

let ensured = false;

function ensureTable() {
  if (ensured) return;
  getRegistryDb().exec(`
    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      organization_slug TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      actor_user_id INTEGER,
      actor_label TEXT,
      ip TEXT,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_security_events_ts ON security_events(ts);
    CREATE INDEX IF NOT EXISTS idx_security_events_slug ON security_events(organization_slug);
    CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
  `);
  ensured = true;
}

function recordSecurityEvent({
  organizationSlug = null,
  eventType,
  severity = "info",
  actorUserId = null,
  actorLabel = null,
  ip = null,
  detail = null,
}) {
  if (!eventType) return;
  try {
    ensureTable();
    getRegistryDb()
      .prepare(
        `INSERT INTO security_events
         (organization_slug, event_type, severity, actor_user_id, actor_label, ip, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        organizationSlug || null,
        String(eventType).slice(0, 80),
        severity,
        actorUserId || null,
        actorLabel ? String(actorLabel).slice(0, 200) : null,
        ip ? String(ip).slice(0, 64) : null,
        detail ? String(detail).slice(0, 4000) : null
      );
  } catch (err) {
    console.error("[security-events] failed to record event:", err.message);
  }
}

function clientIp(req) {
  return req?.ip || req?.headers?.["x-forwarded-for"] || null;
}

function actorFromRequest(req) {
  const user = req?.user || null;
  const label =
    user?.email ||
    user?.username ||
    (user?.displayName ? String(user.displayName).slice(0, 120) : null) ||
    null;
  return {
    organizationSlug: req?.orgSlug || user?.organizationSlug || null,
    actorUserId: user?.id || null,
    actorLabel: label,
    ip: clientIp(req),
  };
}

function listSecurityEvents({ organizationSlug = null, limit = 200 } = {}) {
  ensureTable();
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  if (organizationSlug) {
    return getRegistryDb()
      .prepare(
        `SELECT * FROM security_events WHERE organization_slug = ? ORDER BY id DESC LIMIT ?`
      )
      .all(String(organizationSlug).toLowerCase(), cap);
  }
  return getRegistryDb()
    .prepare(`SELECT * FROM security_events ORDER BY id DESC LIMIT ?`)
    .all(cap);
}

module.exports = { recordSecurityEvent, listSecurityEvents, clientIp };
