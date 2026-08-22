/**
 * Per-Cooperative country profile.
 * Unset or unknown codes resolve to the United States so existing tenants
 * (including Assurance) keep USD, Pacific time, and MM/DD/YYYY with no migration.
 * Add a new entry here when the next client country is known; do not fork product code.
 */
const {
  getCooperativeSetting,
  setCooperativeSetting,
  ensureSettingsTable,
} = require("./cooperative-settings");
const { getOrgSlugOrNull } = require("./org-context");
const { getCountryCatalog } = require("./country-catalog");

const SETTING_COUNTRY_CODE = "country_code";
const DEFAULT_COUNTRY_CODE = "US";

const COUNTRY_PROFILES = {
  US: {
    code: "US",
    name: "United States",
    currency: "USD",
    locale: "en-US",
    timezone: "America/Los_Angeles",
    dateFormat: "MDY",
    defaultBankInstitution: "",
    paymentRailLabel: "Zelle/Bank",
    statementHint:
      "US bank exports usually use Date, Description, and Amount (or Credit/Debit) with MM/DD/YYYY dates.",
  },
  NG: {
    code: "NG",
    name: "Nigeria",
    currency: "NGN",
    locale: "en-NG",
    timezone: "Africa/Lagos",
    dateFormat: "DMY",
    defaultBankInstitution: "Primary Bank",
    paymentRailLabel: "Bank Transfer",
    statementHint:
      "Nigerian bank exports often use Trans Date or Value Date, Narration, and separate Debit and Credit columns with DD/MM/YYYY dates. Auto-detect maps those headers. Search and select your bank name.",
  },
};

function normalizeCountryCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (COUNTRY_PROFILES[code]) return code;
  return DEFAULT_COUNTRY_CODE;
}

function getCountryProfileByCode(value) {
  return COUNTRY_PROFILES[normalizeCountryCode(value)];
}

function listCountryProfiles() {
  return Object.values(COUNTRY_PROFILES).map((profile) => ({
    code: profile.code,
    name: profile.name,
    currency: profile.currency,
    timezone: profile.timezone,
    dateFormat: profile.dateFormat,
  }));
}

function publicCountryProfile(profile) {
  const catalog = getCountryCatalog(profile.code);
  return {
    code: profile.code,
    name: profile.name,
    currency: profile.currency,
    locale: profile.locale,
    timezone: profile.timezone,
    dateFormat: profile.dateFormat,
    dateFormatLabel: profile.dateFormat === "DMY" ? "DD/MM/YYYY" : "MM/DD/YYYY",
    defaultBankInstitution: profile.defaultBankInstitution,
    bankInstitutions: catalog.banks,
    states: catalog.states,
    paymentRailLabel: profile.paymentRailLabel,
    statementHint: profile.statementHint,
  };
}

function readStoredCountryCode() {
  try {
    const slug = getOrgSlugOrNull();
    if (!slug) return null;
    const fromSettings = getCooperativeSetting(SETTING_COUNTRY_CODE);
    if (fromSettings) return normalizeCountryCode(fromSettings);
    const { getOrganization } = require("./organization-service");
    const org = getOrganization(slug);
    if (org?.countryCode) return normalizeCountryCode(org.countryCode);
  } catch (_) {
    /* no org context or registry yet */
  }
  return null;
}

function getCountryProfile() {
  return getCountryProfileByCode(readStoredCountryCode() || DEFAULT_COUNTRY_CODE);
}

function getPublicCountryProfile() {
  return publicCountryProfile(getCountryProfile());
}

function applyCountryProfileDefaults(countryCode, { forceLocaleSettings = false } = {}) {
  const profile = getCountryProfileByCode(countryCode);
  const { getDb } = require("../db/database");
  const db = getDb();
  ensureSettingsTable(db);
  setCooperativeSetting(db, SETTING_COUNTRY_CODE, profile.code);

  const { setCooperativeTimezone } = require("./cooperative-time");
  const { setCooperativeDateFormat } = require("./cooperative-date-format");
  const existingTz = getCooperativeSetting("cooperative_timezone");
  const existingDate = getCooperativeSetting("cooperative_date_format");
  if (forceLocaleSettings || !existingTz) {
    setCooperativeTimezone(profile.timezone);
  }
  if (forceLocaleSettings || !existingDate) {
    setCooperativeDateFormat(profile.dateFormat);
  }

  if (profile.code !== DEFAULT_COUNTRY_CODE) {
    const { listBankAccounts, ensureDefaultBankAccount } = require("./bank-account-service");
    if (!listBankAccounts().length) {
      ensureDefaultBankAccount({
        institutionName: profile.defaultBankInstitution || "Primary Bank",
        currency: profile.currency,
      });
    }
  }

  try {
    const slug = getOrgSlugOrNull();
    if (slug) {
      const { updateOrganizationCountry } = require("./organization-service");
      updateOrganizationCountry(slug, profile.code);
    }
  } catch (_) {
    /* registry column may not exist yet during very early boot */
  }

  return publicCountryProfile(profile);
}

function setCooperativeCountry(countryCode) {
  const next = normalizeCountryCode(countryCode);
  const previous = readStoredCountryCode() || DEFAULT_COUNTRY_CODE;
  const changed = previous !== next;
  return applyCountryProfileDefaults(next, { forceLocaleSettings: changed });
}

module.exports = {
  SETTING_COUNTRY_CODE,
  DEFAULT_COUNTRY_CODE,
  COUNTRY_PROFILES,
  normalizeCountryCode,
  getCountryProfileByCode,
  listCountryProfiles,
  publicCountryProfile,
  getCountryProfile,
  getPublicCountryProfile,
  applyCountryProfileDefaults,
  setCooperativeCountry,
};
