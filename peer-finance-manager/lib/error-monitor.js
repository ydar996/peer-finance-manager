const fs = require("fs");
const path = require("path");
const { getDataDir } = require("./paths");

// Lightweight error monitoring: appends structured error records to
// data/security/errors.jsonl, captures HTTP 5xx responses, and forwards
// critical events to SECURITY_ALERT_WEBHOOK_URL (Slack/Discord/ntfy style
// JSON POST) when configured. No external dependency required.

const MAX_LOG_BYTES = 5 * 1024 * 1024; // rotate at 5 MB
const WEBHOOK_MIN_INTERVAL_MS = 60 * 1000;

function errorsLogPath() {
  return path.join(getDataDir(), "security", "errors.jsonl");
}

function ensureDir() {
  fs.mkdirSync(path.dirname(errorsLogPath()), { recursive: true });
}

function appendErrorRecord(record) {
  try {
    ensureDir();
    const file = errorsLogPath();
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_LOG_BYTES) {
        fs.renameSync(file, `${file}.1`);
      }
    } catch (_) {}
    fs.appendFileSync(file, JSON.stringify(record) + "\n");
  } catch (err) {
    console.error("[error-monitor] failed to write error log:", err.message);
  }
}

let lastWebhookAt = 0;
let webhookInFlight = false;

function maybeAlertWebhook(record) {
  const url = process.env.SECURITY_ALERT_WEBHOOK_URL;
  if (!url || webhookInFlight) return;
  const now = Date.now();
  if (now - lastWebhookAt < WEBHOOK_MIN_INTERVAL_MS) return;
  lastWebhookAt = now;
  webhookInFlight = true;
  const payload = JSON.stringify({
    text: `[PFM ${record.severity || "error"}] ${record.scope || "app"}: ${record.message}`,
    ...record,
  }).slice(0, 3500);
  const lib = url.startsWith("https") ? require("https") : require("http");
  try {
    const req = lib.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: 5000,
      },
      (res) => res.resume()
    );
    req.on("error", () => {});
    req.on("timeout", () => req.destroy());
    req.end(payload);
  } catch (_) {
    webhookInFlight = false;
  }
  setTimeout(() => {
    webhookInFlight = false;
  }, 10000);
}

function recordError({ scope = "app", severity = "error", message, stack = null, meta = null }) {
  const record = {
    ts: new Date().toISOString(),
    scope: String(scope).slice(0, 80),
    severity,
    message: String(message || "unknown").slice(0, 500),
    stack: stack ? String(stack).slice(0, 4000) : null,
    meta: meta ? String(meta).slice(0, 1000) : null,
  };
  appendErrorRecord(record);
  if (severity === "critical") maybeAlertWebhook(record);
  return record;
}

// Express middleware: logs every HTTP 5xx response once on finish.
function httpErrorMonitor() {
  return (req, res, next) => {
    res.on("finish", () => {
      const status = res.statusCode || 0;
      if (status >= 500) {
        recordError({
          scope: "http",
          severity: status >= 500 ? "error" : "info",
          message: `${req.method} ${req.originalUrl || req.url} -> ${status}`,
          meta: `ip=${req.ip || ""} ua=${String(req.headers?.["user-agent"] || "").slice(0, 120)}`,
        });
      }
    });
    next();
  };
}

function installProcessHandlers() {
  process.on("uncaughtException", (err) => {
    recordError({ scope: "process.uncaughtException", severity: "critical", message: err?.message, stack: err?.stack });
  });
  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    recordError({ scope: "process.unhandledRejection", severity: "error", message: err.message, stack: err.stack });
  });
}

module.exports = { recordError, httpErrorMonitor, installProcessHandlers, errorsLogPath };
