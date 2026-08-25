const fs = require("fs");
const path = require("path");
const { getDataDir } = require("./paths");
const { loadBetterSqlite3 } = require("./native-sqlite");

const ASSURANCE_SLUG = "assurance";
const ASSURANCE_NAME = "Assurance Investment and Cooperative Inc.";
const NEW_ORG_CODE_MIN_LENGTH = 8;
const NEW_ORG_CODE_RAW_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const RESERVED_ORG_SLUGS = new Set([
  "admin",
  "api",
  "brochure",
  "c",
  "login",
  "member",
  "platform",
  "product",
  "register",
  "staff",
  "www",
]);

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
  add(`ADD COLUMN admin_email TEXT`);
  add(`ADD COLUMN country_code TEXT`);
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

function parseOrganizationCodeInput(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Organization code is required");
  if (!NEW_ORG_CODE_RAW_PATTERN.test(raw)) {
    throw new Error("Organization code may use letters, numbers, and hyphens only");
  }
  const normalized = normalizeSlug(raw);
  if (!normalized) throw new Error("Organization code is required");
  return normalized;
}

function assertNewOrganizationCodeStrength(slug) {
  const normalized = String(slug || "");
  if (RESERVED_ORG_SLUGS.has(normalized)) {
    throw new Error("This organization code is not available");
  }
  if (normalized.length < NEW_ORG_CODE_MIN_LENGTH) {
    throw new Error(`Organization code must be at least ${NEW_ORG_CODE_MIN_LENGTH} characters`);
  }
  if (!/[a-z]/.test(normalized) || !/[0-9]/.test(normalized)) {
    throw new Error("Organization code must include a letter and a number");
  }
  return normalized;
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
    adminEmail: row.admin_email || null,
    countryCode: row.country_code || null,
  };
}

function listOrganizations() {
  const db = getRegistryDb();
  return db
    .prepare(
      `SELECT slug, name, created_at, admin_email,
              subscription_status, subscription_plan, payment_method, billing_email,
              stripe_customer_id, stripe_subscription_id, subscription_current_period_end,
              check_payment_reference, subscription_notes, subscription_updated_at,
              subscription_grace_until, country_code
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
      `SELECT slug, name, created_at, admin_email,
              subscription_status, subscription_plan, payment_method, billing_email,
              stripe_customer_id, stripe_subscription_id, subscription_current_period_end,
              check_payment_reference, subscription_notes, subscription_updated_at,
              subscription_grace_until, country_code
       FROM organizations WHERE slug = ?`
    )
    .get(normalized);
  return mapOrganizationRow(row);
}

function organizationExists(slug) {
  return Boolean(getOrganization(slug));
}

function registerOrganization({ name, slug, countryCode }) {
  const displayName = String(name || "").trim();
  if (!displayName) throw new Error("Organization name is required");
  const normalized = parseOrganizationCodeInput(slug);
  if (getOrganization(normalized)) throw new Error("This organization code is already registered");
  assertNewOrganizationCodeStrength(normalized);

  const { normalizeCountryCode, DEFAULT_COUNTRY_CODE } = require("./country-profile");
  const country = normalizeCountryCode(countryCode || DEFAULT_COUNTRY_CODE);

  const db = getRegistryDb();
  try {
    db.prepare(`INSERT INTO organizations (slug, name, country_code) VALUES (?, ?, ?)`).run(
      normalized,
      displayName,
      country
    );
  } catch (_) {
    db.prepare(`INSERT INTO organizations (slug, name) VALUES (?, ?)`).run(normalized, displayName);
  }
  fs.mkdirSync(getOrgDataDir(normalized), { recursive: true });
  return getOrganization(normalized);
}

function updateOrganizationCountry(slug, countryCode) {
  const db = getRegistryDb();
  const normalized = normalizeSlug(slug);
  if (!normalized || !getOrganization(normalized)) return null;
  const { normalizeCountryCode } = require("./country-profile");
  const country = normalizeCountryCode(countryCode);
  try {
    db.prepare(`UPDATE organizations SET country_code = ? WHERE slug = ?`).run(country, normalized);
  } catch (_) {
    /* column missing on very old registry */
  }
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

function updateOrganizationAdminEmail(slug, email, { onlyIfEmpty = false } = {}) {
  const db = getRegistryDb();
  const normalized = normalizeSlug(slug);
  if (!getOrganization(normalized)) throw new Error("Organization not found");
  const value = String(email || "")
    .trim()
    .toLowerCase();
  if (!value || !value.includes("@")) throw new Error("Valid administrator email is required");
  if (onlyIfEmpty) {
    db.prepare(
      `UPDATE organizations SET admin_email = ? WHERE slug = ? AND (admin_email IS NULL OR admin_email = '')`
    ).run(value, normalized);
  } else {
    db.prepare(`UPDATE organizations SET admin_email = ? WHERE slug = ?`).run(value, normalized);
  }
  return getOrganization(normalized);
}

function backfillOrganizationAdminEmails() {
  const db = getRegistryDb();
  ensureBillingSchema(db);

  // Canonical FlexxForms admin for Assurance (must not lose to older admin rows in org DB).
  db.prepare(
    `UPDATE organizations
     SET admin_email = ?, flexxforms_admin_email = ?
     WHERE slug = ?`
  ).run("assuranceflex@eworkchop.com", "assuranceflex@eworkchop.com", ASSURANCE_SLUG);

  const { runWithOrg } = require("./org-context");
  const { getDb } = require("../db/database");

  for (const org of listOrganizations()) {
    if (org.slug === ASSURANCE_SLUG) continue;
    if (org.adminEmail) continue;
    let email = null;
    try {
      email = runWithOrg(org.slug, () => {
        const row = getDb()
          .prepare(
            `SELECT LOWER(email) AS email FROM users
             WHERE role = 'admin' AND active = 1
             ORDER BY created_at ASC LIMIT 1`
          )
          .get();
        return row?.email || null;
      });
    } catch (_) {
      email = null;
    }
    if (email) {
      db.prepare(
        `UPDATE organizations SET admin_email = ? WHERE slug = ? AND (admin_email IS NULL OR admin_email = '')`
      ).run(email, org.slug);
    }
  }
}

function migrateLegacyOrgBillingDefaults() {
  const db = getRegistryDb();
  db.prepare(
    `UPDATE organizations
     SET subscription_status = 'pending'
     WHERE subscription_status IS NULL OR subscription_status = ''`
  ).run();
  backfillOrganizationAdminEmails();
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
  NEW_ORG_CODE_MIN_LENGTH,
  normalizeSlug,
  parseOrganizationCodeInput,
  assertNewOrganizationCodeStrength,
  getRegistryDb,
  getOrgDataDir,
  listOrganizations,
  getOrganization,
  organizationExists,
  registerOrganization,
  updateOrganizationCountry,
  updateOrganizationAdminEmail,
  updateOrganizationBilling,
  migrateLegacyDatabaseIfNeeded,
  migrateLegacyOrgBillingDefaults,
  backfillOrganizationAdminEmails,
};
