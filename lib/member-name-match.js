const APPLICATION_TO_LEDGER = {
  "Sonia Abraham Udom": "Sonia Udom",
  "Kamoru Adedayo Tolani": "Adedayo Tolani",
  "Omololu Adanri": "Lolu Adanri",
  "Saheed a Salami": "Yomi Salami",
  "Saheed Salami": "Yomi Salami",
  "Awoyinka Daramola": "Yinka Daramola",
  "Akili Tcha Binidi": "Akili Tcha Bindi",
};

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFullName(first, middle, last) {
  return [first, middle, last]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" ");
}

function resolveLedgerMemberName(applicationName, ledgerNames) {
  const trimmed = String(applicationName || "").trim();
  if (!trimmed) return null;

  if (APPLICATION_TO_LEDGER[trimmed]) {
    return APPLICATION_TO_LEDGER[trimmed];
  }

  const normalizedApp = normalizeName(trimmed);
  for (const ledgerName of ledgerNames) {
    if (normalizeName(ledgerName) === normalizedApp) {
      return ledgerName;
    }
  }

  for (const ledgerName of ledgerNames) {
    const parts = normalizeName(ledgerName).split(" ").filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => normalizedApp.includes(p))) {
      return ledgerName;
    }
  }

  for (const [appKey, ledgerName] of Object.entries(APPLICATION_TO_LEDGER)) {
    if (normalizeName(appKey) === normalizedApp) {
      return ledgerName;
    }
  }

  return null;
}

function zelleNameFromApplication(first, middle, last) {
  const parts = [first, middle, last]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return parts.join(" ").toUpperCase();
}

module.exports = {
  APPLICATION_TO_LEDGER,
  buildFullName,
  resolveLedgerMemberName,
  zelleNameFromApplication,
  normalizeName,
};
