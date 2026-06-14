#!/usr/bin/env node
/**
 * Checkpoint the dev database and copy it to the project root data/ folder
 * used by PeerFinanceManager.exe. Removes stale WAL/SHM files that cause
 * "database disk image is malformed" errors.
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const root = path.join(__dirname, "..", "..");
const coopDataDir = path.join(root, "data");
const srcDir = fs.existsSync(path.join(coopDataDir, "peerfinance.db"))
  ? coopDataDir
  : path.join(__dirname, "..", "data");
const destDir = path.join(root, "data");
const srcDb = path.join(srcDir, "peerfinance.db");
const destDb = path.join(destDir, "peerfinance.db");

function checkpoint(dbPath) {
  const db = new Database(dbPath);
  db.pragma("wal_checkpoint(TRUNCATE)");
  const bank = db
    .prepare(`SELECT COUNT(1) AS c FROM transactions WHERE source = 'bank_import'`)
    .get().c;
  const integ = db.pragma("integrity_check");
  db.close();
  const integrity =
    typeof integ[0] === "string" ? integ[0] : integ[0]?.integrity_check || String(integ[0]);
  return { bank, integrity };
}

function removeWalPair(dbPath) {
  for (const suffix of ["-wal", "-shm"]) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

if (!fs.existsSync(srcDb)) {
  console.error("Source database missing:", srcDb);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const srcMeta = checkpoint(srcDb);
console.log("Source DB:", srcMeta);

removeWalPair(destDb);
fs.copyFileSync(srcDb, destDb);
removeWalPair(destDb);

const seedDb = path.join(destDir, "peerfinance.seed.db");
fs.copyFileSync(srcDb, seedDb);
removeWalPair(seedDb);

const schemaSrc = path.join(__dirname, "..", "db", "schema.sql");
const schemaDest = path.join(root, "db", "schema.sql");
fs.mkdirSync(path.dirname(schemaDest), { recursive: true });
fs.copyFileSync(schemaSrc, schemaDest);

const publicSrc = path.join(__dirname, "..", "public");
const publicDest = path.join(root, "public");
for (const name of ["app.js", "index.html", "styles.css"]) {
  const from = path.join(publicSrc, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(publicDest, name));
}

const destMeta = checkpoint(destDb);
console.log("Root DB synced:", destMeta);

if (destMeta.integrity !== "ok") {
  console.error("Integrity check failed after sync");
  process.exit(1);
}

console.log("Done — restart PeerFinanceManager.exe");
