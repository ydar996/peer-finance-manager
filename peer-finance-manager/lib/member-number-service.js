const { getOrgSlug } = require("./org-context");
const { getCooperativeSetting } = require("./cooperative-settings");

const DEFAULT_PREFIX_BY_SLUG = {
  assurance: "AIC",
};

function getMemberNumberPrefix() {
  const custom = getCooperativeSetting("member_number_prefix");
  if (custom?.trim()) return custom.trim().toUpperCase();
  const slug = getOrgSlug();
  return DEFAULT_PREFIX_BY_SLUG[slug] || String(slug || "M").slice(0, 3).toUpperCase();
}

function parseMemberNumberSequence(memberNumber) {
  const match = String(memberNumber || "").trim().match(/-(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

function formatMemberNumber(prefix, sequence) {
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

function getMaxMemberSequence(db, prefix) {
  const rows = db
    .prepare(`SELECT member_number FROM members WHERE member_number LIKE ?`)
    .all(`${prefix}-%`);
  let maxSeq = 0;
  for (const row of rows) {
    maxSeq = Math.max(maxSeq, parseMemberNumberSequence(row.member_number));
  }
  return maxSeq;
}

function splitMemberNumber(memberNumber) {
  const match = String(memberNumber || "")
    .trim()
    .match(/^([A-Za-z]+[-_]?)?(\d+)$/);
  if (!match) return null;
  return { prefix: match[1] || "", digits: match[2], value: parseInt(match[2], 10) };
}

function nextMemberNumber(db) {
  const custom = getCooperativeSetting("member_number_prefix");
  if (custom?.trim()) {
    const prefix = custom.trim().toUpperCase();
    return formatMemberNumber(prefix, getMaxMemberSequence(db, prefix) + 1);
  }
  const rows = db
    .prepare(
      `SELECT member_number FROM members
       WHERE member_number IS NOT NULL AND TRIM(member_number) <> ''`
    )
    .all();
  const groups = new Map();
  for (const row of rows) {
    const parsed = splitMemberNumber(row.member_number);
    if (!parsed) continue;
    const group = groups.get(parsed.prefix) || { count: 0, max: 0, width: 3 };
    group.count += 1;
    if (parsed.value >= group.max) {
      group.max = parsed.value;
      group.width = parsed.digits.length;
    }
    groups.set(parsed.prefix, group);
  }
  if (groups.size) {
    const [prefix, group] = [...groups.entries()].sort(
      (a, b) => b[1].count - a[1].count
    )[0];
    const next = group.max + 1;
    const width = Math.max(group.width, String(next).length, 3);
    return `${prefix}${String(next).padStart(width, "0")}`;
  }
  return formatMemberNumber(getMemberNumberPrefix(), 1);
}

function ensureMemberNumber(db, memberId) {
  const row = db.prepare(`SELECT member_number FROM members WHERE id = ?`).get(memberId);
  if (!row) throw new Error("Member not found");
  if (row.member_number) return row.member_number;

  const memberNumber = nextMemberNumber(db);
  db.prepare(`UPDATE members SET member_number = ? WHERE id = ?`).run(memberNumber, memberId);
  return memberNumber;
}

function backfillMemberNumbers(db) {
  const missing = db
    .prepare(
      `SELECT id FROM members
       WHERE member_number IS NULL OR TRIM(member_number) = ''
       ORDER BY COALESCE(joined_at, created_at), id`
    )
    .all();
  if (!missing.length) return 0;

  const update = db.prepare(`UPDATE members SET member_number = ? WHERE id = ?`);
  db.transaction(() => {
    for (const row of missing) {
      update.run(nextMemberNumber(db), row.id);
    }
  })();
  return missing.length;
}

module.exports = {
  getMemberNumberPrefix,
  formatMemberNumber,
  ensureMemberNumber,
  backfillMemberNumbers,
};
