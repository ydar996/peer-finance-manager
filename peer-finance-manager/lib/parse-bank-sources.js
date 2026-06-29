const path = require("path");
const XLSX = require("xlsx");
const { getCoopRoot, getAppRoot, isPackaged } = require("./paths");
const parserRoot = isPackaged() ? getAppRoot() : getCoopRoot();
const {
  parseBankStatementCsv,
  resolveMember,
  NARRATIVE,
} = require(path.join(parserRoot, "lib", "bank-statement-parser"));
const { resolveLedgerMemberName } = require("./member-name-match");

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
    /\bfor repayment\b/.test(d)
  );
}

function inferNarrativeFromDescription(description, narrative) {
  const d = String(description || "").toLowerCase();
  if (descriptionImpliesLoanRepayment(description)) {
    return NARRATIVE.LOAN_REPAYMENT;
  }
  if (d.includes("loan disbursement") || /^check 11\d{2}$/i.test(String(description || "").trim())) {
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

function resolveMemberName(rawName, description, memberNames) {
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
  const wb = XLSX.readFile(filePath, { bookSheets: true });
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
    const member = resolveMemberName(memberRef, description, memberNames);

    parsed.push({
      source: "reference_ledger",
      date,
      description,
      amount,
      transactionType: narrative || ledgerType,
      ledgerType,
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

function parseStatementFile(filePath, memberNames) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
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
    return {
      source: "stmt_csv",
      date: tx.date.iso,
      description: tx.description,
      amount: tx.amount,
      transactionType: narrative,
      ledgerType,
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
    if (!existing || priority >= existing.priority) {
      map.set(key, { ...tx, priority });
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
  return unique;
}

function loadMergedBankTransactions({ xlsxPath, csvPath, memberNames }) {
  const xlsxTxs = xlsxPath ? parseWorkbookXlsx(xlsxPath, memberNames) : [];
  const csvTxs = csvPath ? parseStatementFile(csvPath, memberNames) : [];
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
  parseStmtCsv,
  mergeBankSources,
  loadMergedBankTransactions,
  narrativeToLedgerType,
};
