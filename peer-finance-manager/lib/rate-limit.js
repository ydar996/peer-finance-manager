"use strict";

// In-memory sliding-window rate limiter. Single-process app, so a Map is enough.
// Keyed by client IP (req.ip honors app.set("trust proxy") on the Render edge).

const buckets = new Map();
let sweepTimer = null;

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

function rateLimit(scope, { windowMs, max, message }) {
  ensureSweeper();
  return (req, res, next) => {
    const key = clientKey(req, scope);
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry) {
      entry = { hits: [], windowMs };
      buckets.set(key, entry);
    }
    entry.hits = entry.hits.filter((t) => now - t < windowMs);
    if (entry.hits.length >= max) {
      const retryAfterSec = Math.ceil((entry.hits[0] + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(retryAfterSec, 1)));
      return res.status(429).json({ error: message || "Too many requests. Try again shortly." });
    }
    entry.hits.push(now);
    next();
  };
}

// Test helper
function resetRateLimits() {
  buckets.clear();
}

module.exports = { rateLimit, resetRateLimits };
