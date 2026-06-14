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

function listOrganizations() {
  const db = getRegistryDb();
  return db
    .prepare(`SELECT slug, name, created_at AS createdAt FROM organizations ORDER BY name`)
    .all();
}

function getOrganization(slug) {
  const db = getRegistryDb();
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return db
    .prepare(`SELECT slug, name, created_at AS createdAt FROM organizations WHERE slug = ?`)
    .get(normalized);
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
  migrateLegacyDatabaseIfNeeded,
};
