const fs = require("fs");
const path = require("path");
const { getDb } = require("../db/database");
const { getAppRoot, getDataDir } = require("./paths");
const { trace } = require("./trace-log");
const { importFromSpreadsheet } = require("./import-spreadsheet");
const { importWpformsProfiles } = require("./import-wpforms-profiles");
const { loadBetterSqlite3 } = require("./native-sqlite");
const { runWithOrg } = require("./org-context");
const {
  ASSURANCE_SLUG,
  getOrgDataDir,
  migrateLegacyDatabaseIfNeeded,
} = require("./organization-service");

function findWpformsCsv() {
  const root = getAppRoot();
  const candidates = [];
  try {
    for (const f of fs.readdirSync(root)) {
      if (f.startsWith("wpforms-") && f.endsWith(".csv")) {
        candidates.push(path.join(root, f));
      }
    }
  } catch (_) {}
  candidates.push(
    path.join(
      root,
      "wpforms-5-Assurance-Investment-and-Cooperative-Inc.-New-Membership-Application-2025-09-17-17-31-51.csv"
    )
  );
  return candidates.find((p) => fs.existsSync(p)) || null;
}

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

function inspectDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return { exists: false, integrityOk: false, bankImport: -1 };
  }
  const Database = loadBetterSqlite3();
  try {
    const db = new Database(dbPath, { readonly: true });
    const integrity = db.pragma("integrity_check");
    const integrityOk =
      (typeof integrity[0] === "string" ? integrity[0] : integrity[0]?.integrity_check) === "ok";
    let bankImport = -1;
    try {
      bankImport = db
        .prepare(`SELECT COUNT(1) AS c FROM transactions WHERE source = 'bank_import'`)
        .get().c;
    } catch (_) {}
    db.close();
    return {
      exists: true,
      integrityOk,
      bankImport,
    };
  } catch (err) {
    return { exists: true, integrityOk: false, bankImport: -1, error: err.message };
  }
}

function restoreDatabaseFromSeed(dbPath, seedPath, reason) {
  const backup = `${dbPath}.bak-${Date.now()}`;
  try {
    fs.copyFileSync(dbPath, backup);
  } catch (_) {}
  removeWalPair(dbPath);
  fs.copyFileSync(seedPath, dbPath);
  removeWalPair(dbPath);
  trace.info("Restored database from seed", { reason, seedPath, backup });
}

function bootstrapOrgDatabase(orgSlug = ASSURANCE_SLUG) {
  const orgDir = getOrgDataDir(orgSlug);
  fs.mkdirSync(orgDir, { recursive: true });

  const dbPath = path.join(orgDir, "peerfinance.db");
  const seedPath = path.join(orgDir, "peerfinance.seed.db");
  const legacyDb = path.join(getDataDir(), "peerfinance.db");
  const legacySeed = path.join(getDataDir(), "peerfinance.seed.db");

  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, dbPath);
      removeWalPair(dbPath);
      trace.info("Initialized organization database from org seed", { orgSlug, seedPath });
    } else if (fs.existsSync(legacySeed)) {
      fs.copyFileSync(legacySeed, dbPath);
      fs.copyFileSync(legacySeed, seedPath);
      removeWalPair(dbPath);
      trace.info("Initialized organization database from bundled seed", { orgSlug, legacySeed });
    } else if (fs.existsSync(legacyDb)) {
      fs.copyFileSync(legacyDb, dbPath);
      removeWalPair(dbPath);
      trace.info("Initialized organization database from legacy database", { orgSlug, legacyDb });
    }
    return;
  }

  const live = inspectDatabase(dbPath);
  const seed = fs.existsSync(seedPath) ? inspectDatabase(seedPath) : null;

  const seedIsNewer =
    seed &&
    seed.integrityOk &&
    seed.bankImport > 0 &&
    (live.bankImport < 0 || live.bankImport < seed.bankImport);

  if (!live.integrityOk || seedIsNewer) {
    if (seed && seed.integrityOk) {
      restoreDatabaseFromSeed(
        dbPath,
        seedPath,
        !live.integrityOk ? "integrity" : "stale-ledger"
      );
      return;
    }
    removeWalPair(dbPath);
    trace.warn("Organization database needs repair but no seed file is available", {
      orgSlug,
      integrityOk: live.integrityOk,
      bankImport: live.bankImport,
      error: live.error,
    });
    return;
  }

  try {
    const Database = loadBetterSqlite3();
    const db = new Database(dbPath);
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
  } catch (err) {
    trace.warn("WAL checkpoint failed — clearing WAL files", { error: err.message });
    removeWalPair(dbPath);
  }
}

function ensureDatabaseFile(orgSlug = ASSURANCE_SLUG) {
  migrateLegacyDatabaseIfNeeded();
  bootstrapOrgDatabase(orgSlug);
}

function ensureCooperativeData() {
  migrateLegacyDatabaseIfNeeded();

  runWithOrg(ASSURANCE_SLUG, () => {
    bootstrapOrgDatabase(ASSURANCE_SLUG);

    const db = getDb();
    const memberCount = db.prepare(`SELECT COUNT(*) AS c FROM members`).get().c;

    if (memberCount === 0) {
      const xlsxCandidates = [
        path.join(getAppRoot(), "Assurance Status 4 2026.xlsx"),
        path.join(getAppRoot(), "Assurance Status 5 2026.xlsx"),
      ];
      for (const xlsx of xlsxCandidates) {
        if (fs.existsSync(xlsx)) {
          trace.info("Seeding ledger from spreadsheet", { xlsx });
          importFromSpreadsheet(xlsx, "April 2026", { replaceExisting: true });
          break;
        }
      }
    }

    const profileCount = db.prepare(`SELECT COUNT(*) AS c FROM member_profiles`).get().c;
    const membersAfter = db.prepare(`SELECT COUNT(*) AS c FROM members`).get().c;

    if (profileCount < membersAfter) {
      const csv = findWpformsCsv();
      if (csv) {
        trace.info("Importing member profiles from WPForms", { csv });
        const result = importWpformsProfiles(csv);
        trace.info("Profile import complete", {
          matched: result.matchedCount,
          unmatched: result.unmatchedApplications.length,
        });
      } else {
        trace.warn("WPForms CSV not found — member profiles not imported");
      }
    }

    const { ensureAssuranceAdminUser } = require("./auth-service");
    ensureAssuranceAdminUser();
  });
}

function scheduleStatementPregeneration() {
  setImmediate(() => {
    const { pregenerateMemberDepositStatements } = require("./pregenerate-member-statements");
    pregenerateMemberDepositStatements()
      .then((result) => {
        trace.info("Background statement pre-generation finished", result);
      })
      .catch((err) => {
        trace.warn("Background statement pre-generation failed", { error: err.message });
      });
  });
}

module.exports = { ensureCooperativeData, findWpformsCsv, ensureDatabaseFile, scheduleStatementPregeneration };
