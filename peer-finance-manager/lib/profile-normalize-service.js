const { normalizeProfileFields, formatPersonName } = require("./text-format");

const PROFILE_COLUMNS = [
  "first_name",
  "middle_name",
  "last_name",
  "display_name",
  "gender",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "country",
  "next_of_kin_first_name",
  "next_of_kin_last_name",
  "next_of_kin_relationship",
  "signature_name",
  "email",
  "next_of_kin_email",
];

function profileChanges(before, after) {
  const changes = {};
  for (const col of PROFILE_COLUMNS) {
    const from = before[col] ?? null;
    const to = after[col] ?? null;
    if (from !== to) changes[col] = { from, to };
  }
  return changes;
}

function normalizeAllProfiles(db, { apply = false } = {}) {
  const profiles = db
    .prepare(
      `SELECT p.*, m.name AS ledger_name
       FROM member_profiles p
       JOIN members m ON m.id = p.member_id
       ORDER BY m.name`
    )
    .all();

  let profileUpdateCount = 0;
  let memberNameUpdateCount = 0;
  const skippedNames = [];
  const preview = [];

  for (const row of profiles) {
    const normalized = normalizeProfileFields(row);
    const changes = profileChanges(row, normalized);
    const formattedLedgerName = formatPersonName(row.ledger_name);
    const ledgerWouldChange =
      formattedLedgerName && formattedLedgerName !== row.ledger_name;

    if (!Object.keys(changes).length && !ledgerWouldChange) continue;

    preview.push({
      memberId: row.member_id,
      ledgerName: row.ledger_name,
      profileChanges: changes,
      ledgerNameChange: ledgerWouldChange
        ? { from: row.ledger_name, to: formattedLedgerName }
        : null,
    });

    if (!apply) continue;

    if (Object.keys(changes).length) {
      const sets = Object.keys(changes)
        .map((col) => `${col} = @${col}`)
        .join(", ");
      const params = { member_id: row.member_id };
      for (const col of Object.keys(changes)) params[col] = normalized[col];
      db.prepare(
        `UPDATE member_profiles SET ${sets}, updated_at = datetime('now') WHERE member_id = @member_id`
      ).run(params);
      profileUpdateCount += 1;
    }

    if (ledgerWouldChange) {
      const clash = db
        .prepare(`SELECT id FROM members WHERE name = ? AND id != ?`)
        .get(formattedLedgerName, row.member_id);
      if (clash) {
        skippedNames.push({
          memberId: row.member_id,
          name: row.ledger_name,
          target: formattedLedgerName,
        });
      } else {
        db.prepare(`UPDATE members SET name = ? WHERE id = ?`).run(
          formattedLedgerName,
          row.member_id
        );
        memberNameUpdateCount += 1;
      }
    }
  }

  return {
    dryRun: !apply,
    scanned: profiles.length,
    wouldChange: preview.length,
    profileUpdates: profileUpdateCount,
    memberNameUpdates: memberNameUpdateCount,
    skippedNames,
    preview: apply ? preview.slice(0, 20) : preview,
  };
}

module.exports = {
  PROFILE_COLUMNS,
  profileChanges,
  normalizeAllProfiles,
};
