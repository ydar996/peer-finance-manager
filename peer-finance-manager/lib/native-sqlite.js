const fs = require("fs");
const path = require("path");
const { isPackaged, getAppRoot } = require("./paths");
const { trace } = require("./trace-log");

function findPackagedNativeBinary() {
  const root = getAppRoot();
  const candidates = [
    path.join(root, "build", "Release", "better_sqlite3.node"),
    path.join(root, "better_sqlite3.node"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadBetterSqlite3() {
  if (isPackaged()) {
    const nativePath = findPackagedNativeBinary();
    trace.info("SQLite native check (packaged)", {
      nativePath: nativePath || "MISSING",
      appRoot: getAppRoot(),
      execPath: process.execPath,
    });
    if (!nativePath) {
      throw new Error(
        `Missing better_sqlite3.node beside the executable.\n` +
          `Looked in: ${path.join(getAppRoot(), "build", "Release")}\n` +
          `Run: npm run pfm:build`
      );
    }
  } else {
    trace.info("Loading SQLite (development)");
  }

  try {
    const Database = require("better-sqlite3");
    trace.info("better-sqlite3 loaded");
    return Database;
  } catch (err) {
    trace.error("better-sqlite3 failed to load", { message: err.message });
    throw new Error(
      `SQLite could not start: ${err.message}\n` +
        (isPackaged()
          ? "Rebuild the app with: npm run pfm:build"
          : "Try: npm rebuild better-sqlite3")
    );
  }
}

module.exports = { loadBetterSqlite3, findPackagedNativeBinary };
