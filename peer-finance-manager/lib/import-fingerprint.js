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

function extractReferenceToken(description, explicitReference) {
  const ref = String(explicitReference || "").trim();
  if (ref) return ref.toLowerCase().replace(/\s+/g, "");

  const text = String(description || "");
  const conf = text.match(/conf#?\s*([a-z0-9]+)/i);
  if (conf) return conf[1].toLowerCase();

  const check = text.match(/check\s*(\d+)/i);
  if (check) return `check${check[1]}`;

  const mobile = text.match(/MOBILE\s+\d{2}\/\d{2}\s+(\d+)/i);
  if (mobile) return `mobile${mobile[1]}`;

  return null;
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
