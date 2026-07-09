const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { parseCooperativeDate } = require("./cooperative-date-format");
const { parseTypeLabel } = require("./transaction-import-types");
const { resolveLedgerMemberName } = require("./member-name-match");
const { resolveMemberFromPaymentAliases } = require("./member-payment-alias-service");
const {
  extractReferenceFromRules,
  classifyDescriptionWithRules,
  getImportRules,
} = require("./import-rules-service");
const {
  inferNarrativeFromDescription,
  narrativeToLedgerType,
  refineMemberLedgerType,
  isSpreadsheetFile,
} = require("./parse-bank-sources");

const STATEMENT_FORMATS = {
  auto: { label: "Auto-detect" },
  csv_date_description_amount: { label: "CSV: Date, Description, Amount" },
  csv_date_description_credit_debit: { label: "CSV: Date, Description, Credit, Debit" },
  csv_summary_then_transactions: { label: "CSV: Summary Block Then Transactions" },
  template_explicit: { label: "PFM Import Template (Type Required)" },
  ofx: { label: "OFX/QFX" },
  custom_map: { label: "Custom Column Mapping" },
};

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

function resolveColumnIndex(headerCols, mappingValue, fallbacks = []) {
  const names = [mappingValue, ...fallbacks].filter(Boolean).map(normalizeHeader);
  const normalized = headerCols.map(normalizeHeader);
  for (const name of names) {
    const idx = normalized.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseStatementSummaryFromText(raw) {
  const out = { beginning: null, ending: null, credits: null, debits: null };
  for (const line of raw.split(/\r?\n/).slice(0, 12)) {
    if (!line.trim()) continue;
    const m = line.match(/^([^,]+),,?("?)([\d,.-]+)\2/);
    if (!m) continue;
    const label = m[1].trim();
    const amt = parseAmount(m[3]);
    if (!Number.isFinite(amt)) continue;
    if (/beginning/i.test(label)) out.beginning = amt;
    if (/ending/i.test(label)) out.ending = amt;
    if (/total credits/i.test(label)) out.credits = amt;
    if (/total debits/i.test(label)) out.debits = amt;
  }
  return out;
}

function detectCsvFormat(lines) {
  const headerIndex = lines.findIndex((line) => {
    const cols = parseCsvLine(line).map(normalizeHeader);
    return cols.includes("date") && cols.includes("description");
  });
  if (headerIndex < 0) return { format: "csv_date_description_amount", headerIndex: -1 };

  const cols = parseCsvLine(lines[headerIndex]).map(normalizeHeader);
  if (cols.includes("type")) return { format: "template_explicit", headerIndex };
  if (cols.includes("credit") && cols.includes("debit")) {
    return { format: "csv_date_description_credit_debit", headerIndex };
  }
  if (headerIndex > 0 && /beginning balance|summary amt/i.test(lines.slice(0, headerIndex).join("\n"))) {
    return { format: "csv_summary_then_transactions", headerIndex };
  }
  return { format: "csv_date_description_amount", headerIndex };
}

function classifyRow({ description, amount, member, memberNames, rules }) {
  const ruleType = classifyDescriptionWithRules(description, rules);
  let ledgerType = ruleType;
  if (!ledgerType) {
    const narrative = inferNarrativeFromDescription(description, "");
    ledgerType = narrativeToLedgerType(narrative);
  }
  if (!ledgerType) return { ledgerType: null, member: member || null };

  let resolvedMember = member || resolveMemberFromPaymentAliases(description, memberNames);
  if (!resolvedMember && ledgerType === "deposit") {
    const { getCoopRoot, getAppRoot, isPackaged } = require("./paths");
    const parserRoot = isPackaged() ? getAppRoot() : getCoopRoot();
    const { resolveMember } = require(path.join(parserRoot, "lib", "bank-statement-parser"));
    resolvedMember = resolveMember(description, memberNames);
  }
  if (!resolvedMember) {
    resolvedMember = resolveMemberFromPaymentAliases(description, memberNames);
  }

  const refinedLedgerType = refineMemberLedgerType({
    ledgerType,
    description,
    amount,
    member: resolvedMember,
  });
  return { ledgerType: refinedLedgerType, member: resolvedMember };
}

function parseCsvRows({
  lines,
  headerIndex,
  columnMapping,
  memberNames,
  rules,
  requireExplicitType = false,
}) {
  const headerCols = parseCsvLine(lines[headerIndex]);
  const dateCol = resolveColumnIndex(headerCols, columnMapping.date, ["date"]);
  const descCol = resolveColumnIndex(headerCols, columnMapping.description, ["description"]);
  const amountCol = resolveColumnIndex(headerCols, columnMapping.amount, ["amount"]);
  const creditCol = resolveColumnIndex(headerCols, columnMapping.credit, ["credit"]);
  const debitCol = resolveColumnIndex(headerCols, columnMapping.debit, ["debit"]);
  const typeCol = resolveColumnIndex(headerCols, columnMapping.type, ["type", "narrative"]);
  const memberCol = resolveColumnIndex(headerCols, columnMapping.member, ["member"]);
  const refCol = resolveColumnIndex(headerCols, columnMapping.reference, ["reference"]);

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const description = descCol >= 0 ? cols[descCol] || "" : "";
    if (!String(description).trim() && amountCol < 0 && creditCol < 0) continue;
    if (/beginning balance/i.test(description)) continue;

    const dateParsed = dateCol >= 0 ? parseCooperativeDate(cols[dateCol]) : null;
    let amount = amountCol >= 0 ? parseAmount(cols[amountCol]) : null;
    if (amount == null && (creditCol >= 0 || debitCol >= 0)) {
      const credit = creditCol >= 0 ? parseAmount(cols[creditCol]) : 0;
      const debit = debitCol >= 0 ? parseAmount(cols[debitCol]) : 0;
      const c = Number(credit) || 0;
      const d = Number(debit) || 0;
      if (c || d) amount = c > 0 ? c : -Math.abs(d);
    }
    if (!dateParsed || amount == null) continue;

    const explicitType = typeCol >= 0 ? cols[typeCol] : "";
    const explicitMember = memberCol >= 0 ? String(cols[memberCol] || "").trim() : "";
    const reference =
      refCol >= 0
        ? String(cols[refCol] || "").trim()
        : extractReferenceFromRules(description, "", rules);

    let ledgerType = null;
    let member = null;
    let typeSource = "inferred";

    if (explicitType) {
      ledgerType = parseTypeLabel(explicitType) || narrativeToLedgerType(explicitType);
      typeSource = "explicit";
    }
    if (explicitMember) {
      member =
        resolveLedgerMemberName(explicitMember, memberNames) ||
        (memberNames.includes(explicitMember) ? explicitMember : explicitMember);
    }
    if (!ledgerType) {
      const classified = classifyRow({ description, amount, member, memberNames, rules });
      ledgerType = classified.ledgerType;
      member = member || classified.member;
    } else if (!member && memberNames.length) {
      const classified = classifyRow({ description, amount, member: null, memberNames, rules });
      member = classified.member;
    }

    if (requireExplicitType && !explicitType) {
      typeSource = "missing";
      ledgerType = ledgerType || null;
    }

    rows.push({
      date: dateParsed.iso,
      description: String(description).trim(),
      amount,
      reference: reference || "",
      member,
      ledgerType,
      typeSource,
      format: requireExplicitType ? "template" : "statement",
    });
  }
  return rows;
}

function parseOfxFile(filePath, memberNames, rules) {
  const raw = fs.readFileSync(filePath, "utf8");
  const blocks = raw.split(/<STMTTRN>/i).slice(1);
  const rows = [];
  for (const block of blocks) {
    const dateMatch = block.match(/<DTPOSTED>(\d{8})/i);
    const amountMatch = block.match(/<TRNAMT>(-?[\d.]+)/i);
    const memoMatch = block.match(/<MEMO>([^<\n]+)/i);
    const nameMatch = block.match(/<NAME>([^<\n]+)/i);
    const fitidMatch = block.match(/<FITID>([^<\n]+)/i);
    if (!dateMatch || !amountMatch) continue;
    const y = dateMatch[1].slice(0, 4);
    const m = dateMatch[1].slice(4, 6);
    const d = dateMatch[1].slice(6, 8);
    const description = (memoMatch?.[1] || nameMatch?.[1] || "").trim();
    const amount = Number(amountMatch[1]);
    if (!description || !Number.isFinite(amount)) continue;
    const reference = fitidMatch?.[1]?.trim() || extractReferenceFromRules(description, "", rules);
    const classified = classifyRow({ description, amount, member: null, memberNames, rules });
    rows.push({
      date: `${y}-${m}-${d}`,
      description,
      amount,
      reference: reference || "",
      member: classified.member,
      ledgerType: classified.ledgerType,
      typeSource: "inferred",
      format: "ofx",
    });
  }
  return rows;
}

function parseStatementFileWithFormat({
  filePath,
  originalName,
  memberNames,
  statementFormat = "auto",
  columnMapping = {},
}) {
  const rules = getImportRules();
  const ext = path.extname(String(originalName || filePath)).toLowerCase();
  const mapping = {
    date: columnMapping.date || "Date",
    description: columnMapping.description || "Description",
    amount: columnMapping.amount || "Amount",
    credit: columnMapping.credit || "Credit",
    debit: columnMapping.debit || "Debit",
    type: columnMapping.type || "Type",
    member: columnMapping.member || "Member",
    reference: columnMapping.reference || "Reference",
  };

  if (statementFormat === "ofx" || ext === ".ofx" || ext === ".qfx") {
    return {
      rows: parseOfxFile(filePath, memberNames, rules),
      summary: null,
      resolvedFormat: "ofx",
    };
  }

  if (isSpreadsheetFile(filePath, originalName) && statementFormat !== "custom_map") {
    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames.find((n) => /transaction/i.test(n)) || wb.SheetNames[0];
    const tmpCsv = path.join(path.dirname(filePath), `_fmt_${Date.now()}.csv`);
    const sheet = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
    fs.writeFileSync(tmpCsv, sheet, "utf8");
    try {
      return parseStatementFileWithFormat({
        filePath: tmpCsv,
        originalName: "sheet.csv",
        memberNames,
        statementFormat,
        columnMapping: mapping,
      });
    } finally {
      try {
        fs.unlinkSync(tmpCsv);
      } catch (_) {}
    }
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const summary = parseStatementSummaryFromText(raw);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  let resolvedFormat = statementFormat;
  let headerIndex = -1;

  if (resolvedFormat === "auto") {
    const detected = detectCsvFormat(lines);
    resolvedFormat = detected.format;
    headerIndex = detected.headerIndex;
  } else if (resolvedFormat === "csv_summary_then_transactions") {
    const detected = detectCsvFormat(lines);
    headerIndex = detected.headerIndex;
  } else {
    headerIndex = lines.findIndex((line) => {
      const cols = parseCsvLine(line).map(normalizeHeader);
      return cols.includes(normalizeHeader(mapping.date)) || cols.includes("date");
    });
  }

  if (headerIndex < 0) {
    throw new Error("Could not find a transaction header row in the uploaded file.");
  }

  const rows = parseCsvRows({
    lines,
    headerIndex,
    columnMapping: mapping,
    memberNames,
    rules,
    requireExplicitType: resolvedFormat === "template_explicit",
  });

  return { rows, summary, resolvedFormat };
}

module.exports = {
  STATEMENT_FORMATS,
  parseStatementSummaryFromText,
  parseStatementFileWithFormat,
  detectCsvFormat,
  classifyRow,
};
