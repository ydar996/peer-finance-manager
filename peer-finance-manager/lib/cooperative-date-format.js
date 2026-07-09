const { getCooperativeSetting, setCooperativeSetting, ensureSettingsTable } = require("./cooperative-settings");

const SETTING_COOPERATIVE_DATE_FORMAT = "cooperative_date_format";
const DEFAULT_DATE_FORMAT = "MDY";

const DATE_FORMAT_OPTIONS = {
  MDY: { label: "MM/DD/YYYY", example: "07/03/2026" },
  DMY: { label: "DD/MM/YYYY", example: "03/07/2026" },
  YMD: { label: "YYYY-MM-DD", example: "2026-07-03" },
};

function getCooperativeDateFormat() {
  const stored = String(getCooperativeSetting(SETTING_COOPERATIVE_DATE_FORMAT) || "")
    .trim()
    .toUpperCase();
  if (DATE_FORMAT_OPTIONS[stored]) return stored;
  return DEFAULT_DATE_FORMAT;
}

function setCooperativeDateFormat(format) {
  const key = String(format || "")
    .trim()
    .toUpperCase();
  if (!DATE_FORMAT_OPTIONS[key]) {
    throw new Error("Date format must be MDY, DMY, or YMD.");
  }
  const { getDb } = require("../db/database");
  const db = getDb();
  ensureSettingsTable(db);
  setCooperativeSetting(db, SETTING_COOPERATIVE_DATE_FORMAT, key);
  return key;
}

function parseCooperativeDate(value, format = getCooperativeDateFormat()) {
  const s = String(value || "").trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return { year: y, month: m, day: d, iso: s };
  }

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    let month;
    let day;
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    if (format === "DMY") {
      day = a;
      month = b;
    } else {
      month = a;
      day = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { year, month, day, iso };
  }

  return null;
}

function formatCooperativeDate(iso, format = getCooperativeDateFormat()) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (format === "YMD") return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (format === "DMY") return `${d}/${m}/${y}`;
  return `${m}/${d}/${y}`;
}

module.exports = {
  SETTING_COOPERATIVE_DATE_FORMAT,
  DEFAULT_DATE_FORMAT,
  DATE_FORMAT_OPTIONS,
  getCooperativeDateFormat,
  setCooperativeDateFormat,
  parseCooperativeDate,
  formatCooperativeDate,
};
