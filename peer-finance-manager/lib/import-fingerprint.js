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

// Stored expense rows are written as "Category: <narration>" (see
// expenseCategory in bank-import-append.js). Strip that label so imported
// rows keyed on raw narration still match the stored row.
const CATEGORY_PREFIX = /^(?:Bank Fees|Meeting\/Event|Administrative|Other):\s*/i;

function stripCategoryPrefix(description) {
  return String(description || "").replace(CATEGORY_PREFIX, "");
}

// Banks can narrate the same posting differently across export formats (e.g.
// "COMMISSION 220696" vs "STAMP DUTY 220696") while keeping the same document
// number in the text. Any run of 5+ digits is treated as a shared-reference
// candidate; 4-digit runs are excluded so calendar years can't collide.
function extractDigitTokens(description) {
  const matches = String(description || "").match(/\d{5,}/g);
  return matches ? matches.slice(0, 4) : [];
}

// Fallback similarity key space for narration drift (same bank posting
// rendered differently by different statement exports). Used only alongside
// same-date + same-|amount| matching, never alone.
function descriptionTokenSet(description) {
  const stripped = stripCategoryPrefix(description).toLowerCase();
  const tokens = stripped.match(/[a-z0-9]{3,}/g);
  return new Set(tokens || []);
}

function tokenOverlapScore(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

// All candidate dedupe keys for a row: the description-prefix key, the
// category-stripped description key, and the reference-token key when a
// reference exists. Incoming rows carrying a DOC-NUM/reference key on ref;
// stored rows keyed without a reference column key on description. Checking
// all variants prevents cross-format and re-upload duplicates.
function ledgerTransactionKeyVariants(date, amount, description, explicitReference) {
  const amt = Number(amount).toFixed(2);
  const absAmt = Math.abs(Number(amount)).toFixed(2);
  const variants = new Set([
    `${date}|${amt}|${normalizeDescriptionPrefix(description)}`,
  ]);
  const stripped = stripCategoryPrefix(description);
  if (stripped !== String(description || "")) {
    variants.add(`${date}|${amt}|${normalizeDescriptionPrefix(stripped)}`);
  }
  // Sign-flipped pairs (e.g. a reversal credit stored as a negative expense)
  // only match on an absolute-amount variant; reversal narrations differ from
  // the original charge's, so same-date/amount/desc collisions are not expected.
  if (absAmt !== amt) {
    variants.add(`${date}|${absAmt}|${normalizeDescriptionPrefix(description)}`);
    if (stripped !== String(description || "")) {
      variants.add(`${date}|${absAmt}|${normalizeDescriptionPrefix(stripped)}`);
    }
  }
  const token = extractReferenceToken(description, explicitReference);
  if (token) variants.add(`${date}|${amt}|${token}`);
  for (const digits of extractDigitTokens(description)) {
    variants.add(`${date}|${absAmt}|num:${digits}`);
  }
  return [...variants];
}

function buildImportFingerprintVariants(bankAccountId, date, amount, description, explicitReference) {
  const accountPart = bankAccountId != null ? String(bankAccountId) : "0";
  return ledgerTransactionKeyVariants(date, amount, description, explicitReference).map(
    (k) => `${accountPart}|${k}`
  );
}

module.exports = {
  extractReferenceToken,
  ledgerTransactionKey,
  ledgerTransactionKeyVariants,
  buildImportFingerprint,
  buildImportFingerprintVariants,
  normalizeDescriptionPrefix,
  stripCategoryPrefix,
  descriptionTokenSet,
  tokenOverlapScore,
};
