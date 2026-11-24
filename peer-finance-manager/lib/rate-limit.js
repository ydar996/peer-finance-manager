"use strict";

// Sliding-window rate limiter. Keyed by client IP (req.ip honors
// app.set("trust proxy") on the Render edge).
//
// Scopes marked `persist: true` write each hit to the platform registry
// database so throttles survive restarts and deploys. Without persistence a
// bounce would hand a brute-force attacker a fresh allowance. The api-flood
// scope intentionally stays memory-only: a flood after restart is a new
// flood anyway, and a DB write on every API call is not worth it.
// If the registry DB is unavailable the limiter falls back to the in-memory
// bucket rather than taking the app down with it.

const buckets = new Map();
let sweepTimer = null;
let persistedDb = null;
let persistedDbFailed = false;

function clientKey(req, scope) {
  return `${scope}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
}

function sweep() {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    entry.hits = entry.hits.filter((t) => now - t < entry.windowMs);
    if (!entry.hits.length) buckets.delete(key);
  }
}

function ensureSweeper() {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweep, 60 * 1000);
  if (sweepTimer.unref) sweepTimer.unref();
}

function persistStore() {
  if (persistedDb || persistedDbFailed) return persistedDb;
  try {
    const { getRegistryDb } = require("./organization-service");
    const db = getRegistryDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limit_hits (
        scope TEXT NOT NULL,
        client TEXT NOT NULL,
        hit_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rate_limit_hits
        ON rate_limit_hits(scope, client, hit_at);
    `);
    persistedDb = db;
  } catch (_) {
    persistedDbFailed = true;
  }
  return persistedDb;
}

function reject(res, retryAfterSec, message) {
  res.setHeader("Retry-After", String(Math.max(retryAfterSec, 1)));
  return res.status(429).json({ error: message || "Too many requests. Try again shortly." });
}

function rateLimit(scope, { windowMs, max, message, persist = false }) {
  ensureSweeper();
  return (req, res, next) => {
    const key = clientKey(req, scope);
    const now = Date.now();
    const db = persist ? persistStore() : null;

    if (db) {
      try {
        const since = now - windowMs;
        db.prepare(`DELETE FROM rate_limit_hits WHERE scope = ? AND client = ? AND hit_at < ?`)
          .run(scope, key, since);
        const row = db
          .prepare(
            `SELECT COUNT(*) AS n, MIN(hit_at) AS oldest
             FROM rate_limit_hits WHERE scope = ? AND client = ? AND hit_at >= ?`
          )
          .get(scope, key, since);
        if (row.n >= max) {
          return reject(res, Math.ceil((row.oldest + windowMs - now) / 1000), message);
        }
        db.prepare(`INSERT INTO rate_limit_hits (scope, client, hit_at) VALUES (?, ?, ?)`)
          .run(scope, key, now);
        return next();
      } catch (_) {
        // Fall through to the in-memory bucket on any storage failure.
      }
    }

    let entry = buckets.get(key);
    if (!entry) {
      entry = { hits: [], windowMs };
      buckets.set(key, entry);
    }
    entry.hits = entry.hits.filter((t) => now - t < windowMs);
    if (entry.hits.length >= max) {
      return reject(res, Math.ceil((entry.hits[0] + windowMs - now) / 1000), message);
    }
    entry.hits.push(now);
    next();
  };
}

// Test helper
function resetRateLimits() {
  buckets.clear();
  const db = persistStore();
  if (db) db.prepare(`DELETE FROM rate_limit_hits`).run();
}

module.exports = { rateLimit, resetRateLimits };
