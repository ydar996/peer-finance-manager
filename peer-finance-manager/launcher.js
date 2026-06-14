#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const { exec, spawnSync } = require("child_process");
const { initPaths, getDataDir, getAppRoot, getPublicDir, isPackaged } = require("./lib/paths");
const { trace } = require("./lib/trace-log");
const { killPort } = require("./lib/kill-port");
const { ensureSingleInstance } = require("./lib/kill-existing-instances");

const PORT = Number(process.env.PFM_PORT || 3457);

function pauseOnExit(code) {
  if (process.env.PFM_NO_PAUSE === "1") {
    process.exit(code);
    return;
  }
  if (process.platform === "win32") {
    try {
      spawnSync("cmd.exe", ["/c", "pause"], { stdio: "inherit" });
    } catch (_) {}
  }
  process.exit(code);
}

function setupFatalHandlers() {
  process.on("uncaughtException", (err) => {
    trace.error("Uncaught exception", {
      message: err.message,
      stack: err.stack,
    });
    console.error("\n*** The app stopped because of an error. See details above.");
    if (trace.getLogPath()) {
      console.error(`Log file: ${trace.getLogPath()}`);
    }
    pauseOnExit(1);
  });

  process.on("unhandledRejection", (reason) => {
    trace.error("Unhandled rejection", {
      reason: reason && reason.message ? reason.message : String(reason),
    });
    console.error("\n*** The app stopped because of an unhandled error.");
    pauseOnExit(1);
  });
}

function openBrowser() {
  const url = `http://localhost:${PORT}/admin`;
  trace.info("Opening browser", { url });
  if (process.platform === "win32") {
    exec(`start "" "${url}"`, { windowsHide: true });
  }
}

function ensureSeedDatabase() {
  const { ensureCooperativeData, scheduleStatementPregeneration } = require("./lib/startup-seed");
  ensureCooperativeData();
  scheduleStatementPregeneration();
}

function main() {
  setupFatalHandlers();

  trace.info("=== Peer Finance Manager starting ===", {
    packaged: isPackaged(),
    execPath: process.execPath,
    cwd: process.cwd(),
    node: process.version,
    port: PORT,
  });

  initPaths(isPackaged() ? path.dirname(process.execPath) : undefined);
  trace.init(getDataDir());

  trace.info("Paths resolved", {
    appRoot: getAppRoot(),
    dataDir: getDataDir(),
    publicDir: getPublicDir(),
    publicExists: fs.existsSync(getPublicDir()),
    logFile: trace.getLogPath(),
  });

  ensureSingleInstance(PORT);
  killPort(PORT);

  trace.info("Preparing organization registry and Assurance database");
  const { migrateLegacyDatabaseIfNeeded } = require("./lib/organization-service");
  migrateLegacyDatabaseIfNeeded();
  ensureSeedDatabase();

  trace.info("Starting HTTP server");
  const { startServer } = require("./server");
  startServer(PORT, (err) => {
    if (err) {
      trace.error("Server failed to start", {
        message: err.message,
        code: err.code,
      });
      if (err.code === "EADDRINUSE") {
        console.error(`\nPort ${PORT} is already in use. Close the other copy of this app and try again.`);
      }
      pauseOnExit(1);
      return;
    }

    console.log("");
    console.log("  Peer Finance Manager");
    console.log(`  Running at http://localhost:${PORT}`);
    console.log("  Keep this window open while using the app.");
    if (trace.getLogPath()) {
      console.log(`  Log file: ${trace.getLogPath()}`);
    }
    console.log("  Press Ctrl+C to stop.");
    console.log("");

    setTimeout(openBrowser, 1200);
  });
}

try {
  main();
} catch (err) {
  trace.error("Startup failed", { message: err.message, stack: err.stack });
  console.error("\n*** Startup failed:", err.message);
  pauseOnExit(1);
}
