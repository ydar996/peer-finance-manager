#!/usr/bin/env node
const { migrateLegacyDatabaseIfNeeded } = require("../lib/organization-service");
const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase } = require("../db/database");
const { ensureAssuranceAdminUser, ASSURANCE_SLUG, ASSURANCE_ADMIN_EMAIL } = require("../lib/auth-service");

migrateLegacyDatabaseIfNeeded();
runWithOrg(ASSURANCE_SLUG, () => {
  openOrgDatabase(ASSURANCE_SLUG);
  ensureAssuranceAdminUser();
  const db = require("../db/database").getDb();
  const admin = db
    .prepare(`SELECT id, email, role, active, display_name FROM users WHERE lower(email) = lower(?)`)
    .get(ASSURANCE_ADMIN_EMAIL);
  console.log("Assurance administrator:", admin);
});
