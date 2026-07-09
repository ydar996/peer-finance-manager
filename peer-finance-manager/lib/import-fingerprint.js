/**
 * Stable import fingerprints for deduplication (per bank account).
 */
function normalizeDescriptionPrefix(description) {
  return String(description || "")
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

const { extractReferenceFromRules } = require("./import-rules-service");

function extractReferenceToken(description, explicitReference) {
  return extractReferenceFromRules(description, explicitReference);
}

function ledgerTransactionKey(date, amount, description, explicitReference) {
  const amt = Number(amount).toFixed(2);
  const token = extractReferenceToken(description, explicitReference);
  if (token) return `${date}|${amt}|${token}`;
  return `${date}|${amt}|${normalizeDescriptionPrefix(description)}`;
}

function buildImportFingerprint(bankAccountId, date, amount, description, explicitReference) {
  const accountPart = bankAccountId != null ? String(bankAccountId) : "0";
  return `${accountPart}|${ledgerTransactionKey(date, amount, description, explicitReference)}`;
}

module.exports = {
  extractReferenceToken,
  ledgerTransactionKey,
  buildImportFingerprint,
  normalizeDescriptionPrefix,
};
