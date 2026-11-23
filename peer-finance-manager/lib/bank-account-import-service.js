/**
 * Bank account import template: download a spreadsheet, fill in the
 * Cooperative's bank accounts, upload it to register them all at once.
 * Only Account Label is required; every other column is optional.
 * Rows matching an existing account (label+institution, Account ID, or
 * Account No) are skipped, never duplicated.
 */
const fs = require("fs");
const XLSX = require("xlsx");
const { getDb } = require("../db/database");
const { listBankAccounts, createBankAccount } = require("./bank-account-service");
const { getCountryProfile } = require("./country-profile");
const { getCountryCatalog } = require("./country-catalog");
const {
  getCooperativeDateFormat,
  formatCooperativeDate,
  parseCooperativeDate,
  DATE_FORMAT_OPTIONS,
} = require("./cooperative-date-format");

const TEMPLATE_HEADERS = [
  "Account ID",
  "Account Label",
  "Institution",
  "Account No",
  "Currency",
  "Statement Format",
  "Active From",
  "Primary",
];

const HEADER_ALIASES = {
  accountCode: ["accountid", "accountcode", "id", "ref", "reference", "code"],
  accountLabel: ["accountlabel", "label", "accountname", "account", "name"],
  institutionName: ["institution", "institutionname", "bank", "bankname"],
  accountNumber: ["accountno", "accountnumber", "acctno", "acctnumber", "nuban"],
  currency: ["currency", "currencycode"],
  statementFormat: ["statementformat", "format"],
  activeFrom: ["activefrom", "startdate", "openeddate"],
  isPrimary: ["primary", "primaryaccount", "mainaccount"],
};

const STATEMENT_FORMATS = new Set([
  "auto",
  "csv_date_description_amount",
  "csv_date_description_credit_debit",
  "csv_summary_then_transactions",
  "template_explicit",
  "ofx",
  "custom_map",
]);

function normalizeHeaderKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function headerFieldMap() {
  const map = new Map();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) map.set(alias, field);
  }
  return map;
}

function resolveInstitutionName(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const catalog = getCountryCatalog(getCountryProfile()?.code);
  const banks = catalog?.banks || [];
  const needle = text.toLowerCase();
  for (const bank of banks) {
    if (String(bank.name).toLowerCase() === needle) return bank.name;
    if ((bank.aliases || []).some((a) => String(a).toLowerCase() === needle)) return bank.name;
  }
  for (const bank of banks) {
    if (String(bank.name).toLowerCase().includes(needle) || needle.includes(String(bank.name).toLowerCase())) return bank.name;
    if ((bank.aliases || []).some((a) => String(a).toLowerCase() === needle)) return bank.name;
  }
  return text;
}

function buildBankAccountImportTemplateXlsxBuffer() {
  const profile = getCountryProfile();
  const dateFormat = getCooperativeDateFormat();
  const wb = XLSX.utils.book_new();
  const instructions = [
    ["Peer Finance Manager: Bank Account Import Template"],
    [""],
    ["Use this file to register the bank accounts your Cooperative already operates."],
    ["Account Label is required on every row. Every other column is optional."],
    ["Rows matching an existing account (same label and institution, Account ID, or Account No) are skipped, not duplicated."],
    [""],
    ["Account ID", "Optional internal code your Cooperative uses (for example BA001)"],
    ["Account No", "Optional bank-issued account number"],
    ["Currency", `Optional ISO code, defaults to ${profile?.currency || "USD"}`],
    ["Institution", "Optional; copy the name from the Banks sheet, or type a short name like GTBank and it resolves automatically"],
    ["Statement Format", "Optional; leave blank for auto-detect when importing statements"],
    ["Primary", "Enter Yes on the main operating account; at most one account is primary"],
    ["Date format", `${DATE_FORMAT_OPTIONS[dateFormat]?.label || "MM/DD/YYYY"} (for example ${formatCooperativeDate("2026-01-15")})`],
    [""],
    ["Columns"],
    ...TEMPLATE_HEADERS.map((h) => [`${h}${h === "Account Label" ? " *" : ""}`]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");

  const exampleDate = formatCooperativeDate("2026-01-15");
  const accounts = [
    TEMPLATE_HEADERS,
    ["BA001", "Main Operating Account", "Providus Bank", "1308706267", profile?.currency || "USD", "", exampleDate, "Yes"],
    ["BA002", "Share Capital Account", "GTBank", "0123456789", profile?.currency || "USD", "", "", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(accounts), "Bank Accounts");

  const catalog = getCountryCatalog(profile?.code);
  if (catalog?.banks?.length) {
    const banksSheet = [["Institution Name", "Also Known As"]];
    for (const bank of catalog.banks) {
      banksSheet.push([bank.name, (bank.aliases || []).join(", ")]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(banksSheet), "Banks");
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function buildBankAccountImportTemplateCsv() {
  const profile = getCountryProfile();
  const exampleDate = formatCooperativeDate("2026-01-15");
  const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    TEMPLATE_HEADERS,
    ["BA001", "Main Operating Account", "Providus Bank", "1308706267", profile?.currency || "USD", "", exampleDate, "Yes"],
  ];
  return rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
}

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseDateCell(value, rowErrors, label) {
  const text = cellText(value);
  if (!text) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const coop = parseCooperativeDate(text);
  if (coop?.iso) return coop.iso;
  rowErrors.push(`${label} "${text}" is not a valid date`);
  return null;
}

function parseYesNo(value) {
  const s = cellText(value).toLowerCase();
  return ["yes", "y", "true", "1"].includes(s);
}

function loadRowsFromFile(filePath) {
  const wb = XLSX.readFile(filePath);
  for (const sheetName of wb.SheetNames) {
    if (/instructions/i.test(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    if (rows.length) return { sheetName, rows };
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  return { sheetName: wb.SheetNames[0], rows };
}

function findHeaderRow(rows) {
  const fieldMap = headerFieldMap();
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const keys = rows[i].map(normalizeHeaderKey);
    const colToField = new Map();
    for (let c = 0; c < keys.length; c++) {
      const field = fieldMap.get(keys[c]);
      if (field && !colToField.has(c)) colToField.set(c, field);
    }
    if ([...colToField.values()].includes("accountLabel")) return { index: i, colToField };
  }
  return null;
}

function importBankAccountTemplate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error("Upload file not found");
  const { rows } = loadRowsFromFile(filePath);
  const header = findHeaderRow(rows);
  if (!header) {
    throw new Error(
      "Could not find an Account Label column. Download the Bank Account Import Template and keep its header row."
    );
  }

  const defaultCurrency = getCountryProfile()?.currency || "USD";
  const existing = listBankAccounts();
  const seenKeys = new Set(
    existing.map((a) =>
      `${String(a.accountLabel || "").toLowerCase()}|${String(a.institutionName || "").toLowerCase()}`
    )
  );
  const seenCodes = new Set(
    existing.filter((a) => a.accountCode).map((a) => String(a.accountCode).toLowerCase())
  );
  const seenNumbers = new Set(
    existing.filter((a) => a.accountNumber).map((a) => String(a.accountNumber).toLowerCase())
  );

  const created = [];
  const skipped = [];
  const errors = [];

  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i];
    const record = {};
    for (const [colIdx, field] of header.colToField) {
      record[field] = row[colIdx];
    }
    const rowNumber = i + 1;
    const label = cellText(record.accountLabel);
    const institution = resolveInstitutionName(record.institutionName);
    const code = cellText(record.accountCode);
    const number = cellText(record.accountNumber);
    const rowErrors = [];
    if (!label) rowErrors.push("Account Label is required");
    const activeFrom = parseDateCell(record.activeFrom, rowErrors, "Active From");

    const format = cellText(record.statementFormat).toLowerCase();
    if (format && !STATEMENT_FORMATS.has(format)) {
      rowErrors.push(`Statement Format "${format}" is not recognized; leave blank for auto-detect`);
    }

    if (rowErrors.length) {
      errors.push({ row: rowNumber, name: label || `Row ${rowNumber}`, errors: rowErrors });
      continue;
    }

    const key = `${label.toLowerCase()}|${institution.toLowerCase()}`;
    if (seenKeys.has(key) || (code && seenCodes.has(code.toLowerCase())) || (number && seenNumbers.has(number.toLowerCase()))) {
      skipped.push({ row: rowNumber, name: label, reason: "Account already exists" });
      continue;
    }

    try {
      const account = createBankAccount({
        accountLabel: label,
        accountCode: code || null,
        accountNumber: number || null,
        institutionName: institution,
        currency: cellText(record.currency) || defaultCurrency,
        statementFormat: format || "auto",
        isPrimary: parseYesNo(record.isPrimary),
        activeFrom: activeFrom || null,
      });
      seenKeys.add(key);
      if (code) seenCodes.add(code.toLowerCase());
      if (number) seenNumbers.add(number.toLowerCase());
      created.push({ row: rowNumber, accountLabel: account.accountLabel, id: account.id });
    } catch (err) {
      errors.push({ row: rowNumber, name: label || `Row ${rowNumber}`, errors: [err.message] });
    }
  }

  try {
    fs.unlinkSync(filePath);
  } catch (_) {
    /* uploaded temp file cleanup is best-effort */
  }

  return {
    created: created.length,
    skipped: skipped.length,
    failed: errors.length,
    accounts: created,
    skippedRows: skipped,
    errors,
  };
}

module.exports = {
  TEMPLATE_HEADERS,
  buildBankAccountImportTemplateXlsxBuffer,
  buildBankAccountImportTemplateCsv,
  importBankAccountTemplate,
};
