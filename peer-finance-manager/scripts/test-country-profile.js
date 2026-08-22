const assert = require("assert");
const {
  normalizeCountryCode,
  getCountryProfileByCode,
  listCountryProfiles,
  publicCountryProfile,
  DEFAULT_COUNTRY_CODE,
} = require("../lib/country-profile");
const { parseAmount, detectCsvFormat } = require("../lib/import-format-service");
const { parseCooperativeDate, formatCooperativeDate } = require("../lib/cooperative-date-format");
const { formatMoney } = require("../lib/money-format");
const { NG_STATES, NG_BANKS, US_STATES } = require("../lib/country-catalog");

assert.strictEqual(normalizeCountryCode(""), DEFAULT_COUNTRY_CODE);
assert.strictEqual(normalizeCountryCode("ng"), "NG");
assert.strictEqual(normalizeCountryCode("XX"), "US");
assert.strictEqual(getCountryProfileByCode("NG").currency, "NGN");
assert.strictEqual(getCountryProfileByCode("US").currency, "USD");
assert.strictEqual(getCountryProfileByCode(null).code, "US");
assert.ok(listCountryProfiles().some((row) => row.code === "NG"));

assert.strictEqual(parseAmount("1,234.56"), 1234.56);
assert.strictEqual(parseAmount("₦50,000.00"), 50000);
assert.strictEqual(parseAmount("NGN 2500"), 2500);
assert.strictEqual(parseAmount("$70.68"), 70.68);

const usLines = ["Date,Description,Amount", "08/21/2026,Zelle from Jane,100.00"];
const usDetected = detectCsvFormat(usLines);
assert.strictEqual(usDetected.format, "csv_date_description_amount");
assert.strictEqual(usDetected.headerIndex, 0);

const ngLines = [
  "Trans Date,Narration,Debit,Credit,Balance",
  '21/08/2026,NIP CREDIT FROM JANE,,"50,000.00",100000',
];
const ngDetected = detectCsvFormat(ngLines);
assert.strictEqual(ngDetected.format, "csv_date_description_credit_debit");
assert.strictEqual(ngDetected.headerIndex, 0);

const mdy = parseCooperativeDate("08/21/2026", "MDY");
assert.strictEqual(mdy.iso, "2026-08-21");
const dmy = parseCooperativeDate("21/08/2026", "DMY");
assert.strictEqual(dmy.iso, "2026-08-21");
assert.strictEqual(formatCooperativeDate("2026-08-21", "MDY"), "08/21/2026");
assert.strictEqual(formatCooperativeDate("2026-08-21", "DMY"), "21/08/2026");

assert.strictEqual(NG_STATES.length, 37);
assert.strictEqual(US_STATES.length, 51);
assert.ok(NG_STATES.some((row) => row.name === "Lagos"));
assert.ok(NG_STATES.some((row) => row.aliases.includes("FCT")));
assert.ok(
  NG_BANKS.some(
    (row) =>
      /GTBank/i.test(row.name) &&
      row.aliases.some((alias) => alias.toLowerCase() === "gtb")
  )
);
assert.ok(NG_BANKS.some((row) => /Zenith/i.test(row.name)));
assert.ok(NG_BANKS.some((row) => /Moniepoint/i.test(row.name)));

const ngPublic = publicCountryProfile(getCountryProfileByCode("NG"));
assert.strictEqual(ngPublic.dateFormat, "DMY");
assert.strictEqual(ngPublic.states.length, 37);
assert.ok(ngPublic.bankInstitutions.length >= NG_BANKS.length);

const usPublic = publicCountryProfile(getCountryProfileByCode("US"));
assert.strictEqual(usPublic.dateFormat, "MDY");
assert.strictEqual(usPublic.states.length, 51);

const usd = formatMoney(70.68);
assert.ok(usd.includes("70.68") || usd.includes("70.68"), usd);

console.log("country-profile tests passed");
