const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getCoopRoot, getAppRoot, isPackaged } = require("./paths");
const parserRoot = isPackaged() ? getAppRoot() : getCoopRoot();
const {
  parseBankStatementCsv,
  resolveMember,
  NARRATIVE,
} = require(path.join(parserRoot, "lib", "bank-statement-parser"));
const { resolveLedgerMemberName, resolveDepositMemberFromDescription, resolveProxyBeneficiaryFromDescription } = require("./member-name-match");

const TYPE_MAP = {
  "Member Deposit": "deposit",
  "Member Withdrawal": "withdrawal",
  "Loan Repayment": "loan_repayment",
  "Loan Disbursement": "loan_disbursement",
  Expenses: "expense",
  "Expenses (Uncategorized)": "expense",
  "Purchase of Certificate of Deposit": "cd_purchase",
  "Purchase of Certificate of Deposit with Bank of America": "cd_purchase",
  "Liquidation of Certificate of Deposit": "cd_liquidation",
  "Investment in Caribe Restaurant and Lounge": "investment",
};

const COOPERATIVE_LEDGER_TYPES = new Set([
  "cd_purchase",
  "cd_liquidation",
  "investment",
  "expense",
]);

function normalizeDescriptionKey(description) {
  return String(description || "")
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function dedupeConflictingSpreadsheetRows(parsed) {
  const groups = new Map();
  for (const tx of parsed) {
    const key = `${tx.date}|${tx.amount}|${normalizeDescriptionKey(tx.description)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  const unique = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      unique.push(group[0]);
      continue;
    }
    const cooperative = group.find((tx) => COOPERATIVE_LEDGER_TYPES.has(tx.ledgerType));
    unique.push(cooperative || group[0]);
  }
  return unique;
}

function excelDateToIso(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && value > 20000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * 86400000).toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

function normType(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function narrativeToLedgerType(narrative) {
  const n = normType(narrative);
  return TYPE_MAP[n] || null;
}

function descriptionImpliesLoanRepayment(description) {
  const d = String(description || "").toLowerCase();
  return (
    d.includes("loan repayment") ||
    d.includes("loan payback") ||
    /\bloan payment\b/.test(d) ||
    /\bloan payment\s+\d+\b/.test(d) ||
    /\bfor payment\s+\d+\b/.test(d) ||
    /\bfor repayment\b/.test(d)
  );
}

function descriptionImpliesMemberContribution(description) {
  return /monthly contribution/i.test(String(description || ""));
}

function refineMemberLedgerType({ ledgerType, description, amount, member }) {
  if (descriptionImpliesMemberContribution(description)) {
    return "deposit";
  }
  if (descriptionImpliesLoanRepayment(description)) {
    return "loan_repayment";
  }
  const memberName = String(member || "").toLowerCase();
  if (memberName.includes("oluwabiyi") && Math.abs(Number(amount) - 443.55) < 0.01) {
    return "loan_repayment";
  }
  if (memberName.includes("oluwabiyi") && Math.abs(Number(amount) - 100.13) < 0.01) {
    return "deposit";
  }
  return ledgerType;
}

function inferNarrativeFromDescription(description, narrative) {
  const d = String(description || "").toLowerCase();
  const trimmed = String(description || "").trim();
  if (descriptionImpliesLoanRepayment(description)) {
    return NARRATIVE.LOAN_REPAYMENT;
  }
  if (
    d.includes("monthly fee") ||
    d.includes("bank fee") ||
    d.includes("service fee") ||
    d.includes("maintenance fee")
  ) {
    return "Expenses";
  }
  const checkMatch = trimmed.match(/^check\s*(\d{4})$/i);
  if (checkMatch) {
    const checkNum = Number(checkMatch[1]);
    if (CHECK_LOAN_BORROWERS[checkNum]) {
      return NARRATIVE.LOAN_DISBURSEMENT;
    }
    if (checkNum === 1172) {
      return "Investment in Caribe Restaurant and Lounge";
    }
    return "Expenses";
  }
  if (d.includes("loan disbursement")) {
    return NARRATIVE.LOAN_DISBURSEMENT;
  }
  if (d.includes("zelle payment to") || d.includes("withdrawal")) {
    return NARRATIVE.MEMBER_WITHDRAWAL;
  }
  const n = normType(narrative);
  if (n && TYPE_MAP[n]) return n;
  if (n) return n;
  return NARRATIVE.MEMBER_DEPOSIT;
}

const CHECK_LOAN_BORROWERS = {
  1160: "Oluwabiyi Omotuyole",
  1163: "Yomi Salami",
  1169: "Gbanju Aruwayo-Obe",
  1178: "Oluwabiyi Omotuyole",
  1181: "Taiwo Embassey",
  1187: "Yomi Salami",
  1190: "Gbanju Aruwayo-Obe",
};

function resolveLoanDisbursementMember(description, memberNames) {
  const checkMatch = String(description || "").match(/check\s*(\d{4})/i);
  if (!checkMatch) return null;
  const canonical = CHECK_LOAN_BORROWERS[Number(checkMatch[1])];
  if (!canonical) return null;
  if (memberNames.includes(canonical)) return canonical;
  return resolveLedgerMemberName(canonical, memberNames) || canonical;
}

function resolveMemberName(rawName, description, memberNames) {
  const proxyBeneficiary = resolveProxyBeneficiaryFromDescription(description, memberNames);
  if (proxyBeneficiary) return proxyBeneficiary;

  const trimmed = String(rawName || "").trim();
  if (trimmed) {
    const resolved = resolveLedgerMemberName(trimmed, memberNames);
    if (resolved) return resolved;
    if (memberNames.includes(trimmed)) return trimmed;
  }
  return resolveMember(description, memberNames);
}

function parseAllDepositsXlsx(filePath, memberNames) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const parsed = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const description = String(row[2] || "").trim();
    const amount = Number(row[3]);
    const txType = normType(row[8]);
    const date = excelDateToIso(row[1]);
    if (!date || (!description && !amount && !txType)) continue;
    if (description.toLowerCase().includes("beginning balance")) continue;

    const repeatKey = row[6] !== "" && row[6] != null ? Number(row[6]) : null;
    const depositor = String(row[0] || row[5] || "").trim();
    const memberRef = String(row[10] || "").trim();
    const ledgerType = TYPE_MAP[txType];
    if (!ledgerType) continue;

    let member = null;
    if (ledgerType === "deposit") {
      member = resolveMemberName(depositor, description, memberNames);
    } else {
      member = resolveMemberName(memberRef || depositor, description, memberNames);
    }

    parsed.push({
      source: "all_deposits_xlsx",
      date,
      description,
      amount,
      transactionType: txType,
      ledgerType,
      member,
      depositor,
      repeatKey,
    });
  }

  const deduped = dedupeConflictingSpreadsheetRows(parsed);
  const seen = new Map();
  const unique = [];
  for (const tx of deduped) {
    const key =
      tx.repeatKey != null && !Number.isNaN(tx.repeatKey)
        ? `${tx.date}|${tx.transactionType}|${tx.repeatKey}|${tx.member || ""}`
        : `${tx.date}|${tx.ledgerType}|${tx.amount}|${tx.description.slice(0, 80)}|${tx.member || ""}`;
    if (seen.has(key)) continue;
    seen.set(key, true);
    unique.push(tx);
  }
  return unique;
}

function isReferenceLedgerWorkbook(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName =
    wb.SheetNames.find((n) => n === "Cooperative Bank Ledger") || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", header: 1 });
  for (const row of rows.slice(0, 8)) {
    const cells = (row || []).map((cell) => String(cell || "").trim());
    if (cells.includes("Ledger Type") || cells.includes("ISO Date")) return true;
  }
  return false;
}

function parseReferenceLedgerXlsx(filePath, memberNames) {
  const wb = XLSX.readFile(filePath);
  const sheetName =
    wb.SheetNames.find((n) => n === "Cooperative Bank Ledger") || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  const parsed = [];

  for (const row of rows) {
    const date =
      String(row["ISO Date"] || "").slice(0, 10) || excelDateToIso(row.Date);
    const description = String(row.Description || "").trim();
    const amount = Number(row.Amount);
    const ledgerType =
      String(row["Ledger Type"] || "").trim() || narrativeToLedgerType(row.Narrative);
    const narrative = normType(row.Narrative);
    if (!date || !ledgerType || !Number.isFinite(amount)) continue;
    if (description.toLowerCase().includes("beginning balance")) continue;

    const memberRef = String(row.Member || "").trim();
    let member = resolveMemberName(memberRef, description, memberNames);
    if (!member && ledgerType === "loan_disbursement") {
      member = resolveLoanDisbursementMember(description, memberNames);
    }
    if (!member && ledgerType === "loan_repayment" && /BKOFAMERICA MOBILE/i.test(description)) {
      member =
        resolveLedgerMemberName("Oluwabiyi Omotuyole", memberNames) ||
        "Oluwabiyi Omotuyole";
    }
    if (!member && ledgerType === "deposit") {
      member = resolveMember(description, memberNames);
    }
    if (!member && ledgerType === "deposit") {
      member = resolveDepositMemberFromDescription(description, memberNames);
    }

    const refinedLedgerType = refineMemberLedgerType({
      ledgerType,
      description,
      amount,
      member,
    });

    parsed.push({
      source: "reference_ledger",
      date,
      description,
      amount,
      transactionType: narrative || refinedLedgerType,
      ledgerType: refinedLedgerType,
      member,
      depositor: member,
      repeatKey: null,
    });
  }
  return parsed;
}

function parseWorkbookXlsx(filePath, memberNames) {
  if (isReferenceLedgerWorkbook(filePath)) {
    return parseReferenceLedgerXlsx(filePath, memberNames);
  }
  return parseAllDepositsXlsx(filePath, memberNames);
}

function isSpreadsheetFile(filePath, originalName) {
  const ext = path.extname(String(originalName || filePath || "")).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") return true;
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } catch {
    return false;
  }
}

function parseStatementFile(filePath, memberNames, originalName) {
  if (isSpreadsheetFile(filePath, originalName)) {
    return parseWorkbookXlsx(filePath, memberNames);
  }
  return parseStmtCsv(filePath, memberNames);
}

function parseStmtCsv(filePath, memberNames) {
  const raw = parseBankStatementCsv(filePath, memberNames);
  return raw.map((tx) => {
    const narrative = inferNarrativeFromDescription(tx.description, tx.narrative);
    const ledgerType = narrativeToLedgerType(narrative);
    if (!ledgerType) return null;
    let member = tx.member;
    if (!member && ledgerType === "deposit") {
      member = resolveMember(tx.description, memberNames);
    }
    if (!member && ledgerType === "loan_disbursement") {
      member = resolveLoanDisbursementMember(tx.description, memberNames);
    }
    if (!member && ledgerType === "loan_repayment" && /BKOFAMERICA MOBILE/i.test(tx.description)) {
      member =
        resolveLedgerMemberName("Oluwabiyi Omotuyole", memberNames) ||
        "Oluwabiyi Omotuyole";
    }
    const refinedLedgerType = refineMemberLedgerType({
      ledgerType,
      description: tx.description,
      amount: tx.amount,
      member,
    });
    return {
      source: "stmt_csv",
      date: tx.date.iso,
      description: tx.description,
      amount: tx.amount,
      transactionType: narrative,
      ledgerType: refinedLedgerType,
      member,
      depositor: member,
      repeatKey: null,
    };
  }).filter(Boolean);
}

function mergeBankSources(xlsxTxs, csvTxs) {
  const csvCutoff = "2026-02-02";
  const map = new Map();

  function add(tx, priority) {
    const key = `${tx.date}|${tx.ledgerType}|${tx.amount}|${normalizeDescriptionKey(tx.description)}`;
    const existing = map.get(key);
    if (!existing || priority > existing.priority) {
      const member = tx.member || existing?.member;
      map.set(key, { ...tx, member, depositor: member || tx.depositor, priority });
    } else if (!existing.member && tx.member) {
      map.set(key, { ...existing, member: tx.member, depositor: tx.member });
    }
  }

  xlsxTxs
    .filter((t) => (t.date || "") < csvCutoff)
    .forEach((tx) => add(tx, 1));
  csvTxs.forEach((tx) => add(tx, 2));
  xlsxTxs
    .filter((t) => (t.date || "") >= csvCutoff)
    .forEach((tx) => add(tx, 3));

  const merged = [...map.values()]
    .map(({ priority, ...tx }) => tx)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  return dedupeDepositLoanConflicts(merged);
}

function isBankChargeTransaction(tx) {
  const d = String(tx.description || "").toLowerCase();
  return (
    tx.ledgerType === "expense" &&
    (d.includes("monthly fee") ||
      d.includes("bank fee") ||
      d.includes("service fee") ||
      d.includes("maintenance fee"))
  );
}

function dedupeDuplicateBankCharges(transactions) {
  const seen = new Set();
  const unique = [];
  for (const tx of transactions) {
    if (!isBankChargeTransaction(tx)) {
      unique.push(tx);
      continue;
    }
    const key = `${tx.date}|${tx.amount}|${normalizeDescriptionKey(tx.description)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(tx);
  }
  return unique;
}

function dedupeDepositLoanConflicts(transactions) {
  const groups = new Map();
  for (const tx of transactions) {
    const key = `${tx.date}|${tx.amount}|${normalizeDescriptionKey(tx.description)}|${tx.member || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  const unique = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      unique.push(group[0]);
      continue;
    }
    const loanRepayment = group.find((tx) => tx.ledgerType === "loan_repayment");
    if (loanRepayment && descriptionImpliesLoanRepayment(loanRepayment.description)) {
      unique.push(loanRepayment);
      continue;
    }
    unique.push(group[0]);
  }
  return dedupeDuplicateBankCharges(unique);
}

function loadMergedBankTransactions({
  xlsxPath,
  csvPath,
  memberNames,
  xlsxOriginalName,
  csvOriginalName,
}) {
  const xlsxTxs = xlsxPath ? parseWorkbookXlsx(xlsxPath, memberNames) : [];
  const csvTxs = csvPath ? parseStatementFile(csvPath, memberNames, csvOriginalName) : [];
  if (!xlsxTxs.length && !csvTxs.length) {
    throw new Error(
      "No transactions found. Upload cooperative-bank-ledger-reference.csv (or the matching .xlsx export)."
    );
  }
  if (!xlsxTxs.length) {
    return dedupeDepositLoanConflicts(
      [...csvTxs].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    );
  }
  if (!csvTxs.length) {
    return xlsxTxs;
  }
  return mergeBankSources(xlsxTxs, csvTxs);
}

module.exports = {
  parseAllDepositsXlsx,
  parseReferenceLedgerXlsx,
  parseWorkbookXlsx,
  parseStatementFile,
  isSpreadsheetFile,
  parseStmtCsv,
  mergeBankSources,
  loadMergedBankTransactions,
  narrativeToLedgerType,
  inferNarrativeFromDescription,
  refineMemberLedgerType,
  descriptionImpliesLoanRepayment,
  resolveLoanDisbursementMember,
  CHECK_LOAN_BORROWERS,
};
