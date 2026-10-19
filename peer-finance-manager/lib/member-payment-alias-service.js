const { getDb } = require("../db/database");
const {
  resolveLedgerMemberName,
  normalizeName,
  extractBankPayerName,
  buildFullName,
} = require("./member-name-match");

const SEED_ALIASES = [
  {
    member: "Yomi Salami",
    bankPaymentNames: "SAHEED SALAMI",
    pattern: "SAHEED\\s+A?\\s*SALAMI",
    defaultLedgerType: "loan_repayment",
  },
  {
    member: "Adedayo Tolani",
    bankPaymentNames: "KAMORU TOLANI, ADEDAYO TOLANI",
    pattern: "KAMORU\\s+TOLANI|ADEDAYO\\s+TOLANI",
  },
  { member: "Lolu Adanri", bankPaymentNames: "OMOLOLU ADANRI", pattern: "OMOLOLU\\s+ADANRI" },
  { member: "Yinka Daramola", bankPaymentNames: "AWOYINKA DARAMOLA", pattern: "AWOYINKA\\s+DARAMOLA" },
  { member: "Clement Aribisala", bankPaymentNames: "CLEMENT ARIBI", pattern: "CLEMENT\\s+O?\\s*ARIBI" },
  { member: "Gbanju Aruwayo-Obe", bankPaymentNames: "GBANJU ARUWAYO", pattern: "GBANJU\\s+(?:P\\s+)?ARUWAYO" },
  { member: "Oluwatosin Omotuyole", bankPaymentNames: "OLUWATOSIN OMOTUYOLE", pattern: "OLUWATOSIN\\s+OMOTUYOLE" },
  { member: "Oluwatosin Ogunbowale", bankPaymentNames: "OLUWATOSIN OGUNBOWALE", pattern: "OLUWATOSIN\\s+OGUNBOWALE" },
  { member: "Ejiro Awhotu", bankPaymentNames: "EJIRO AWHOTU", pattern: "EJIRO\\s+AWHOTU" },
  { member: "Noghayin Idele", bankPaymentNames: "NOGHAYIN IDELE", pattern: "NOGHAYIN\\s+IDELE" },
  { member: "Oluwabiyi Omotuyole", bankPaymentNames: "OLUWABIYI OMOTUYOLE", pattern: "OLUWABIYI\\s+OMOTUYOLE" },
  { member: "Mutiu Saliu", bankPaymentNames: "MUTIU SALIU", pattern: "MUTIU\\s+SALIU" },
  { member: "Kelvin Amede", bankPaymentNames: "KELVIN AMEDE", pattern: "KELVIN\\s+AMEDE" },
  { member: "Titilope Saliu", bankPaymentNames: "TITILOPE SALIU", pattern: "TITILOPE\\s+SALIU" },
  { member: "Olawale George", bankPaymentNames: "OLAWALE GEORGE", pattern: "OLAWALE\\s+GEORGE" },
  { member: "Taiwo Embassey", bankPaymentNames: "TAIWO EMBASSEY", pattern: "TAIWO\\s+EMBASSEY" },
  { member: "Sonia Udom", bankPaymentNames: "SONIA UDOM", pattern: "SONIA\\s+(?:ABRAHAM\\s+)?UDOM" },
];

function escapeRegexToken(token) {
  return String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turn plain bank names (comma-separated) into a flexible match pattern. */
function bankPaymentNamesToPattern(bankPaymentNames) {
  const names = String(bankPaymentNames || "")
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) return "";
  const parts = names.map((name) => {
    const tokens = name.split(/\s+/).filter(Boolean);
    return tokens.map(escapeRegexToken).join("\\s+");
  });
  return parts.join("|");
}

function seedDisplayNameForMember(memberName) {
  const row = SEED_ALIASES.find((s) => s.member === memberName);
  return row?.bankPaymentNames || "";
}

function ensurePaymentAliasSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_payment_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      member_name TEXT NOT NULL,
      bank_payment_names TEXT,
      alias_pattern TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_payment_aliases_member ON member_payment_aliases(member_id);
  `);
  const cols = db.prepare(`PRAGMA table_info(member_payment_aliases)`).all().map((c) => c.name);
  if (!cols.includes("bank_payment_names")) {
    db.exec(`ALTER TABLE member_payment_aliases ADD COLUMN bank_payment_names TEXT`);
  }
  if (!cols.includes("default_ledger_type")) {
    db.exec(`ALTER TABLE member_payment_aliases ADD COLUMN default_ledger_type TEXT`);
  }
}

function ensureAliasDefaultTypes(db) {
  ensurePaymentAliasSchema(db);
  for (const row of SEED_ALIASES) {
    if (!row.defaultLedgerType) continue;
    db.prepare(
      `UPDATE member_payment_aliases
       SET default_ledger_type = ?
       WHERE member_name = ? AND (default_ledger_type IS NULL OR default_ledger_type = '')`
    ).run(row.defaultLedgerType, row.member);
  }
}

function seedDefaultAliasesIfEmpty(db) {
  ensurePaymentAliasSchema(db);
  const count = db.prepare(`SELECT COUNT(*) AS c FROM member_payment_aliases`).get().c;
  if (count === 0) {
    const members = db.prepare(`SELECT id, name FROM members`).all();
    const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));
    const insert = db.prepare(
      `INSERT INTO member_payment_aliases
        (member_id, member_name, bank_payment_names, alias_pattern, default_ledger_type)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const row of SEED_ALIASES) {
      const memberId = nameToId[row.member] || null;
      insert.run(
        memberId,
        row.member,
        row.bankPaymentNames,
        row.pattern,
        row.defaultLedgerType || null
      );
    }
  }
  ensureAliasDefaultTypes(db);
}

const VALID_DEFAULT_LEDGER_TYPES = new Set([
  "deposit",
  "withdrawal",
  "loan_repayment",
  "loan_disbursement",
  "distribution",
  "expense",
  "cd_purchase",
  "cd_liquidation",
  "investment",
]);

function normalizeDefaultLedgerType(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return null;
  return VALID_DEFAULT_LEDGER_TYPES.has(key) ? key : null;
}

function mapPaymentAliasRow(row) {
  if (!row) return null;
  const bankPaymentNames =
    String(row.bankPaymentNames || "").trim() || seedDisplayNameForMember(row.memberName);
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.memberName,
    bankPaymentNames,
    defaultLedgerType: normalizeDefaultLedgerType(row.defaultLedgerType) || null,
  };
}

function listPaymentAliases() {
  const db = getDb();
  seedDefaultAliasesIfEmpty(db);
  return db
    .prepare(
      `SELECT id, member_id AS memberId, member_name AS memberName,
              bank_payment_names AS bankPaymentNames, alias_pattern AS aliasPattern,
              default_ledger_type AS defaultLedgerType
       FROM member_payment_aliases ORDER BY member_name, id`
    )
    .all()
    .map(mapPaymentAliasRow);
}

function replacePaymentAliases(entries) {
  const db = getDb();
  ensurePaymentAliasSchema(db);
  const members = db.prepare(`SELECT id, name FROM members`).all();
  const memberNames = members.map((m) => m.name);
  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));

  const run = db.transaction(() => {
    db.prepare(`DELETE FROM member_payment_aliases`).run();
    const insert = db.prepare(
      `INSERT INTO member_payment_aliases
        (member_id, member_name, bank_payment_names, alias_pattern, default_ledger_type)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const entry of entries) {
      const memberName = String(entry.memberName || "").trim();
      const bankPaymentNames = String(entry.bankPaymentNames || entry.bankPaymentName || "").trim();
      let pattern = bankPaymentNames ? bankPaymentNamesToPattern(bankPaymentNames) : "";
      if (!pattern && entry.aliasPattern) {
        pattern = String(entry.aliasPattern).trim();
      }
      if (!memberName || !pattern) continue;
      const resolved =
        resolveLedgerMemberName(memberName, memberNames) ||
        (memberNames.includes(memberName) ? memberName : memberName);
      insert.run(
        nameToId[resolved] || null,
        resolved,
        bankPaymentNames || seedDisplayNameForMember(resolved) || null,
        pattern,
        normalizeDefaultLedgerType(entry.defaultLedgerType)
      );
    }
  });
  run();
  return listPaymentAliases();
}

function resolvePaymentAliasMatch(text, memberNames) {
  const db = getDb();
  seedDefaultAliasesIfEmpty(db);
  ensureAliasDefaultTypes(db);
  const aliases = db
    .prepare(
      `SELECT member_name AS memberName, alias_pattern AS aliasPattern,
              default_ledger_type AS defaultLedgerType
       FROM member_payment_aliases`
    )
    .all();
  const hay = String(text || "");
  for (const row of aliases) {
    try {
      const re = new RegExp(row.aliasPattern, "i");
      if (!re.test(hay)) continue;
      const resolved = resolveLedgerMemberName(row.memberName, memberNames) || row.memberName;
      if (memberNames.includes(resolved)) {
        return { member: resolved, defaultLedgerType: row.defaultLedgerType || null };
      }
      const parts = normalizeName(resolved).split(" ").filter(Boolean);
      if (parts.length >= 2 && parts.every((p) => normalizeName(hay).includes(p))) {
        return { member: resolved, defaultLedgerType: row.defaultLedgerType || null };
      }
    } catch (_) {}
  }
  return null;
}

function resolveMemberFromPaymentAliases(text, memberNames) {
  const match = resolvePaymentAliasMatch(text, memberNames);
  return match?.member || null;
}

function aliasAlreadyCoversName(memberName, bankPaymentName) {
  const db = getDb();
  ensurePaymentAliasSchema(db);
  const hay = String(bankPaymentName || "").trim();
  if (!hay) return false;
  const rows = db
    .prepare(
      `SELECT alias_pattern AS aliasPattern FROM member_payment_aliases WHERE member_name = ?`
    )
    .all(memberName);
  for (const row of rows) {
    try {
      if (new RegExp(row.aliasPattern, "i").test(hay)) return true;
    } catch (_) {}
  }
  return false;
}

function upsertPaymentAliasForMember(memberId, memberName, bankPaymentName, defaultLedgerType = null) {
  const name = String(bankPaymentName || "").trim();
  const ledgerName = String(memberName || "").trim();
  if (!name || !ledgerName) return { created: false, reason: "missing_name" };
  const db = getDb();
  ensurePaymentAliasSchema(db);
  if (aliasAlreadyCoversName(ledgerName, name)) {
    return { created: false, reason: "already_covered" };
  }
  const pattern = bankPaymentNamesToPattern(name);
  if (!pattern) return { created: false, reason: "no_pattern" };
  const member =
    (Number(memberId) > 0
      ? db.prepare(`SELECT id, name FROM members WHERE id = ?`).get(Number(memberId))
      : null) || db.prepare(`SELECT id, name FROM members WHERE name = ?`).get(ledgerName);
  db.prepare(
    `INSERT INTO member_payment_aliases
      (member_id, member_name, bank_payment_names, alias_pattern, default_ledger_type)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    member?.id || Number(memberId) || null,
    member?.name || ledgerName,
    name,
    pattern,
    normalizeDefaultLedgerType(defaultLedgerType)
  );
  return { created: true, memberName: member?.name || ledgerName, bankPaymentName: name };
}

function learnPaymentAliasFromDescription(memberId, memberName, description) {
  const payer = extractBankPayerName(description);
  if (!payer) return { created: false, reason: "no_payer" };
  return upsertPaymentAliasForMember(memberId, memberName, payer);
}

function seedPaymentAliasesForMember(memberId) {
  const id = Number(memberId);
  if (!Number.isInteger(id) || id <= 0) return { created: 0 };
  const db = getDb();
  const member = db.prepare(`SELECT id, name FROM members WHERE id = ?`).get(id);
  if (!member) return { created: 0 };
  const profile = db
    .prepare(
      `SELECT first_name AS firstName, middle_name AS middleName, last_name AS lastName,
              zelle_bank_name AS zelleBankName, display_name AS displayName
       FROM member_profiles WHERE member_id = ?`
    )
    .get(id);
  const names = [
    member.name,
    profile?.displayName,
    profile?.zelleBankName,
    buildFullName(profile?.firstName, profile?.middleName, profile?.lastName),
    buildFullName(profile?.firstName, null, profile?.lastName),
  ];
  let created = 0;
  const seen = new Set();
  for (const raw of names) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const result = upsertPaymentAliasForMember(id, member.name, name);
    if (result.created) created += 1;
  }
  return { created };
}

function backfillPaymentAliasesFromDeposits() {
  const db = getDb();
  ensurePaymentAliasSchema(db);
  const rows = db
    .prepare(
      `SELECT t.member_id AS memberId, m.name AS memberName, t.description
       FROM transactions t
       INNER JOIN members m ON m.id = t.member_id
       WHERE t.type = 'deposit' AND t.description IS NOT NULL AND t.description != ''`
    )
    .all();
  let created = 0;
  for (const row of rows) {
    const result = learnPaymentAliasFromDescription(row.memberId, row.memberName, row.description);
    if (result.created) created += 1;
  }
  const members = db.prepare(`SELECT id FROM members`).all();
  for (const row of members) {
    const seeded = seedPaymentAliasesForMember(row.id);
    created += seeded.created || 0;
  }
  return { scanned: rows.length, created };
}

module.exports = {
  ensurePaymentAliasSchema,
  seedDefaultAliasesIfEmpty,
  bankPaymentNamesToPattern,
  listPaymentAliases,
  replacePaymentAliases,
  resolveMemberFromPaymentAliases,
  resolvePaymentAliasMatch,
  upsertPaymentAliasForMember,
  learnPaymentAliasFromDescription,
  seedPaymentAliasesForMember,
  backfillPaymentAliasesFromDeposits,
  ensureAliasDefaultTypes,
  VALID_DEFAULT_LEDGER_TYPES,
  normalizeDefaultLedgerType,
};
