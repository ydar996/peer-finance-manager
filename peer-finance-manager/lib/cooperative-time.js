/**
 * Cooperative business calendar — defaults to America/Los_Angeles (San Diego).
 * Avoids UTC midnight rolling the date to the next day while admins are still on the prior local date.
 */
const COOPERATIVE_TIMEZONE =
  process.env.PFM_TIMEZONE || process.env.TZ || "America/Los_Angeles";

function calendarParts(date = new Date(), timeZone = COOPERATIVE_TIMEZONE) {
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

function todayIso(date = new Date(), timeZone = COOPERATIVE_TIMEZONE) {
  const { year, month, day } = calendarParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localeDateString(date = new Date(), options = {}, timeZone = COOPERATIVE_TIMEZONE) {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone,
    ...options,
  });
}

function isMonthEndDay(date = new Date(), timeZone = COOPERATIVE_TIMEZONE) {
  const { year, month, day } = calendarParts(date, timeZone);
  const lastDay = new Date(year, month, 0).getDate();
  return day === lastDay;
}

function isFirstDayOfMonth(date = new Date(), timeZone = COOPERATIVE_TIMEZONE) {
  return calendarParts(date, timeZone).day === 1;
}

function previousMonthYearMonth(date = new Date(), timeZone = COOPERATIVE_TIMEZONE) {
  const { year, month } = calendarParts(date, timeZone);
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

module.exports = {
  COOPERATIVE_TIMEZONE,
  calendarParts,
  todayIso,
  localeDateString,
  isMonthEndDay,
  isFirstDayOfMonth,
  previousMonthYearMonth,
};
