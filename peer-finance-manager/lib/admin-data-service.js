const fs = require("fs");
const path = require("path");
const { closeDb } = require("../db/database");
const { getOrgDataDir } = require("./organization-service");
const { loadBetterSqlite3 } = require("./native-sqlite");
const { inspectDatabase } = require("./startup-seed");

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");

function removeWalPair(dbPath) {
  for (const suffix of ["-wal", "-shm"]) {
    const file = dbPath + suffix;
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (_) {}
    }
  }
}

function getOrgDatabasePath(orgSlug) {
  return path.join(getOrgDataDir(orgSlug), "peerfinance.db");
}

function checkpointDatabase(dbPath) {
  const Database = loadBetterSqlite3();
  const db = new Database(dbPath);
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

function readDatabaseStats(dbPath) {
  const inspected = inspectDatabase(dbPath);
  if (!inspected.exists || !inspected.integrityOk) {
    return { ...inspected, memberCount: null, latestTransaction: null };
  }
  const Database = loadBetterSqlite3();
  const db = new Database(dbPath, { readonly: true });
  try {
    const memberCount = db.prepare(`SELECT COUNT(1) AS c FROM members`).get().c;
    const latestTransaction = db
      .prepare(`SELECT MAX(transaction_date) AS d FROM transactions`)
      .get().d;
    return {
      ...inspected,
      memberCount,
      latestTransaction,
      sizeBytes: fs.statSync(dbPath).size,
    };
  } finally {
    db.close();
  }
}

function assertValidSqliteUpload(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Upload file not found.");
  }
  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    if (!header.slice(0, 16).equals(SQLITE_MAGIC)) {
      throw new Error("Upload must be a SQLite database file (peerfinance.db).");
    }
  } finally {
    fs.closeSync(fd);
  }
}

function buildBackupFilename(orgSlug) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${orgSlug}-peerfinance-${stamp}.db`;
}

function prepareDatabaseBackup(orgSlug) {
  const dbPath = getOrgDatabasePath(orgSlug);
  if (!fs.existsSync(dbPath)) {
    throw new Error("No database file found for this Cooperative.");
  }
  closeDb(orgSlug);
  checkpointDatabase(dbPath);
  removeWalPair(dbPath);
  const stats = readDatabaseStats(dbPath);
  return {
    dbPath,
    filename: buildBackupFilename(orgSlug),
    stats,
  };
}

function restoreDatabaseFromUpload(orgSlug, uploadPath) {
  assertValidSqliteUpload(uploadPath);
  const uploadStats = readDatabaseStats(uploadPath);
  if (!uploadStats.integrityOk) {
    throw new Error("Uploaded database failed integrity check.");
  }

  const dbPath = getOrgDatabasePath(orgSlug);
  const before = fs.existsSync(dbPath) ? readDatabaseStats(dbPath) : null;

  closeDb(orgSlug);

  let backupPath = null;
  if (fs.existsSync(dbPath)) {
    backupPath = `${dbPath}.bak-${Date.now()}`;
    fs.copyFileSync(dbPath, backupPath);
    removeWalPair(dbPath);
  }

  fs.copyFileSync(uploadPath, dbPath);
  removeWalPair(dbPath);

  const after = readDatabaseStats(dbPath);
  return {
    backupPath: backupPath ? path.basename(backupPath) : null,
    before,
    after,
  };
}

module.exports = {
  getOrgDatabasePath,
  prepareDatabaseBackup,
  restoreDatabaseFromUpload,
  readDatabaseStats,
  buildBackupFilename,
};
