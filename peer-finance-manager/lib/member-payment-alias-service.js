const { getDb } = require("../db/database");
const { resolveLedgerMemberName, normalizeName } = require("./member-name-match");

const SEED_ALIASES = [
  { member: "Yomi Salami", pattern: "SAHEED\\s+A?\\s*SALAMI" },
  { member: "Adedayo Tolani", pattern: "KAMORU\\s+TOLANI|ADEDAYO\\s+TOLANI" },
  { member: "Lolu Adanri", pattern: "OMOLOLU\\s+ADANRI" },
  { member: "Yinka Daramola", pattern: "AWOYINKA\\s+DARAMOLA" },
  { member: "Clement Aribisala", pattern: "CLEMENT\\s+O?\\s*ARIBI" },
  { member: "Gbanju Aruwayo-Obe", pattern: "GBANJU\\s+(?:P\\s+)?ARUWAYO" },
  { member: "Oluwatosin Omotuyole", pattern: "OLUWATOSIN\\s+OMOTUYOLE" },
  { member: "Oluwatosin Ogunbowale", pattern: "OLUWATOSIN\\s+OGUNBOWALE" },
  { member: "Ejiro Awhotu", pattern: "EJIRO\\s+AWHOTU" },
  { member: "Noghayin Idele", pattern: "NOGHAYIN\\s+IDELE" },
  { member: "Oluwabiyi Omotuyole", pattern: "OLUWABIYI\\s+OMOTUYOLE" },
  { member: "Mutiu Saliu", pattern: "MUTIU\\s+SALIU" },
  { member: "Kelvin Amede", pattern: "KELVIN\\s+AMEDE" },
  { member: "Titilope Saliu", pattern: "TITILOPE\\s+SALIU" },
  { member: "Olawale George", pattern: "OLAWALE\\s+GEORGE" },
  { member: "Taiwo Embassey", pattern: "TAIWO\\s+EMBASSEY" },
  { member: "Sonia Udom", pattern: "SONIA\\s+(?:ABRAHAM\\s+)?UDOM" },
];

function ensurePaymentAliasSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_payment_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      member_name TEXT NOT NULL,
      alias_pattern TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_payment_aliases_member ON member_payment_aliases(member_id);
  `);
}

function seedDefaultAliasesIfEmpty(db) {
  ensurePaymentAliasSchema(db);
  const count = db.prepare(`SELECT COUNT(*) AS c FROM member_payment_aliases`).get().c;
  if (count > 0) return;

  const members = db.prepare(`SELECT id, name FROM members`).all();
  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));
  const insert = db.prepare(
    `INSERT INTO member_payment_aliases (member_id, member_name, alias_pattern) VALUES (?, ?, ?)`
  );
  for (const row of SEED_ALIASES) {
    const memberId = nameToId[row.member] || null;
    insert.run(memberId, row.member, row.pattern);
  }
}

function listPaymentAliases() {
  const db = getDb();
  seedDefaultAliasesIfEmpty(db);
  return db
    .prepare(
      `SELECT id, member_id AS memberId, member_name AS memberName, alias_pattern AS aliasPattern
       FROM member_payment_aliases ORDER BY member_name, id`
    )
    .all();
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
      `INSERT INTO member_payment_aliases (member_id, member_name, alias_pattern) VALUES (?, ?, ?)`
    );
    for (const entry of entries) {
      const memberName = String(entry.memberName || "").trim();
      const pattern = String(entry.aliasPattern || "").trim();
      if (!memberName || !pattern) continue;
      const resolved =
        resolveLedgerMemberName(memberName, memberNames) ||
        (memberNames.includes(memberName) ? memberName : memberName);
      insert.run(nameToId[resolved] || null, resolved, pattern);
    }
  });
  run();
  return listPaymentAliases();
}

function resolveMemberFromPaymentAliases(text, memberNames) {
  const db = getDb();
  seedDefaultAliasesIfEmpty(db);
  const aliases = db
    .prepare(`SELECT member_name AS memberName, alias_pattern AS aliasPattern FROM member_payment_aliases`)
    .all();
  const hay = String(text || "");
  for (const row of aliases) {
    try {
      const re = new RegExp(row.aliasPattern, "i");
      if (!re.test(hay)) continue;
      const resolved = resolveLedgerMemberName(row.memberName, memberNames) || row.memberName;
      if (memberNames.includes(resolved)) return resolved;
      const parts = normalizeName(resolved).split(" ").filter(Boolean);
      if (parts.length >= 2 && parts.every((p) => normalizeName(hay).includes(p))) {
        return resolved;
      }
    } catch (_) {}
  }
  return null;
}

module.exports = {
  ensurePaymentAliasSchema,
  seedDefaultAliasesIfEmpty,
  listPaymentAliases,
  replacePaymentAliases,
  resolveMemberFromPaymentAliases,
};
