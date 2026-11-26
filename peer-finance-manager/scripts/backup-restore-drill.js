"use strict";

// Backup/restore drill: proves the encrypted backup -> decrypt -> restore
// path works end to end against a scratch copy of a real org. Run locally:
//
//   node scripts/backup-restore-drill.js [sourceSlug] [passphrase]
//
// Creates <source>-drilltest org, backs it up encrypted, restores it, and
// compares table row counts before/after. Cleans up afterwards.
// Exit code 0 = drill passed.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", ".."); // AssurCoop repo root
const APP = path.join(ROOT, "peer-finance-manager");
const DATA_DIR = path.join(ROOT, "data");
const ORGS_DIR = path.join(DATA_DIR, "organizations");
const REGISTRY_PATH = path.join(DATA_DIR, "registry.db");

const sourceSlug = (process.argv[2] || "assurance").trim().toLowerCase();
const passphrase = process.argv[3] || "drill-passphrase-2026";
const drillSlug = `${sourceSlug}-drilltest`.replace(/[^a-z0-9-]/g, "-");

const { loadBetterSqlite3 } = require(path.join(APP, "lib", "native-sqlite"));
const Database = loadBetterSqlite3();
const { encryptBackup, decryptBackup, isEncryptedBackup } = require(path.join(APP, "lib", "backup-crypto"));

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function tableCounts(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);
  const counts = {};
  for (const t of tables) {
    counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  }
  db.close();
  return counts;
}

function main() {
  const srcDir = path.join(ORGS_DIR, sourceSlug);
  const srcDb = path.join(srcDir, "peerfinance.db");
  if (!fs.existsSync(srcDb)) throw new Error(`Source org DB not found: ${srcDb}`);

  // 1. Copy org dir to the drill org.
  const drillDir = path.join(ORGS_DIR, drillSlug);
  if (fs.existsSync(drillDir)) fs.rmSync(drillDir, { recursive: true, force: true });
  fs.cpSync(srcDir, drillDir, { recursive: true });
  console.log(`[drill] copied ${sourceSlug} -> ${drillSlug}`);

  // 2. Register the drill org in the registry.
  const registry = new Database(REGISTRY_PATH);
  registry
    .prepare(`INSERT OR REPLACE INTO organizations (slug, name, created_at) VALUES (?, ?, datetime('now'))`)
    .run(drillSlug, `Drill Test (${sourceSlug})`);
  registry.close();

  const os = require(path.join(APP, "lib", "organization-service"));
  const { runWithOrg } = require(path.join(APP, "lib", "org-context"));
  const { prepareDatabaseBackup, restoreDatabaseFromUpload } = require(path.join(APP, "lib", "admin-data-service"));

  const drillDbPath = path.join(drillDir, "peerfinance.db");
  const beforeCounts = tableCounts(drillDbPath);

  // 3. Encrypted backup via the same service the admin endpoint uses.
  runWithOrg(drillSlug, () => {
    const { dbPath, filename } = prepareDatabaseBackup(drillSlug);
    const plaintext = fs.readFileSync(dbPath);
    const encPath = path.join(require("os").tmpdir(), `${drillSlug}-backup.enc`);
    fs.writeFileSync(encPath, encryptBackup(plaintext, passphrase));

    // 4. Prove tamper/wrong-passphrase rejection, then decrypt correctly.
    let rejected = false;
    try {
      decryptBackup(fs.readFileSync(encPath), "wrong-passphrase-xx");
    } catch (_) {
      rejected = true;
    }
    if (!rejected) throw new Error("FAIL: wrong passphrase did not fail decryption");

    const decrypted = decryptBackup(fs.readFileSync(encPath), passphrase);
    if (!isEncryptedBackup(fs.readFileSync(encPath))) throw new Error("FAIL: magic check");
    if (sha256(decrypted) !== sha256(plaintext)) {
      throw new Error("FAIL: decrypted bytes differ from source");
    }
    const decDbPath = path.join(DATA_DIR, `${drillSlug}-restored.db`);
    fs.writeFileSync(decDbPath, decrypted);

    // 5. Restore through the real restore path (integrity check + file swap).
    const result = restoreDatabaseFromUpload(drillSlug, decDbPath, {});
    if (!result.after?.integrityOk) throw new Error("FAIL: restored DB integrity check");
    fs.unlinkSync(decDbPath);
    fs.unlinkSync(encPath);
    console.log(`[drill] restore ok; backup artifact: ${filename}`);
  });

  // 6. Verify row counts match the pre-restore snapshot.
  const afterCounts = tableCounts(drillDbPath);
  const mismatches = Object.keys(beforeCounts).filter(
    (t) => beforeCounts[t] !== afterCounts[t]
  );
  if (mismatches.length) {
    throw new Error(`FAIL: row count drift on ${mismatches.join(", ")}`);
  }

  // 7. Cleanup: remove drill org dir + registry row.
  const { closeDb } = require(path.join(APP, "db", "database"));
  closeDb(drillSlug);
  fs.rmSync(drillDir, { recursive: true, force: true });
  const registry2 = new Database(REGISTRY_PATH);
  registry2.prepare(`DELETE FROM organizations WHERE slug = ?`).run(drillSlug);
  registry2.close();

  console.log(`[drill] PASSED: ${Object.keys(beforeCounts).length} tables verified identical`);
}

try {
  main();
} catch (err) {
  console.error(`[drill] FAILED: ${err.message}`);
  // best-effort cleanup
  try {
    const drillDir = path.join(ORGS_DIR, drillSlug);
    if (fs.existsSync(drillDir)) fs.rmSync(drillDir, { recursive: true, force: true });
    const registry = new Database(REGISTRY_PATH);
    registry.prepare(`DELETE FROM organizations WHERE slug = ?`).run(drillSlug);
    registry.close();
  } catch (_) {}
  process.exit(1);
}
