const fs = require("fs");

const NARRATIVE = {
  MEMBER_DEPOSIT: "Member Deposit",
  MEMBER_WITHDRAWAL: "Member Withdrawal",
  LOAN_REPAYMENT: "Loan Repayment",
  LOAN_DISBURSEMENT: "Loan Disbursement",
};

const MEMBER_BANK_ALIASES = [
  { member: "Yomi Salami", patterns: [/SAHEED\s+A?\s*SALAMI/i] },
  { member: "Adedayo Tolani", patterns: [/KAMORU\s+TOLANI/i, /ADEDAYO\s+TOLANI/i] },
  { member: "Lolu Adanri", patterns: [/OMOLOLU\s+ADANRI/i] },
  { member: "Yinka Daramola", patterns: [/AWOYINKA\s+DARAMOLA/i] },
  { member: "Clement Aribisala", patterns: [/CLEMENT\s+O?\s*ARIBI/i] },
  { member: "Gbanju Aruwayo-Obe", patterns: [/GBANJU\s+(?:P\s+)?ARUWAYO/i] },
  { member: "Oluwatosin Omotuyole", patterns: [/OLUWATOSIN\s+OMOTUYOLE/i] },
  { member: "Oluwatosin Ogunbowale", patterns: [/OLUWATOSIN\s+OGUNBOWALE/i] },
  { member: "Ejiro Awhotu", patterns: [/EJIRO\s+AWHOTU/i] },
  { member: "Noghayin Idele", patterns: [/NOGHAYIN\s+IDELE/i] },
  { member: "Oluwabiyi Omotuyole", patterns: [/OLUWABIYI\s+OMOTUYOLE/i] },
  { member: "Mutiu Saliu", patterns: [/MUTIU\s+SALIU/i] },
  { member: "Kelvin Amede", patterns: [/KELVIN\s+AMEDE/i] },
  { member: "Titilope Saliu", patterns: [/TITILOPE\s+SALIU/i] },
  { member: "Olawale George", patterns: [/OLAWALE\s+GEORGE/i] },
  { member: "Taiwo Embassey", patterns: [/TAIWO\s+EMBASSEY/i] },
  { member: "Sonia Udom", patterns: [/SONIA\s+(ABRAHAM\s+)?UDOM/i] },
];

function parseAmount(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

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

function parseDate(value) {
  const m = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  return {
    year,
    month,
    day,
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function matchMemberName(rawName, memberNames) {
  const trimmed = String(rawName || "").replace(/['"]/g, "").trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  for (const name of memberNames) {
    const parts = name.toUpperCase().split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => upper.includes(p))) {
      return name;
    }
    if (upper.includes(name.toUpperCase())) {
      return name;
    }
  }

  for (const alias of MEMBER_BANK_ALIASES) {
    if (alias.patterns.some((p) => p.test(trimmed))) {
      return alias.member;
    }
  }

  return null;
}

function resolveLoanRepaymentBorrower(description, memberNames) {
  const text = String(description || "");
  const patterns = [
    /\bfor\s+(.+?)\s+loan\s+repayment\b/i,
    /\bfor\s+(.+?)\s+loan\s+payment\b/i,
    /\bfor\s+(.+?)\s+cooperative\s+loan\b/i,
    /\bfor\s+(.+?)\s+loan\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const borrower = matchMemberName(match[1], memberNames);
    if (borrower) return borrower;
  }

  return null;
}

function resolveMember(description, memberNames) {
  const text = String(description || "");
  const loanBorrower = resolveLoanRepaymentBorrower(text, memberNames);
  if (loanBorrower) return loanBorrower;

  for (const alias of MEMBER_BANK_ALIASES) {
    if (alias.patterns.some((p) => p.test(text))) {
      return alias.member;
    }
  }
  return matchMemberName(text, memberNames);
}

function parseBankStatementCsv(filePath, memberNames = []) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  let headerIndex = lines.findIndex((l) => /^Date,Description/i.test(l));
  if (headerIndex < 0) {
    throw new Error("Could not find transaction header row in bank CSV");
  }

  const transactions = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 4) continue;
    const [dateStr, description, amountStr, , narrative] = cols;
    const date = parseDate(dateStr);
    const amount = parseAmount(amountStr);
    if (!date || amount == null) continue;

    const entry = {
      date,
      description,
      amount,
      narrative: (narrative || "").trim(),
      member: resolveMember(description, memberNames),
    };
    transactions.push(entry);
  }
  return transactions;
}

function aggregateMemberActivity(transactions, year, month, narrative) {
  const totals = {};
  const details = {};
  for (const tx of transactions) {
    if (tx.date.year !== year || tx.date.month !== month) continue;
    if (tx.narrative !== narrative) continue;
    if (!tx.member) continue;
    totals[tx.member] = (totals[tx.member] || 0) + tx.amount;
    if (!details[tx.member]) details[tx.member] = [];
    details[tx.member].push(tx);
  }
  return { totals, details };
}

module.exports = {
  NARRATIVE,
  parseBankStatementCsv,
  aggregateMemberActivity,
  resolveMember,
  resolveLoanRepaymentBorrower,
  matchMemberName,
};
