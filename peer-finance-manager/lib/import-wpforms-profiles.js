const fs = require("fs");
const path = require("path");
const { getDb } = require("../db/database");
const {
  buildFullName,
  resolveLedgerMemberName,
  zelleNameFromApplication,
} = require("./member-name-match");
const { normalizeProfileFields } = require("./text-format");

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function parseWpformsCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (!cols.length || !cols[0]) continue;
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function cleanPhone(value) {
  const s = String(value || "").replace(/^'/, "").trim();
  return s || null;
}

function parseUsDate(value) {
  const m = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const month = String(m[1]).padStart(2, "0");
  const day = String(m[2]).padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

function parseSignedAt(value) {
  const m = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return parseUsDate(value);
  const month = String(m[1]).padStart(2, "0");
  const day = String(m[2]).padStart(2, "0");
  const hour = String(m[4]).padStart(2, "0");
  const minute = m[5];
  return `${m[3]}-${month}-${day}T${hour}:${minute}:00`;
}

function rowToProfileFields(row) {
  const first = row["First Name"]?.trim() || null;
  const middle = row["Middle Name"]?.trim() || null;
  const last = row["Last Name"]?.trim() || null;
  const applicationName = buildFullName(first, middle, last);

  const fields = normalizeProfileFields({
    first_name: first,
    middle_name: middle,
    last_name: last,
    display_name: applicationName,
    gender: row.Gender?.trim() || null,
    date_of_birth: parseUsDate(row["Date of Birth"]),
    email: row.Email?.trim() || null,
    phone: cleanPhone(row.Phone),
    address_line1: row["Current Address: Address Line 1"]?.trim() || null,
    address_line2: row["Current Address: Address Line 2"]?.trim() || null,
    city: row["Current Address: City"]?.trim() || null,
    state: row["Current Address: State"]?.trim() || null,
    postal_code: row["Current Address: Zip/Postal Code"]?.trim() || null,
    country: row["Current Address: Country"]?.trim() || null,
    next_of_kin_first_name: row["First Name - Next of Kin"]?.trim() || null,
    next_of_kin_last_name: row["Last Name - Next of Kin"]?.trim() || null,
    next_of_kin_phone: cleanPhone(row["Phone- Next of Kin"]),
    next_of_kin_relationship:
      row["Relationship to selected Next of Kin"]?.trim() || null,
    application_signed_at: parseSignedAt(
      row['Signed this day, at San Diego County, California']
    ),
    signature_name:
      row[
        "Signature to confirm that the demographics above are accurate and voluntarily submitted"
      ]?.trim() || null,
    preferred_payment_method: "Zelle",
    zelle_bank_name: zelleNameFromApplication(first, middle, last),
    cooperative_account_status: "active",
    application_source: "WPForms membership application",
  });

  return { ...fields, applicationName };
}

function importWpformsProfiles(csvPath, options = {}) {
  const db = getDb();
  const applications = parseWpformsCsv(csvPath);
  const ledgerMembers = db.prepare(`SELECT id, name FROM members ORDER BY name`).all();
  const ledgerNames = ledgerMembers.map((m) => m.name);

  const insertMember = db.prepare(`INSERT OR IGNORE INTO members (name) VALUES (?)`);
  const getMember = db.prepare(`SELECT id, name FROM members WHERE name = ?`);
  const upsertProfile = db.prepare(`
    INSERT INTO member_profiles (
      member_id, photo_path, first_name, middle_name, last_name, display_name,
      gender, date_of_birth, email, phone,
      address_line1, address_line2, city, state, postal_code, country,
      next_of_kin_first_name, next_of_kin_last_name, next_of_kin_phone,
      next_of_kin_relationship, application_signed_at, signature_name,
      preferred_payment_method, zelle_bank_name, cooperative_account_status,
      application_source, updated_at
    ) VALUES (
      @member_id, NULL, @first_name, @middle_name, @last_name, @display_name,
      @gender, @date_of_birth, @email, @phone,
      @address_line1, @address_line2, @city, @state, @postal_code, @country,
      @next_of_kin_first_name, @next_of_kin_last_name, @next_of_kin_phone,
      @next_of_kin_relationship, @application_signed_at, @signature_name,
      @preferred_payment_method, @zelle_bank_name, @cooperative_account_status,
      @application_source, datetime('now')
    )
    ON CONFLICT(member_id) DO UPDATE SET
      first_name = excluded.first_name,
      middle_name = excluded.middle_name,
      last_name = excluded.last_name,
      display_name = excluded.display_name,
      gender = excluded.gender,
      date_of_birth = excluded.date_of_birth,
      email = excluded.email,
      phone = excluded.phone,
      address_line1 = excluded.address_line1,
      address_line2 = excluded.address_line2,
      city = excluded.city,
      state = excluded.state,
      postal_code = excluded.postal_code,
      country = excluded.country,
      next_of_kin_first_name = excluded.next_of_kin_first_name,
      next_of_kin_last_name = excluded.next_of_kin_last_name,
      next_of_kin_phone = excluded.next_of_kin_phone,
      next_of_kin_relationship = excluded.next_of_kin_relationship,
      application_signed_at = excluded.application_signed_at,
      signature_name = excluded.signature_name,
      preferred_payment_method = excluded.preferred_payment_method,
      zelle_bank_name = excluded.zelle_bank_name,
      cooperative_account_status = excluded.cooperative_account_status,
      application_source = excluded.application_source,
      updated_at = datetime('now')
  `);

  const matched = [];
  const unmatchedApplications = [];

  const run = db.transaction(() => {
    for (const row of applications) {
      const fields = rowToProfileFields(row);
      let ledgerName = resolveLedgerMemberName(fields.applicationName, ledgerNames);

      if (!ledgerName) {
        unmatchedApplications.push(fields.applicationName);
        continue;
      }

      insertMember.run(ledgerName);
      const member = getMember.get(ledgerName);
      const { applicationName, ...profileFields } = fields;
      upsertProfile.run({ member_id: member.id, ...profileFields });
      matched.push({
        applicationName,
        ledgerName,
        memberId: member.id,
      });
    }
  });

  run();

  const matchedLedgerNames = new Set(matched.map((m) => m.ledgerName));
  const membersWithoutApplication = ledgerNames.filter(
    (n) => !matchedLedgerNames.has(n)
  );

  const exportDir = options.exportDir;
  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    const profiles = db
      .prepare(
        `SELECT mp.*, m.name AS ledger_account_name
         FROM member_profiles mp
         JOIN members m ON m.id = mp.member_id
         ORDER BY m.name`
      )
      .all();
    fs.writeFileSync(
      path.join(exportDir, "member-profiles.json"),
      JSON.stringify(profiles, null, 2),
      "utf8"
    );
  }

  return {
    applicationCount: applications.length,
    matchedCount: matched.length,
    matched,
    unmatchedApplications,
    membersWithoutApplication,
  };
}

module.exports = {
  parseWpformsCsv,
  importWpformsProfiles,
};
