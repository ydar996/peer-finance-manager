/**
 * Title Case for member biodata and related display fields.
 * Names: "saheed a salami" → "Saheed A. Salami"
 */

const LOWERCASE_PARTICLES = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "de",
  "da",
  "van",
  "von",
]);

function capitalizeSegment(segment) {
  const raw = String(segment || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (/^[a-z]\.?$/.test(lower)) {
    return `${lower.replace(/\.$/, "").toUpperCase()}.`;
  }
  if (lower.startsWith("mc") && lower.length > 2) {
    return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
  }
  if (lower.startsWith("mac") && lower.length > 3) {
    return `Mac${lower.charAt(3).toUpperCase()}${lower.slice(4)}`;
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function capitalizeToken(token, { isFirst = false, isLast = false } = {}) {
  if (!token) return "";
  if (/^[A-Za-z]\.?$/.test(token)) {
    return capitalizeSegment(token);
  }
  if (token.includes("'")) {
    return token
      .split("'")
      .map((part, index) => (index === 0 ? capitalizeSegment(part) : part.toLowerCase()))
      .join("'");
  }
  if (token.includes("-")) {
    return token.split("-").map((part) => capitalizeSegment(part)).join("-");
  }
  const lower = token.toLowerCase();
  if (!isFirst && !isLast && LOWERCASE_PARTICLES.has(lower)) {
    return lower;
  }
  return capitalizeSegment(token);
}

function capitalizeCooperativeWording(value) {
  if (value == null || value === "") return value;
  return String(value)
    .replace(/\bcooperatives\b(?![-])/g, "Cooperatives")
    .replace(/\bcooperative\b(?![-])/g, "Cooperative");
}

function formatPersonName(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const tokens = trimmed.split(" ").filter(Boolean);
  return tokens
    .map((token, index) =>
      capitalizeToken(token, {
        isFirst: index === 0,
        isLast: index === tokens.length - 1,
      })
    )
    .join(" ");
}

function formatNamePart(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]\.?$/.test(trimmed)) {
    return `${trimmed.replace(/\.$/, "").toUpperCase()}.`;
  }
  return formatPersonName(trimmed);
}

function formatEmail(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed || null;
}

function formatState(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  return formatPersonName(trimmed);
}

function formatCountry(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  return formatPersonName(trimmed);
}

function formatTitleField(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  return trimmed ? formatPersonName(trimmed) : null;
}

function formatAddressLine(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((word) => capitalizeSegment(word))
    .join(" ");
}

function normalizeGender(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (key === "male" || key === "m") return "Male";
  if (key === "female" || key === "f") return "Female";
  if (
    key === "decline to specify" ||
    key === "decline" ||
    key === "prefer not to say" ||
    key === "prefer not to specify"
  ) {
    return "Decline to Specify";
  }
  if (raw === "Male" || raw === "Female" || raw === "Decline to Specify") return raw;
  return formatTitleField(raw);
}

function normalizeProfileFields(fields = {}) {
  const first = formatNamePart(fields.first_name);
  const middle = formatNamePart(fields.middle_name);
  const last = formatNamePart(fields.last_name);
  const display =
    formatPersonName(fields.display_name) ||
    formatPersonName([first, middle, last].filter(Boolean).join(" "));

  return {
    ...fields,
    first_name: first,
    middle_name: middle,
    last_name: last,
    display_name: display,
    gender: normalizeGender(fields.gender),
    address_line1: formatAddressLine(fields.address_line1),
    address_line2: formatAddressLine(fields.address_line2),
    city: formatTitleField(fields.city),
    state: formatState(fields.state),
    country: formatCountry(fields.country),
    next_of_kin_first_name: formatNamePart(fields.next_of_kin_first_name),
    next_of_kin_last_name: formatNamePart(fields.next_of_kin_last_name),
    next_of_kin_relationship: formatTitleField(fields.next_of_kin_relationship),
    signature_name: formatPersonName(fields.signature_name),
    email: formatEmail(fields.email),
    next_of_kin_email: formatEmail(fields.next_of_kin_email),
  };
}

function formatMemberProfileForDisplay(profile) {
  if (!profile) return profile;
  const formatted = normalizeProfileFields(profile);
  return {
    ...profile,
    ...formatted,
    ledger_account_name: formatPersonName(profile.ledger_account_name || profile.name),
  };
}

module.exports = {
  capitalizeCooperativeWording,
  formatPersonName,
  formatNamePart,
  formatEmail,
  formatState,
  formatCountry,
  formatTitleField,
  normalizeGender,
  formatAddressLine,
  normalizeProfileFields,
  formatMemberProfileForDisplay,
};
