const { MONTH_NAMES } = require("./constants");

function lastDayOfMonth(year, monthIndex) {
  const last = new Date(year, monthIndex + 1, 0);
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, "0");
  const d = String(last.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthIndexFromName(name) {
  return MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === String(name || "").toLowerCase()
  );
}

function addMonths(isoDate, count) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1 + count, d);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function monthsBetween(startIso, endIso) {
  const [sy, sm] = startIso.split("-").map(Number);
  const [ey, em] = endIso.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm);
}

module.exports = {
  lastDayOfMonth,
  monthIndexFromName,
  addMonths,
  monthsBetween,
};
