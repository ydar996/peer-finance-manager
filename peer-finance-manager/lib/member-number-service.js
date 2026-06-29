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

function ensureMemberNumber(db, memberId) {
  const row = db.prepare(`SELECT member_number FROM members WHERE id = ?`).get(memberId);
  if (!row) throw new Error("Member not found");
  if (row.member_number) return row.member_number;

  const prefix = getMemberNumberPrefix();
  const nextSeq = getMaxMemberSequence(db, prefix) + 1;
  const memberNumber = formatMemberNumber(prefix, nextSeq);
  db.prepare(`UPDATE members SET member_number = ? WHERE id = ?`).run(memberNumber, memberId);
  return memberNumber;
}

function backfillMemberNumbers(db) {
  const prefix = getMemberNumberPrefix();
  const missing = db
    .prepare(
      `SELECT id FROM members
       WHERE member_number IS NULL OR TRIM(member_number) = ''
       ORDER BY COALESCE(joined_at, created_at), id`
    )
    .all();
  if (!missing.length) return 0;

  let nextSeq = getMaxMemberSequence(db, prefix) + 1;
  const update = db.prepare(`UPDATE members SET member_number = ? WHERE id = ?`);
  db.transaction(() => {
    for (const row of missing) {
      update.run(formatMemberNumber(prefix, nextSeq), row.id);
      nextSeq += 1;
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
