const { getCountryProfile } = require("./country-profile");

const formatterCache = new Map();

function getMoneyFormatter(profile = getCountryProfile()) {
  const locale = profile?.locale || "en-US";
  const currency = profile?.currency || "USD";
  const symbol = profile?.currencySymbol || null;
  const key = `${locale}:${currency}:${symbol || ""}`;
  if (!formatterCache.has(key)) {
    if (symbol) {
      const numberFormat = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      formatterCache.set(key, {
        format: (value) => `${symbol}${numberFormat.format(Math.abs(Number(value) || 0))}`,
      });
    } else {
      formatterCache.set(
        key,
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
        })
      );
    }
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
