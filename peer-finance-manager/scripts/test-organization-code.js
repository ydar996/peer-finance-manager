#!/usr/bin/env node
/**
 * New-signup organization codes: letters + numbers, min 8, no special characters.
 * Existing slugs (including assurance) stay valid for login.
 * Run: npm run test:organization-code
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-org-code-"));
process.env.PFM_DATA_DIR = tmpRoot;

const {
  parseOrganizationCodeInput,
  assertNewOrganizationCodeStrength,
  registerOrganization,
  getOrganization,
  getRegistryDb,
  NEW_ORG_CODE_MIN_LENGTH,
} = require("../lib/organization-service");
const {
  login,
  registerOrganizationWithAdmin,
  LOGIN_INVALID_CREDENTIALS,
  PORTALS,
} = require("../lib/auth-service");

function throwsMessage(fn, snippet) {
  let err;
  try {
    fn();
  } catch (caught) {
    err = caught;
  }
  assert.ok(err, "expected an error");
  assert.ok(
    String(err.message).includes(snippet),
    `expected "${snippet}" in "${err.message}"`
  );
}

function testParseAndStrength() {
  assert.strictEqual(NEW_ORG_CODE_MIN_LENGTH, 8);
  assert.strictEqual(parseOrganizationCodeInput("Acme9Coop"), "acme9coop");
  assert.strictEqual(parseOrganizationCodeInput("acme-coop1"), "acme-coop1");
  throwsMessage(() => parseOrganizationCodeInput("acme@coop1"), "letters, numbers, and hyphens");
  throwsMessage(() => parseOrganizationCodeInput("acme_coop1"), "letters, numbers, and hyphens");
  throwsMessage(() => parseOrganizationCodeInput("acme coop1"), "letters, numbers, and hyphens");
  throwsMessage(() => parseOrganizationCodeInput("-acme9co"), "letters, numbers, and hyphens");
  throwsMessage(() => assertNewOrganizationCodeStrength("acme"), "at least 8");
  throwsMessage(() => assertNewOrganizationCodeStrength("assurance"), "letter and a number");
  throwsMessage(() => assertNewOrganizationCodeStrength("12345678"), "letter and a number");
  throwsMessage(() => assertNewOrganizationCodeStrength("platform"), "not available");
  assert.strictEqual(assertNewOrganizationCodeStrength("acme9coop"), "acme9coop");
  console.log("  parse/strength: OK");
}

function testRegisterRejectsWeakAndAcceptsStrong() {
  throwsMessage(
    () => registerOrganization({ name: "Short Coop", slug: "acme" }),
    "at least 8"
  );
  throwsMessage(
    () => registerOrganization({ name: "Punctuation Coop", slug: "acme@coop1" }),
    "letters, numbers, and hyphens"
  );
  throwsMessage(
    () => registerOrganization({ name: "Letters Only", slug: "assurance" }),
    "letter and a number"
  );

  const created = registerOrganization({
    name: "Acme Nine Cooperative",
    slug: "Acme9Coop",
    countryCode: "US",
  });
  assert.strictEqual(created.slug, "acme9coop");
  assert.ok(getOrganization("acme9coop"));
  throwsMessage(
    () => registerOrganization({ name: "Duplicate", slug: "acme9coop" }),
    "already registered"
  );
  console.log("  register: OK");
}

function testGrandfatheredShortSlugStaysInRegistry() {
  getRegistryDb()
    .prepare(`INSERT INTO organizations (slug, name) VALUES (?, ?)`)
    .run("legacyco", "Legacy Cooperative");
  assert.ok(getOrganization("legacyco"));
  throwsMessage(
    () => registerOrganization({ name: "Takeover", slug: "legacyco" }),
    "already registered"
  );
  console.log("  grandfathered slug: OK");
}

function testLoginHidesMissingOrganization() {
  throwsMessage(
    () => login("anyone@example.com", "password123", PORTALS.ADMIN, "nosuchorg99"),
    LOGIN_INVALID_CREDENTIALS
  );
  throwsMessage(
    () => login("anyone@example.com", "password123", PORTALS.ADMIN, "legacyco"),
    LOGIN_INVALID_CREDENTIALS
  );

  const seeded = registerOrganizationWithAdmin({
    name: "Login Test Cooperative",
    slug: "logintest1",
    adminEmail: "admin@logintest1.example",
    adminPassword: "password123",
    countryCode: "US",
  });
  assert.strictEqual(seeded.organization.slug, "logintest1");
  throwsMessage(
    () => login("admin@logintest1.example", "wrong-password", PORTALS.ADMIN, "logintest1"),
    LOGIN_INVALID_CREDENTIALS
  );
  const ok = login("admin@logintest1.example", "password123", PORTALS.ADMIN, "logintest1");
  assert.strictEqual(ok.user.organizationSlug, "logintest1");
  console.log("  login errors: OK");
}

testParseAndStrength();
testRegisterRejectsWeakAndAcceptsStrong();
testGrandfatheredShortSlugStaysInRegistry();
testLoginHidesMissingOrganization();
console.log("organization-code tests passed");
