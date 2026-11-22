/**
 * Per-Cooperative membership fee policy.
 *
 * Two fee models are supported:
 *  - "one_time": one-time registration/membership fee + initial contribution
 *    (the original Assurance model).
 *  - "annual": recurring annual membership fee/dues that may be changed each
 *    year by vote. Members may pay in full or instalments with no penalty.
 *    Amount edits apply going forward: recorded transactions are never
 *    rewritten and a per-year schedule keeps each year's requirement intact.
 *
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

const FEE_MODEL_ONE_TIME = "one_time";
const FEE_MODEL_ANNUAL = "annual";
const FEE_MODELS = [FEE_MODEL_ONE_TIME, FEE_MODEL_ANNUAL];

const SETTING_FEE_MODEL = "fee_model";
const SETTING_MEMBERSHIP_FEE = "membership_fee_amount";
const SETTING_INITIAL_CONTRIBUTION = "initial_contribution_amount";
const SETTING_ANNUAL_DUES = "annual_dues_amount";
const SETTING_DUES_SCHEDULE = "annual_dues_schedule";
const SETTING_DUES_REMINDER_ENABLED = "annual_dues_reminder_enabled";
const SETTING_DUES_REMINDER_FREQUENCY = "annual_dues_reminder_frequency";
const SETTING_DUES_REMINDER_LAST_SENT = "annual_dues_reminder_last_sent";
const SETTING_DUES_HISTORY = "annual_dues_change_log";
const DUES_HISTORY_LIMIT = 200;

const DUES_REMINDER_FREQUENCIES = ["daily", "weekly", "monthly"];

function normalizeAmount(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

function normalizeAmountAllowZero(value, fallback) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
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

function normalizeFeeModel(value, fallback = FEE_MODEL_ONE_TIME) {
  const v = String(value || "").trim().toLowerCase();
  return FEE_MODELS.includes(v) ? v : fallback;
}

function parseDuesSchedule(raw) {
  try {
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .map((e) => ({
        year: Number(e?.year),
        amount: normalizeAmount(e?.amount, 0),
        setAt: typeof e?.setAt === "string" ? e.setAt : null,
        setBy: typeof e?.setBy === "string" ? e.setBy : null,
      }))
      .filter((e) => Number.isInteger(e.year) && e.year > 2000 && e.amount > 0)
      .sort((a, b) => a.year - b.year);
  } catch (_) {
    return [];
  }
}

function getDuesHistory() {
  try {
    const list = JSON.parse(readSetting(SETTING_DUES_HISTORY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

/** Append amount changes to the audit log; returns stamped schedule entries. */
function stampDuesChanges({ oldAmount, newAmount, oldSchedule, newSchedule, changedBy, at }) {
  const history = getDuesHistory();
  const actor = changedBy || "Administrator";
  if (oldAmount !== newAmount) {
    history.push({ at, by: actor, scope: "default", from: oldAmount, to: newAmount });
  }
  const oldByYear = new Map(oldSchedule.map((e) => [e.year, e]));
  const next = newSchedule.map((e) => {
    const prev = oldByYear.get(e.year);
    if (prev?.amount === e.amount) {
      return { ...e, setAt: prev.setAt ?? e.setAt ?? null, setBy: prev.setBy ?? e.setBy ?? null };
    }
    history.push({ at, by: actor, scope: e.year, from: prev?.amount ?? null, to: e.amount });
    return { ...e, setAt: at, setBy: actor };
  });
  for (const e of oldSchedule) {
    if (!next.some((n) => n.year === e.year)) {
      history.push({ at, by: actor, scope: e.year, from: e.amount, to: null });
    }
  }
  return { history: history.slice(-DUES_HISTORY_LIMIT), schedule: next };
}

function setDuesAmounts({ annualDuesAmount, annualDuesSchedule, changedBy }) {
  const db = getDb();
  const at = new Date().toISOString();
  const oldAmount = normalizeAmount(readSetting(SETTING_ANNUAL_DUES), 0);
  const oldSchedule = getDuesSchedule();
  const newAmount =
    annualDuesAmount != null && annualDuesAmount !== ""
      ? requirePositiveAmount(annualDuesAmount, "Annual membership fee")
      : oldAmount;
  const newSchedule = Array.isArray(annualDuesSchedule)
    ? annualDuesSchedule
        .map((e) => ({
          year: Math.trunc(Number(e?.year)),
          amount: requirePositiveAmount(e?.amount, "Annual dues amount"),
        }))
        .filter((e) => e.year > 2000)
        .sort((a, b) => a.year - b.year)
    : oldSchedule;
  const { history, schedule } = stampDuesChanges({
    oldAmount,
    newAmount,
    oldSchedule,
    newSchedule,
    changedBy,
    at,
  });
  if (newAmount !== oldAmount) {
    setCooperativeSetting(db, SETTING_ANNUAL_DUES, String(newAmount));
  }
  setCooperativeSetting(db, SETTING_DUES_SCHEDULE, JSON.stringify(schedule));
  if (history.length) {
    setCooperativeSetting(db, SETTING_DUES_HISTORY, JSON.stringify(history));
  }
}

function getDuesSchedule() {
  return parseDuesSchedule(readSetting(SETTING_DUES_SCHEDULE));
}

/**
 * The dues requirement for a calendar year: the explicit schedule entry if one
 * exists, else the most recent scheduled amount at or before that year, else
 * the current annual dues amount.
 */
function duesRequirementForYear(year, annualDuesAmount) {
  const y = Number(year);
  if (annualDuesAmount == null) {
    annualDuesAmount = normalizeAmount(readSetting(SETTING_ANNUAL_DUES), 0);
  }
  const schedule = getDuesSchedule();
  const exact = schedule.find((e) => e.year === y);
  if (exact) return exact.amount;
  const prior = [...schedule].reverse().find((e) => e.year <= y);
  if (prior) return prior.amount;
  return normalizeAmount(annualDuesAmount, 0);
}

function getMembershipPolicy() {
  const defaults = countryMembershipDefaults();
  const membershipFee = normalizeAmountAllowZero(
    readSetting(SETTING_MEMBERSHIP_FEE),
    normalizeAmount(defaults.membershipFee, MEMBERSHIP_FEE)
  );
  const initialContribution = normalizeAmountAllowZero(
    readSetting(SETTING_INITIAL_CONTRIBUTION),
    normalizeAmount(defaults.initialContribution, INITIAL_MEMBERSHIP_CONTRIBUTION)
  );
  const feeModel = normalizeFeeModel(readSetting(SETTING_FEE_MODEL));
  const annualDuesAmount = normalizeAmount(
    readSetting(SETTING_ANNUAL_DUES),
    normalizeAmount(defaults.membershipFee, MEMBERSHIP_FEE)
  );
  const { isShareCapitalEnabled } = require("./share-capital-service");
  const reminderEnabled = String(readSetting(SETTING_DUES_REMINDER_ENABLED) || "") === "true";
  const reminderFrequency = DUES_REMINDER_FREQUENCIES.includes(
    String(readSetting(SETTING_DUES_REMINDER_FREQUENCY) || "")
  )
    ? readSetting(SETTING_DUES_REMINDER_FREQUENCY)
    : "monthly";
  return {
    feeModel,
    membershipFee,
    initialContribution,
    annualDuesAmount,
    annualDuesSchedule: getDuesSchedule(),
    annualDuesHistory: getDuesHistory().slice().reverse(),
    annualDuesReminderEnabled: reminderEnabled,
    annualDuesReminderFrequency: reminderFrequency,
    shareCapitalEnabled: isShareCapitalEnabled(),
  };
}

function requirePositiveAmount(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return Math.round(n * 100) / 100;
}

function requireNonNegativeAmount(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be zero or greater`);
  }
  return Math.round(n * 100) / 100;
}

function truthy(value) {
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() === "true" ||
    String(value) === "1"
  );
}

function setMembershipPolicy({
  feeModel,
  membershipFee,
  initialContribution,
  annualDuesAmount,
  annualDuesSchedule,
  annualDuesReminderEnabled,
  annualDuesReminderFrequency,
  shareCapitalEnabled,
  changedBy,
} = {}) {
  const db = getDb();
  ensureSettingsTable(db);
  if (feeModel != null) {
    setCooperativeSetting(db, SETTING_FEE_MODEL, normalizeFeeModel(feeModel));
  }
  if (membershipFee != null && membershipFee !== "") {
    setCooperativeSetting(
      db,
      SETTING_MEMBERSHIP_FEE,
      String(requireNonNegativeAmount(membershipFee, "Membership fee"))
    );
  }
  if (initialContribution != null && initialContribution !== "") {
    setCooperativeSetting(
      db,
      SETTING_INITIAL_CONTRIBUTION,
      String(requireNonNegativeAmount(initialContribution, "Initial contribution"))
    );
  }
  if ((annualDuesAmount != null && annualDuesAmount !== "") || Array.isArray(annualDuesSchedule)) {
    setDuesAmounts({ annualDuesAmount, annualDuesSchedule, changedBy });
  }
  if (annualDuesReminderEnabled != null) {
    setCooperativeSetting(
      db,
      SETTING_DUES_REMINDER_ENABLED,
      truthy(annualDuesReminderEnabled) ? "true" : "false"
    );
  }
  if (annualDuesReminderFrequency != null) {
    const f = String(annualDuesReminderFrequency);
    if (!DUES_REMINDER_FREQUENCIES.includes(f)) {
      throw new Error("Reminder frequency must be daily, weekly, or monthly");
    }
    setCooperativeSetting(db, SETTING_DUES_REMINDER_FREQUENCY, f);
  }
  if (shareCapitalEnabled != null) {
    const { setShareCapitalEnabled } = require("./share-capital-service");
    setShareCapitalEnabled(truthy(shareCapitalEnabled));
  }
  return getMembershipPolicy();
}

module.exports = {
  FEE_MODEL_ONE_TIME,
  FEE_MODEL_ANNUAL,
  FEE_MODELS,
  DUES_REMINDER_FREQUENCIES,
  SETTING_FEE_MODEL,
  SETTING_MEMBERSHIP_FEE,
  SETTING_INITIAL_CONTRIBUTION,
  SETTING_ANNUAL_DUES,
  SETTING_DUES_SCHEDULE,
  SETTING_DUES_REMINDER_ENABLED,
  SETTING_DUES_REMINDER_FREQUENCY,
  SETTING_DUES_REMINDER_LAST_SENT,
  getMembershipPolicy,
  setMembershipPolicy,
  duesRequirementForYear,
  getDuesHistory,
  SETTING_DUES_HISTORY,
};
