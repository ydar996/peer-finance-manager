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
  generateOrganizationCodeFromName,
  allocateOrganizationCode,
  assertNewOrganizationCodeStrength,
  registerOrganization,
  getOrganization,
  getRegistryDb,
  NEW_ORG_CODE_MIN_LENGTH,
} = require("../lib/organization-service");
const { appendOrgQuery, getMemberPortalLoginUrl } = require("../lib/portal-urls");
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

function testGenerateFromName() {
  assert.strictEqual(
    generateOrganizationCodeFromName("Acme Cooperative", { suffix: "482" }),
    "acme-cooperative-482"
  );
  assert.strictEqual(generateOrganizationCodeFromName("Coop 2026", { suffix: "111" }), "coop-2026");
  const generated = generateOrganizationCodeFromName("Acme Cooperative");
  assert.ok(generated.startsWith("acme-cooperative-"));
  assert.ok(/[0-9]/.test(generated));
  assert.ok(generated.length >= NEW_ORG_CODE_MIN_LENGTH);
  const auto = registerOrganization({
    name: "Sunset Valley Cooperative",
    countryCode: "US",
  });
  assert.ok(auto.slug.startsWith("sunset-valley-cooperative-"));
  assert.ok(getOrganization(auto.slug));
  const preferred = allocateOrganizationCode("Another Cooperative", "another9coop");
  assert.strictEqual(preferred, "another9coop");
  console.log("  generate from name: OK");
}

function testMemberLoginUrlIncludesOrg() {
  assert.strictEqual(
    appendOrgQuery("https://peer-finance-manager.netlify.app/member", "acme-cooperative-482"),
    "https://peer-finance-manager.netlify.app/member?org=acme-cooperative-482"
  );
  assert.strictEqual(
    appendOrgQuery("https://peer-finance-manager.netlify.app/member?org=acme-cooperative-482", "other"),
    "https://peer-finance-manager.netlify.app/member?org=acme-cooperative-482"
  );
  assert.ok(
    getMemberPortalLoginUrl("acme-cooperative-482").endsWith("/member?org=acme-cooperative-482")
  );
  console.log("  member login url: OK");
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
testGenerateFromName();
testMemberLoginUrlIncludesOrg();
testRegisterRejectsWeakAndAcceptsStrong();
testGrandfatheredShortSlugStaysInRegistry();
testLoginHidesMissingOrganization();
console.log("organization-code tests passed");
