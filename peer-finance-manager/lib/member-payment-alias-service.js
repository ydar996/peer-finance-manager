const { getDb } = require("../db/database");
const { resolveLedgerMemberName, normalizeName } = require("./member-name-match");

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

module.exports = {
  ensurePaymentAliasSchema,
  seedDefaultAliasesIfEmpty,
  bankPaymentNamesToPattern,
  listPaymentAliases,
  replacePaymentAliases,
  resolveMemberFromPaymentAliases,
  resolvePaymentAliasMatch,
  ensureAliasDefaultTypes,
  VALID_DEFAULT_LEDGER_TYPES,
  normalizeDefaultLedgerType,
};
