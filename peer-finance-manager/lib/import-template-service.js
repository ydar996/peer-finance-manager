const XLSX = require("xlsx");
const { getDb } = require("../db/database");
const {
  getCooperativeDateFormat,
  formatCooperativeDate,
  DATE_FORMAT_OPTIONS,
} = require("./cooperative-date-format");
const { getCooperativeTimezone, timezoneLabel } = require("./cooperative-time");
const {
  getPrimaryBankAccount,
  ensureDefaultBankAccount,
} = require("./bank-account-service");
const { listTemplateTypeLabels } = require("./transaction-import-types");

function templateHeaderLines(account) {
  const dateFormat = getCooperativeDateFormat();
  const dateExample = DATE_FORMAT_OPTIONS[dateFormat]?.example || "07/03/2026";
  const tz = timezoneLabel(getCooperativeTimezone());
  return [
    `Institution,${account?.institutionName || ""},,,`,
    `Account,${account?.accountLabel || "Main Operating Account"},,,`,
    `Currency,${account?.currency || "USD"},,,`,
    `Date format,${DATE_FORMAT_OPTIONS[dateFormat]?.label || "MM/DD/YYYY"},,,`,
    `Time zone,${tz},,,`,
    "Required columns: Date Description Amount Type. Member required for member transactions.,,,,",
    ",,,,",
    "Date,Description,Amount,Type,Member,Reference,Balance",
    `${dateExample},Example member contribution,100.00,Member Deposit,Jane Doe,REF-001,`,
  ];
}

function buildImportTemplateCsv() {
  const account = ensureDefaultBankAccount();
  const lines = templateHeaderLines(account);
  return `${lines.map((line) => line).join("\r\n")}\r\n`;
}

function buildImportTemplateXlsxBuffer() {
  const account = ensureDefaultBankAccount();
  const db = getDb();
  const members = db.prepare(`SELECT name FROM members ORDER BY name`).all();

  const wb = XLSX.utils.book_new();
  const instructions = [
    ["Peer Finance Manager : Transaction Import Template"],
    [""],
    ["Institution", account?.institutionName || ""],
    ["Account label", account?.accountLabel || "Main Operating Account"],
    ["Currency", account?.currency || "USD"],
    ["Date format", DATE_FORMAT_OPTIONS[getCooperativeDateFormat()]?.label || "MM/DD/YYYY"],
    ["Time zone", timezoneLabel(getCooperativeTimezone())],
    [""],
    ["Required on every row", "Date, Description, Amount, Type"],
    ["Member required when Type is", "Member Deposit, Withdrawal, Loan Repayment, Loan Disbursement, Distribution"],
    ["Leave Reference blank unless your bank provides a transaction id"],
    [""],
    ["Type values"],
    ...listTemplateTypeLabels().map((label) => [label]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");

  const dateExample = formatCooperativeDate("2026-07-03");
  const transactions = [
    ["Date", "Description", "Amount", "Type", "Member", "Reference", "Balance"],
    [dateExample, "Example member contribution", 100, "Member Deposit", members[0]?.name || "Member Name", "REF-001", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(transactions), "Transactions");

  if (members.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Member"], ...members.map((m) => [m.name])]),
      "Members"
    );
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  buildImportTemplateCsv,
  buildImportTemplateXlsxBuffer,
  templateHeaderLines,
};
