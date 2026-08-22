const { getCountryProfile } = require("./country-profile");

const formatterCache = new Map();

function getMoneyFormatter(profile = getCountryProfile()) {
  const locale = profile?.locale || "en-US";
  const currency = profile?.currency || "USD";
  const key = `${locale}:${currency}`;
  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      })
    );
  }
  return formatterCache.get(key);
}

function formatMoney(value, { parens = false } = {}) {
  const number = Number(value) || 0;
  const formatted = getMoneyFormatter().format(Math.abs(number));
  if (number < 0 || parens) return `(${formatted})`;
  return formatted;
}

module.exports = {
  getMoneyFormatter,
  formatMoney,
};
