const fs = require("fs");
const path = require("path");
const { getDataDir } = require("./paths");
const { loadBetterSqlite3 } = require("./native-sqlite");

const ASSURANCE_SLUG = "assurance";
const ASSURANCE_NAME = "Assurance Investment and Cooperative Inc.";

let registryDb;

function getRegistryPath() {
  return path.join(getDataDir(), "registry.db");
}

function ensureBillingSchema(db) {
  const columns = db.prepare(`PRAGMA table_info(organizations)`).all();
  const names = new Set(columns.map((c) => c.name));
  const add = (sql) => {
    if (!names.has(sql.match(/ADD COLUMN (\w+)/i)?.[1])) {
      try {
        db.exec(`ALTER TABLE organizations ${sql}`);
      } catch (_) {
        /* column may exist from parallel init */
      }
    }
  };
  add(`ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'pending'`);
  add(`ADD COLUMN subscription_plan TEXT`);
  add(`ADD COLUMN payment_method TEXT`);
  add(`ADD COLUMN billing_email TEXT`);
  add(`ADD COLUMN stripe_customer_id TEXT`);
  add(`ADD COLUMN stripe_subscription_id TEXT`);
  add(`ADD COLUMN subscription_current_period_end TEXT`);
  add(`ADD COLUMN check_payment_reference TEXT`);
  add(`ADD COLUMN subscription_notes TEXT`);
  add(`ADD COLUMN subscription_updated_at TEXT`);
  add(`ADD COLUMN subscription_grace_until TEXT`);
}

function getRegistryDb() {
  if (!registryDb) {
    const registryPath = getRegistryPath();
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const Database = loadBetterSqlite3();
    registryDb = new Database(registryPath);
    registryDb.pragma("journal_mode = WAL");
    registryDb.pragma("foreign_keys = ON");
    registryDb.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        slug TEXT PRIMARY KEY COLLATE NOCASE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        organization_slug TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (organization_slug) REFERENCES organizations(slug) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_org ON sessions(organization_slug);
    `);
    ensureBillingSchema(registryDb);
    try {
      const { ensureFlexxFormsSchema } = require("./flexxforms-service");
      ensureFlexxFormsSchema(registryDb);
    } catch (_) {
      /* flexxforms module optional during early boot */
    }
  }
  return registryDb;
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getOrgDataDir(slug) {
  return path.join(getDataDir(), "organizations", normalizeSlug(slug));
}

function mapOrganizationRow(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
    subscriptionStatus: row.subscription_status || "pending",
    subscriptionPlan: row.subscription_plan || null,
    paymentMethod: row.payment_method || null,
    billingEmail: row.billing_email || null,
    stripeCustomerId: row.stripe_customer_id || null,
    stripeSubscriptionId: row.stripe_subscription_id || null,
    subscriptionCurrentPeriodEnd: row.subscription_current_period_end || null,
    checkPaymentReference: row.check_payment_reference || null,
    subscriptionNotes: row.subscription_notes || null,
    subscriptionUpdatedAt: row.subscription_updated_at || null,
    subscriptionGraceUntil: row.subscription_grace_until || null,
  };
}

function listOrganizations() {
  const db = getRegistryDb();
  return db
    .prepare(
      `SELECT slug, name, created_at,
              subscription_status, subscription_plan, payment_method, billing_email,
              stripe_customer_id, stripe_subscription_id, subscription_current_period_end,
              check_payment_reference, subscription_notes, subscription_updated_at,
              subscription_grace_until
       FROM organizations ORDER BY name`
    )
    .all()
    .map(mapOrganizationRow);
}

function getOrganization(slug) {
  const db = getRegistryDb();
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  const row = db
    .prepare(
      `SELECT slug, name, created_at,
              subscription_status, subscription_plan, payment_method, billing_email,
              stripe_customer_id, stripe_subscription_id, subscription_current_period_end,
              check_payment_reference, subscription_notes, subscription_updated_at,
              subscription_grace_until
       FROM organizations WHERE slug = ?`
    )
    .get(normalized);
  return mapOrganizationRow(row);
}

function organizationExists(slug) {
  return Boolean(getOrganization(slug));
}

function registerOrganization({ name, slug }) {
  const normalized = normalizeSlug(slug);
  const displayName = String(name || "").trim();
  if (!displayName) throw new Error("Organization name is required");
  if (!normalized) throw new Error("Organization code is required");
  if (normalized.length < 2) throw new Error("Organization code must be at least 2 characters");
  if (getOrganization(normalized)) throw new Error("This organization code is already registered");

  const db = getRegistryDb();
  db.prepare(`INSERT INTO organizations (slug, name) VALUES (?, ?)`).run(normalized, displayName);
  fs.mkdirSync(getOrgDataDir(normalized), { recursive: true });
  return getOrganization(normalized);
}

function updateOrganizationBilling(slug, fields) {
  const db = getRegistryDb();
  const normalized = normalizeSlug(slug);
  if (!getOrganization(normalized)) throw new Error("Organization not found");

  const allowed = {
    subscriptionStatus: "subscription_status",
    subscriptionPlan: "subscription_plan",
    paymentMethod: "payment_method",
    billingEmail: "billing_email",
    stripeCustomerId: "stripe_customer_id",
    stripeSubscriptionId: "stripe_subscription_id",
    subscriptionCurrentPeriodEnd: "subscription_current_period_end",
    checkPaymentReference: "check_payment_reference",
    subscriptionNotes: "subscription_notes",
    subscriptionGraceUntil: "subscription_grace_until",
  };

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return getOrganization(normalized);
  sets.push(`subscription_updated_at = datetime('now')`);
  values.push(normalized);
  db.prepare(`UPDATE organizations SET ${sets.join(", ")} WHERE slug = ?`).run(...values);
  return getOrganization(normalized);
}

function migrateLegacyOrgBillingDefaults() {
  const db = getRegistryDb();
  db.prepare(
    `UPDATE organizations
     SET subscription_status = 'pending'
     WHERE subscription_status IS NULL OR subscription_status = ''`
  ).run();
}

function migrateLegacyDatabaseIfNeeded() {
  const dataDir = getDataDir();
  const legacyDb = path.join(dataDir, "peerfinance.db");
  const assuranceDir = getOrgDataDir(ASSURANCE_SLUG);
  const assuranceDb = path.join(assuranceDir, "peerfinance.db");
  const registry = getRegistryDb();

  fs.mkdirSync(assuranceDir, { recursive: true });

  if (fs.existsSync(legacyDb) && !fs.existsSync(assuranceDb)) {
    fs.copyFileSync(legacyDb, assuranceDb);
    const exportsDir = path.join(dataDir, "exports");
    const targetExports = path.join(assuranceDir, "exports");
    if (fs.existsSync(exportsDir) && !fs.existsSync(targetExports)) {
      fs.mkdirSync(targetExports, { recursive: true });
      for (const file of fs.readdirSync(exportsDir)) {
        fs.copyFileSync(path.join(exportsDir, file), path.join(targetExports, file));
      }
    }
  }

  const existing = getOrganization(ASSURANCE_SLUG);
  if (!existing) {
    registry
      .prepare(`INSERT INTO organizations (slug, name) VALUES (?, ?)`)
      .run(ASSURANCE_SLUG, ASSURANCE_NAME);
  }
}

module.exports = {
  ASSURANCE_SLUG,
  ASSURANCE_NAME,
  normalizeSlug,
  getRegistryDb,
  getOrgDataDir,
  listOrganizations,
  getOrganization,
  organizationExists,
  registerOrganization,
  updateOrganizationBilling,
  migrateLegacyDatabaseIfNeeded,
  migrateLegacyOrgBillingDefaults,
};
