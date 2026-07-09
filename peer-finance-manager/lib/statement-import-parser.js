const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getCoopRoot, getAppRoot, isPackaged } = require("./paths");
const parserRoot = isPackaged() ? getAppRoot() : getCoopRoot();
const { resolveMember } = require(path.join(parserRoot, "lib", "bank-statement-parser"));
const { parseCooperativeDate } = require("./cooperative-date-format");
const { parseTypeLabel, memberRequiredForType, isAppendSupportedType } = require("./transaction-import-types");
const { resolveLedgerMemberName } = require("./member-name-match");
const {
  parseStatementFile,
  isSpreadsheetFile,
  inferNarrativeFromDescription,
  narrativeToLedgerType,
  refineMemberLedgerType,
} = require("./parse-bank-sources");

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function parseAmount(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").replace(/"/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findHeaderIndex(lines) {
  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]).map(normalizeHeader);
    if (cols.includes("date") && cols.includes("description") && cols.includes("amount")) {
      return i;
    }
  }
  return -1;
}

function detectImportFormat(headerCols) {
  const cols = headerCols.map(normalizeHeader);
  const hasType = cols.includes("type");
  const hasNarrative = cols.includes("narrative");
  const hasMember = cols.includes("member");
  if (hasType) return "template";
  if (hasNarrative && hasMember) return "ledger";
  return "statement";
}

function colIndex(headerCols, names) {
  const normalized = headerCols.map(normalizeHeader);
  for (const name of names) {
    const idx = normalized.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

function classifyFromDescription({ description, amount, member, memberNames }) {
  const narrative = inferNarrativeFromDescription(description, "");
  const ledgerType = narrativeToLedgerType(narrative);
  if (!ledgerType) return { ledgerType: null, member: member || null };

  let resolvedMember = member || null;
  if (!resolvedMember && ledgerType === "deposit") {
    resolvedMember = resolveMember(description, memberNames);
  }

  const refinedLedgerType = refineMemberLedgerType({
    ledgerType,
    description,
    amount,
    member: resolvedMember,
  });

  return { ledgerType: refinedLedgerType, member: resolvedMember };
}

function parseTemplateCsv(filePath, memberNames) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const headerIndex = findHeaderIndex(lines);
  if (headerIndex < 0) {
    throw new Error("Could not find Date, Description, and Amount columns.");
  }

  const headerCols = parseCsvLine(lines[headerIndex]);
  const format = detectImportFormat(headerCols);
  const dateCol = colIndex(headerCols, ["date"]);
  const descCol = colIndex(headerCols, ["description"]);
  const amountCol = colIndex(headerCols, ["amount"]);
  const typeCol = colIndex(headerCols, ["type", "narrative"]);
  const memberCol = colIndex(headerCols, ["member"]);
  const refCol = colIndex(headerCols, ["reference"]);

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const description = cols[descCol] || "";
    if (!description.trim() && !cols[amountCol]) continue;
    if (/beginning balance/i.test(description)) continue;

    const dateParsed = parseCooperativeDate(cols[dateCol]);
    const amount = parseAmount(cols[amountCol]);
    if (!dateParsed || amount == null) continue;

    const explicitType = typeCol >= 0 ? cols[typeCol] : "";
    const explicitMember = memberCol >= 0 ? String(cols[memberCol] || "").trim() : "";
    const reference = refCol >= 0 ? String(cols[refCol] || "").trim() : "";

    let ledgerType = null;
    let member = null;
    let typeSource = "inferred";

    if (format === "template" || (explicitType && parseTypeLabel(explicitType))) {
      ledgerType =
        parseTypeLabel(explicitType) ||
        narrativeToLedgerType(explicitType);
      typeSource = explicitType ? "explicit" : "inferred";
    }

    if (explicitMember) {
      member =
        resolveLedgerMemberName(explicitMember, memberNames) ||
        (memberNames.includes(explicitMember) ? explicitMember : explicitMember);
    }

    if (!ledgerType) {
      const classified = classifyFromDescription({
        description,
        amount,
        member,
        memberNames,
      });
      ledgerType = classified.ledgerType;
      member = member || classified.member;
    }

    rows.push({
      date: dateParsed.iso,
      description: String(description).trim(),
      amount,
      reference,
      member,
      ledgerType,
      typeSource,
      format,
    });
  }

  return rows;
}

function parseTemplateXlsx(filePath, memberNames) {
  const wb = XLSX.readFile(filePath);
  const sheetName =
    wb.SheetNames.find((n) => /transaction/i.test(n)) || wb.SheetNames[0];
  const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  const rows = [];

  for (const row of sheetRows) {
    const keys = Object.keys(row);
    const findVal = (...names) => {
      for (const key of keys) {
        if (names.includes(normalizeHeader(key))) return row[key];
      }
      return "";
    };

    const dateRaw = findVal("date");
    const description = String(findVal("description") || "").trim();
    const amount = parseAmount(findVal("amount"));
    if (!description && amount == null) continue;
    if (/beginning balance/i.test(description)) continue;

    let dateIso = String(dateRaw || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      const parsed = parseCooperativeDate(dateRaw);
      if (!parsed) continue;
      dateIso = parsed.iso;
    }
    if (amount == null) continue;

    const explicitType = String(findVal("type", "narrative") || "").trim();
    const explicitMember = String(findVal("member") || "").trim();
    const reference = String(findVal("reference") || "").trim();

    let ledgerType = parseTypeLabel(explicitType) || narrativeToLedgerType(explicitType);
    let member = explicitMember
      ? resolveLedgerMemberName(explicitMember, memberNames) || explicitMember
      : null;
    let typeSource = explicitType ? "explicit" : "inferred";

    if (!ledgerType) {
      const classified = classifyFromDescription({
        description,
        amount,
        member,
        memberNames,
      });
      ledgerType = classified.ledgerType;
      member = member || classified.member;
    }

    rows.push({
      date: dateIso,
      description,
      amount,
      reference,
      member,
      ledgerType,
      typeSource,
      format: explicitType ? "template" : "statement",
    });
  }

  return rows;
}

function parseUploadedStatement({ filePath, originalName, memberNames }) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Upload a statement or import template file.");
  }

  if (isSpreadsheetFile(filePath, originalName)) {
    const templateRows = parseTemplateXlsx(filePath, memberNames);
    if (templateRows.length) return templateRows;
    const parsed = parseStatementFile(filePath, memberNames, originalName);
    return parsed.map((tx) => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      reference: "",
      member: tx.member || null,
      ledgerType: tx.ledgerType,
      typeSource: "inferred",
      format: "ledger",
    }));
  }

  try {
    const templateRows = parseTemplateCsv(filePath, memberNames);
    if (templateRows.length) return templateRows;
  } catch (_) {}

  const parsed = parseStatementFile(filePath, memberNames, originalName);
  return parsed.map((tx) => ({
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    reference: "",
    member: tx.member || null,
    ledgerType: tx.ledgerType,
    typeSource: "inferred",
    format: "statement",
  }));
}

function validateParsedRow(row, memberNames) {
  const issues = [];
  if (!row.date) issues.push("Date is missing or invalid.");
  if (!row.description) issues.push("Description is required.");
  if (row.amount == null || !Number.isFinite(Number(row.amount))) {
    issues.push("Amount is missing or invalid.");
  }
  if (!row.ledgerType || !isAppendSupportedType(row.ledgerType)) {
    issues.push("Type could not be resolved. Set Type explicitly.");
  }
  if (row.ledgerType && memberRequiredForType(row.ledgerType)) {
    const member = row.member
      ? resolveLedgerMemberName(row.member, memberNames) || row.member
      : null;
    if (!member) {
      issues.push("Member is required for this transaction type.");
    } else {
      row.member = member;
    }
  }
  return issues;
}

module.exports = {
  parseUploadedStatement,
  validateParsedRow,
  detectImportFormat,
};
