const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  getCooperativeSetting,
  setCooperativeSetting,
} = require("./cooperative-settings");

const SETTING_IMPORT_RULES = "import_classification_rules";

const DEFAULT_RULES = {
  referencePatterns: [
    "conf#?\\s*([a-z0-9]+)",
    "check\\s*(\\d+)",
    "MOBILE\\s+\\d{2}/\\d{2}\\s+(\\d+)",
    "ref[:\\s#]+([a-z0-9-]{4,})",
  ],
  contributionKeywords: ["monthly contribution", "savings contribution", "member contribution"],
  loanKeywords: ["loan repayment", "loan payment", "loan payback", "for repayment"],
  withdrawalKeywords: ["zelle payment to", "withdrawal", "atm withdrawal"],
  expenseKeywords: ["monthly fee", "bank fee", "service fee", "maintenance fee"],
};

function parseRulesJson(raw) {
  if (!raw) return { ...DEFAULT_RULES };
  try {
    const parsed = JSON.parse(raw);
    return {
      referencePatterns: Array.isArray(parsed.referencePatterns)
        ? parsed.referencePatterns
        : DEFAULT_RULES.referencePatterns,
      contributionKeywords: Array.isArray(parsed.contributionKeywords)
        ? parsed.contributionKeywords
        : DEFAULT_RULES.contributionKeywords,
      loanKeywords: Array.isArray(parsed.loanKeywords)
        ? parsed.loanKeywords
        : DEFAULT_RULES.loanKeywords,
      withdrawalKeywords: Array.isArray(parsed.withdrawalKeywords)
        ? parsed.withdrawalKeywords
        : DEFAULT_RULES.withdrawalKeywords,
      expenseKeywords: Array.isArray(parsed.expenseKeywords)
        ? parsed.expenseKeywords
        : DEFAULT_RULES.expenseKeywords,
    };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

function getImportRules() {
  const raw = getCooperativeSetting(SETTING_IMPORT_RULES);
  return parseRulesJson(raw);
}

function setImportRules(rules) {
  const { getDb: dbFn } = require("../db/database");
  const db = dbFn();
  ensureSettingsTable(db);
  const normalized = {
    referencePatterns: (rules.referencePatterns || DEFAULT_RULES.referencePatterns).map(String),
    contributionKeywords: (rules.contributionKeywords || DEFAULT_RULES.contributionKeywords).map(
      String
    ),
    loanKeywords: (rules.loanKeywords || DEFAULT_RULES.loanKeywords).map(String),
    withdrawalKeywords: (rules.withdrawalKeywords || DEFAULT_RULES.withdrawalKeywords).map(
      String
    ),
    expenseKeywords: (rules.expenseKeywords || DEFAULT_RULES.expenseKeywords).map(String),
  };
  setCooperativeSetting(db, SETTING_IMPORT_RULES, JSON.stringify(normalized));
  return normalized;
}

function textMatchesKeyword(text, keywords) {
  const lower = String(text || "").toLowerCase();
  return keywords.some((kw) => lower.includes(String(kw).toLowerCase().trim()));
}

function extractReferenceFromRules(description, explicitReference, rules = getImportRules()) {
  const ref = String(explicitReference || "").trim();
  if (ref) return ref.toLowerCase().replace(/\s+/g, "");

  const text = String(description || "");
  for (const pattern of rules.referencePatterns) {
    try {
      const re = new RegExp(pattern, "i");
      const match = text.match(re);
      if (match && match[1]) return String(match[1]).toLowerCase();
    } catch (_) {}
  }
  return null;
}

function classifyDescriptionWithRules(description, rules = getImportRules()) {
  const text = String(description || "");
  if (textMatchesKeyword(text, rules.expenseKeywords)) return "expense";
  if (textMatchesKeyword(text, rules.loanKeywords)) return "loan_repayment";
  if (textMatchesKeyword(text, rules.contributionKeywords)) return "deposit";
  if (textMatchesKeyword(text, rules.withdrawalKeywords)) return "withdrawal";
  return null;
}

module.exports = {
  SETTING_IMPORT_RULES,
  DEFAULT_RULES,
  getImportRules,
  setImportRules,
  extractReferenceFromRules,
  classifyDescriptionWithRules,
  textMatchesKeyword,
};
