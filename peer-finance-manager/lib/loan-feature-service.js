/**
 * Optional member Loan accounts.
 * Enabled by default: every existing Cooperative keeps loan workflows.
 * A Cooperative that does not issue loans turns this off in Membership Policy;
 * loan cards, member loan columns, record forms, and member-portal loan
 * sections hide app-wide. Existing ledger entries are untouched.
 */
const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  getCooperativeSetting,
  setCooperativeSetting,
} = require("./cooperative-settings");

const SETTING_LOANS_ENABLED = "loans_enabled";

function isLoansEnabled() {
  try {
    return getCooperativeSetting(SETTING_LOANS_ENABLED) !== "0";
  } catch (_) {
    return true;
  }
}

function setLoansEnabled(enabled) {
  const db = getDb();
  ensureSettingsTable(db);
  setCooperativeSetting(db, SETTING_LOANS_ENABLED, enabled ? "1" : "0");
  return isLoansEnabled();
}

function assertLoansEnabled() {
  if (!isLoansEnabled()) {
    throw new Error(
      "Loan accounts are not enabled for this Cooperative. Turn them on in Record: Membership Policy."
    );
  }
}

module.exports = {
  SETTING_LOANS_ENABLED,
  isLoansEnabled,
  setLoansEnabled,
  assertLoansEnabled,
};
