/**
 * Per-Cooperative membership fee and initial contribution amounts.
 * Resolution order: cooperative setting -> country profile default -> legacy constant.
 * Existing tenants with no stored setting keep the legacy amounts (USD 100/100 for US).
 */
const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  getCooperativeSetting,
  setCooperativeSetting,
} = require("./cooperative-settings");
const { MEMBERSHIP_FEE, INITIAL_MEMBERSHIP_CONTRIBUTION } = require("./constants");

const SETTING_MEMBERSHIP_FEE = "membership_fee_amount";
const SETTING_INITIAL_CONTRIBUTION = "initial_contribution_amount";

function normalizeAmount(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

function countryMembershipDefaults() {
  try {
    const { getCountryProfile } = require("./country-profile");
    return getCountryProfile()?.membershipDefaults || {};
  } catch (_) {
    return {};
  }
}

function readSetting(key) {
  try {
    return getCooperativeSetting(key);
  } catch (_) {
    return null;
  }
}

function getMembershipPolicy() {
  const defaults = countryMembershipDefaults();
  const membershipFee = normalizeAmount(
    readSetting(SETTING_MEMBERSHIP_FEE),
    normalizeAmount(defaults.membershipFee, MEMBERSHIP_FEE)
  );
  const initialContribution = normalizeAmount(
    readSetting(SETTING_INITIAL_CONTRIBUTION),
    normalizeAmount(defaults.initialContribution, INITIAL_MEMBERSHIP_CONTRIBUTION)
  );
  return { membershipFee, initialContribution };
}

function requirePositiveAmount(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return Math.round(n * 100) / 100;
}

function setMembershipPolicy({ membershipFee, initialContribution } = {}) {
  const db = getDb();
  ensureSettingsTable(db);
  if (membershipFee != null && membershipFee !== "") {
    setCooperativeSetting(
      db,
      SETTING_MEMBERSHIP_FEE,
      String(requirePositiveAmount(membershipFee, "Membership fee"))
    );
  }
  if (initialContribution != null && initialContribution !== "") {
    setCooperativeSetting(
      db,
      SETTING_INITIAL_CONTRIBUTION,
      String(requirePositiveAmount(initialContribution, "Initial contribution"))
    );
  }
  return getMembershipPolicy();
}

module.exports = {
  SETTING_MEMBERSHIP_FEE,
  SETTING_INITIAL_CONTRIBUTION,
  getMembershipPolicy,
  setMembershipPolicy,
};
