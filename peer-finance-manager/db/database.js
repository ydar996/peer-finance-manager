const fs = require("fs");
const path = require("path");
const { getSchemaPath } = require("../lib/paths");
const { loadBetterSqlite3 } = require("../lib/native-sqlite");
const { trace } = require("../lib/trace-log");
const { getOrgSlugOrNull } = require("../lib/org-context");
const {
  getOrgDataDir,
  migrateLegacyDatabaseIfNeeded,
  ASSURANCE_SLUG,
} = require("../lib/organization-service");

const dbByOrg = new Map();

function applyBankImportMigrations(database) {
  const { ensureBankAccountSchema } = require("../lib/bank-account-service");
  ensureBankAccountSchema(database);

  const txCols = database.prepare(`PRAGMA table_info(transactions)`).all().map((c) => c.name);
  if (!txCols.includes("bank_account_id")) {
    database.exec(`ALTER TABLE transactions ADD COLUMN bank_account_id INTEGER`);
  }
  if (!txCols.includes("import_fingerprint")) {
    database.exec(`ALTER TABLE transactions ADD COLUMN import_fingerprint TEXT`);
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_import_fingerprint
      ON transactions(import_fingerprint)
      WHERE import_fingerprint IS NOT NULL AND import_fingerprint != '';
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_bank_account
      ON transactions(bank_account_id);
  `);
}

function applyMemberMigrations(database) {
  const cols = database.prepare(`PRAGMA table_info(members)`).all().map((c) => c.name);
  if (!cols.includes("member_number")) {
    database.exec(`ALTER TABLE members ADD COLUMN member_number TEXT`);
  }
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_members_number ON members(member_number) WHERE member_number IS NOT NULL`
  );
}

function applyProfileMigrations(database) {
  const cols = database
    .prepare(`PRAGMA table_info(member_profiles)`)
    .all()
    .map((c) => c.name);
  if (!cols.includes("next_of_kin_email")) {
    database.exec(`ALTER TABLE member_profiles ADD COLUMN next_of_kin_email TEXT`);
  }
}

function applyAuthMigrations(database) {
  const cols = database.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  if (!cols.includes("username")) {
    database.exec(`ALTER TABLE users ADD COLUMN username TEXT`);
  }
  if (!cols.includes("must_change_password")) {
    database.exec(
      `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`
    );
  }
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`
  );
}

/** Drop WAL/SHM left from a prior server run when peerfinance.db was replaced (e.g. Admin → Maintenance restore). */
function removeStaleWalSidecars(dbPath) {
  if (!fs.existsSync(dbPath)) return;
  const dbMtime = fs.statSync(dbPath).mtimeMs;
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbPath}${suffix}`;
    if (!fs.existsSync(sidecar)) continue;
    const sideMtime = fs.statSync(sidecar).mtimeMs;
    if (dbMtime >= sideMtime) {
      fs.unlinkSync(sidecar);
      trace.info("Removed stale SQLite sidecar after database upload", {
        sidecar,
        dbMtime,
        sideMtime,
      });
    }
  }
}

function openOrgDatabase(orgSlug) {
  const slug = String(orgSlug || "").trim().toLowerCase();
  if (!slug) throw new Error("Organization code is required");

  if (dbByOrg.has(slug)) return dbByOrg.get(slug);

  const orgDir = getOrgDataDir(slug);
  const dbPath = path.join(orgDir, "peerfinance.db");
  const schemaPath = getSchemaPath();

  fs.mkdirSync(orgDir, { recursive: true });
  fs.mkdirSync(path.join(orgDir, "uploads"), { recursive: true });
  fs.mkdirSync(path.join(orgDir, "uploads", "photos"), { recursive: true });
  fs.mkdirSync(path.join(orgDir, "uploads", "membership-status"), { recursive: true });
  fs.mkdirSync(path.join(orgDir, "exports"), { recursive: true });

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Database schema not found: ${schemaPath}`);
  }

  removeStaleWalSidecars(dbPath);
  trace.info("Opening organization database", { orgSlug: slug, dbPath, schemaPath });
  const Database = loadBetterSqlite3();
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(fs.readFileSync(schemaPath, "utf8"));
  applyAuthMigrations(database);
  applyMemberMigrations(database);
  applyProfileMigrations(database);
  applyBankImportMigrations(database);
  try {
    const { ensureLedgerAdjustmentSchema } = require("../lib/ledger-adjustment-service");
    ensureLedgerAdjustmentSchema(database);
  } catch (_) {}
  try {
    const { seedDefaultAliasesIfEmpty } = require("../lib/member-payment-alias-service");
    seedDefaultAliasesIfEmpty(database);
  } catch (_) {}
  try {
    const { ensureLoanDocumentSchema } = require("../lib/flexxforms-service");
    ensureLoanDocumentSchema(database);
  } catch (_) {}
  try {
    const { ensureLoanPolicySchema } = require("../lib/loan-policy-service");
    ensureLoanPolicySchema(database);
  } catch (_) {}
  dbByOrg.set(slug, database);

  const { backfillMemberNumbers } = require("../lib/member-number-service");
  const { runWithOrg } = require("../lib/org-context");
  runWithOrg(slug, () => backfillMemberNumbers(database));

  if (slug === ASSURANCE_SLUG) {
    const { ensureAssuranceAdminUser } = require("../lib/auth-service");
    ensureAssuranceAdminUser();
    const { ensureDefaultBankAccount } = require("../lib/bank-account-service");
    runWithOrg(slug, () =>
      ensureDefaultBankAccount({ institutionName: "Bank of America", currency: "USD" })
    );
  }

  trace.info("Organization database ready", { orgSlug: slug, dbPath });
  return database;
}

function getDb(explicitOrgSlug) {
  migrateLegacyDatabaseIfNeeded();
  const slug = explicitOrgSlug || getOrgSlugOrNull();
  if (!slug) {
    throw new Error("No organization database selected");
  }
  return openOrgDatabase(slug);
}

function closeDb(orgSlug) {
  if (orgSlug) {
    const database = dbByOrg.get(orgSlug);
    if (database) {
      database.close();
      dbByOrg.delete(orgSlug);
      trace.info("Organization database closed", { orgSlug });
    }
    return;
  }
  for (const [slug, database] of dbByOrg.entries()) {
    database.close();
    trace.info("Organization database closed", { orgSlug: slug });
  }
  dbByOrg.clear();
}

module.exports = {
  getDb,
  closeDb,
  openOrgDatabase,
  get DB_PATH() {
    const slug = getOrgSlugOrNull() || ASSURANCE_SLUG;
    return path.join(getOrgDataDir(slug), "peerfinance.db");
  },
  get DATA_DIR() {
    const slug = getOrgSlugOrNull() || ASSURANCE_SLUG;
    return getOrgDataDir(slug);
  },
};
