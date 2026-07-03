/**
 * Cooperative business calendar : per-tenant IANA time zone (default San Diego / Pacific).
 */
const { getOrgSlugOrNull } = require("./org-context");
const {
  getCooperativeSetting,
  setCooperativeSetting,
  ensureSettingsTable,
} = require("./cooperative-settings");

const SETTING_COOPERATIVE_TIMEZONE = "cooperative_timezone";
const DEFAULT_COOPERATIVE_TIMEZONE = "America/Los_Angeles";
const ENV_FALLBACK = process.env.PFM_TIMEZONE || process.env.TZ || null;

const TIMEZONE_LABELS = {
  "America/Los_Angeles": "Pacific : Los Angeles / San Diego",
  "America/Denver": "Mountain : Denver",
  "America/Phoenix": "Arizona : Phoenix (no DST)",
  "America/Chicago": "Central : Chicago",
  "America/New_York": "Eastern : New York",
  "America/Anchorage": "Alaska : Anchorage",
  "Pacific/Honolulu": "Hawaii : Honolulu",
  UTC: "UTC",
  "Europe/London": "United Kingdom : London",
  "Europe/Paris": "Central Europe : Paris",
  "Africa/Lagos": "West Africa : Lagos",
};

function validateTimezone(timeZone) {
  const tz = String(timeZone || "").trim();
  if (!tz) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return null;
  }
}

function getCooperativeTimezone() {
  let stored = null;
  if (getOrgSlugOrNull()) {
    stored = validateTimezone(getCooperativeSetting(SETTING_COOPERATIVE_TIMEZONE));
  }
  if (stored) return stored;
  const env = validateTimezone(ENV_FALLBACK);
  if (env) return env;
  return DEFAULT_COOPERATIVE_TIMEZONE;
}

function setCooperativeTimezone(timeZone) {
  const validated = validateTimezone(timeZone);
  if (!validated) {
    throw new Error(
      "Invalid time zone. Use an IANA name such as America/Los_Angeles."
    );
  }
  const { getDb } = require("../db/database");
  const db = getDb();
  ensureSettingsTable(db);
  setCooperativeSetting(db, SETTING_COOPERATIVE_TIMEZONE, validated);
  return validated;
}

function listSupportedTimezones() {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return Object.keys(TIMEZONE_LABELS);
}

function timezoneLabel(timeZone) {
  return TIMEZONE_LABELS[timeZone] || timeZone.replace(/_/g, " ");
}

function calendarParts(date = new Date(), timeZone = getCooperativeTimezone()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const pick = (type) => Number(parts.find((p) => p.type === type).value);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
  };
}

/** Month/year label safe on UTC servers (Render) : avoids `new Date(y, m-1, 1)` Pacific shift. */
function formatMonthYearLabel(year, month, timeZone = getCooperativeTimezone()) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(Date.UTC(year, month - 1, 15, 12, 0, 0)));
}

function todayIso(date = new Date(), timeZone = getCooperativeTimezone()) {
  const { year, month, day } = calendarParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localeDateString(date = new Date(), options = {}, timeZone = getCooperativeTimezone()) {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone,
    ...options,
  });
}

function isMonthEndDay(date = new Date(), timeZone = getCooperativeTimezone()) {
  const { year, month, day } = calendarParts(date, timeZone);
  const lastDay = new Date(year, month, 0).getDate();
  return day === lastDay;
}

function isFirstDayOfMonth(date = new Date(), timeZone = getCooperativeTimezone()) {
  return calendarParts(date, timeZone).day === 1;
}

function previousMonthYearMonth(date = new Date(), timeZone = getCooperativeTimezone()) {
  const { year, month } = calendarParts(date, timeZone);
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/** UTC ISO instant for DB storage (unambiguous). */
function nowUtcIso(date = new Date()) {
  return date.toISOString();
}

/**
 * Parse SQLite datetime('now') (UTC, no suffix) or ISO strings into a Date instant.
 */
function parseStoredInstant(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (s.includes("T")) {
    const normalized =
      s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function instantToCooperativeDateIso(value, timeZone = getCooperativeTimezone()) {
  const instant = parseStoredInstant(value);
  if (!instant) return null;
  return todayIso(instant, timeZone);
}

function formatInstantAsCooperativeDate(
  value,
  options = {},
  timeZone = getCooperativeTimezone()
) {
  const instant = parseStoredInstant(value);
  if (!instant) return null;
  return instant.toLocaleDateString("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

module.exports = {
  SETTING_COOPERATIVE_TIMEZONE,
  DEFAULT_COOPERATIVE_TIMEZONE,
  getCooperativeTimezone,
  setCooperativeTimezone,
  validateTimezone,
  listSupportedTimezones,
  timezoneLabel,
  calendarParts,
  formatMonthYearLabel,
  todayIso,
  localeDateString,
  isMonthEndDay,
  isFirstDayOfMonth,
  previousMonthYearMonth,
  nowUtcIso,
  parseStoredInstant,
  instantToCooperativeDateIso,
  formatInstantAsCooperativeDate,
};
