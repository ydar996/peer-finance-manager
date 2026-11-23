/**
 * Member import template: download a spreadsheet the admin fills in, then
 * re-upload it to bulk-create member accounts for an existing Cooperative.
 * Only First Name and Last Name are required; every other column is optional.
 * Rows whose member name already exists are skipped, never duplicated.
 */
const fs = require("fs");
const XLSX = require("xlsx");
const { getDb } = require("../db/database");
const { createMember } = require("./member-service");
const { recordMemberDepositEntry } = require("./manual-entry-service");
const { getCountryProfile } = require("./country-profile");
const {
  getCooperativeDateFormat,
  formatCooperativeDate,
  parseCooperativeDate,
  DATE_FORMAT_OPTIONS,
} = require("./cooperative-date-format");
const { TRANSACTION_TYPES } = require("./constants");

const TEMPLATE_HEADERS = [
  "Member No",
  "First Name",
  "Last Name",
  "Middle Name",
  "Gender",
  "Date of Birth",
  "Email",
  "Phone",
  "Address",
  "City",
  "District/LGA",
  "State",
  "Postal Code",
  "Country",
  "Next of Kin Name",
  "Next of Kin Phone",
  "Next of Kin Relationship",
  "Joined Date",
  "Membership Fee Paid",
  "Opening Deposit",
  "Notes",
];

const HEADER_ALIASES = {
  memberNumber: ["memberno", "membernumber", "memberid", "memberidno", "membershipno", "membershipnumber"],
  firstName: ["firstname", "first", "givenname", "fname"],
  lastName: ["lastname", "last", "surname", "familyname", "lname"],
  middleName: ["middlename", "middle", "othername", "othernames"],
  gender: ["gender", "sex"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate", "birthday"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "phonenumber", "telephone", "mobile", "cell", "gsm"],
  addressLine1: ["address", "addressline1", "street", "homeaddress", "residentialaddress"],
  city: ["city", "town"],
  district: ["district", "districtlga", "lga", "localgovernmentarea", "localgovernment", "lganame", "county", "countyname", "districtarea"],
  state: ["state", "stateprovince", "province", "region"],
  postalCode: ["postalcode", "postcode", "zip", "zipcode"],
  country: ["country", "nationality"],
  nextOfKinName: ["nextofkinname", "nokname", "nextofkin"],
  nextOfKinPhone: ["nextofkinphone", "nokphone"],
  nextOfKinRelationship: ["nextofkinrelationship", "nokrelationship", "relationship"],
  joinedDate: ["joineddate", "joindate", "membershipdate", "datejoined", "joinedat"],
  membershipFeePaid: ["membershipfeepaid", "feepaid", "registrationfeepaid"],
  openingDeposit: ["openingdeposit", "openingbalance", "depositbalance", "contributionsbalance"],
  paymentName: ["bankaccountname", "accountname", "paymentname", "banktransfername", "zellebankname", "payername", "accounttitle"],
  notes: ["notes", "note", "comments"],
};

function normalizeHeaderKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function headerFieldMap() {
  const map = new Map();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) map.set(alias, field);
  }
  return map;
}

function defaultPaymentRailLabel() {
  const profile = getCountryProfile();
  return profile?.code === "NG" ? "Bank Transfer" : "Zelle";
}

function buildMemberImportTemplateXlsxBuffer() {
  const profile = getCountryProfile();
  const dateFormat = getCooperativeDateFormat();
  const wb = XLSX.utils.book_new();
  const instructions = [
    ["Peer Finance Manager: Member Import Template"],
    [""],
    ["Use this file to create accounts for members your Cooperative already has."],
    ["First Name and Last Name are required on every row. Every other column is optional."],
    ["Member No is optional. Leave it blank to have member numbers assigned automatically; fill it to keep your own numbering."],
    ["Rows whose First Name + Last Name match an existing member are skipped, not duplicated."],
    [""],
    ["Date format", `${DATE_FORMAT_OPTIONS[dateFormat]?.label || "MM/DD/YYYY"} (for example ${formatCooperativeDate("2026-01-15")})`],
    ["Currency", `Amounts are plain numbers in ${profile?.currency || "USD"}, no currency symbol`],
    ["Membership Fee Paid", "Enter Yes only if the member already paid the registration fee. It marks the flag; it does not record a transaction."],
    ["Opening Deposit", "Optional positive amount recorded as the member's opening contribution balance, dated Joined Date or today."],
    ["Membership fees", "No fee transaction is recorded on import. Record fees on the Record tab if needed."],
    ["District/LGA", "Optional second-level area: Local Government Area (Nigeria) or County/District (United States)."],
    ["Notes", "Optional free text kept on the member ledger entry."],
    ["Extra columns", "Any other populated columns are kept in the member's Notes automatically; blank cells are ignored."],
    ["Existing members", "A row matching an existing member fills blank profile fields only; nothing is overwritten or duplicated."],
    [""],
    ["Columns"],
    ...TEMPLATE_HEADERS.map((h) => [`${h}${h === "First Name" || h === "Last Name" ? " *" : ""}`]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");

  const exampleDate = formatCooperativeDate("2026-01-15");
  const members = [
    TEMPLATE_HEADERS,
    ["COOP-001", "Adeola", "Ogunleye", "", "Female", exampleDate, "adeola@example.org", "+234 801 234 5678", "12 Adebayo Close", "Ikeja", "Ikeja LGA", "Lagos", "", "Nigeria", "Tunde Ogunleye", "+234 802 345 6789", "Spouse", exampleDate, "Yes", 50000, ""],
    ["", "Chinedu", "Eze", "", "Male", "", "chinedu@example.org", "+234 803 456 7890", "5 Nnamdi Street", "Enugu", "", "Enugu", "", "Nigeria", "Amara Eze", "", "Sister", exampleDate, "", "", "Founding member"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(members), "Members");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function buildMemberImportTemplateCsv() {
  const dateFormat = getCooperativeDateFormat();
  const exampleDate = formatCooperativeDate("2026-01-15");
  const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    TEMPLATE_HEADERS,
    ["COOP-001", "Adeola", "Ogunleye", "", "Female", exampleDate, "adeola@example.org", "+234 801 234 5678", "12 Adebayo Close", "Ikeja", "Ikeja LGA", "Lagos", "", "Nigeria", "Tunde Ogunleye", "+234 802 345 6789", "Spouse", exampleDate, "Yes", "50000", ""],
  ];
  return rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
}

const BLANK_TOKENS = new Set(["", "null", "n/a", "na", "none", "nil", "-", "--", "?"]);

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  return BLANK_TOKENS.has(text.toLowerCase()) ? "" : text;
}

function parseDateCell(value, rowErrors, label) {
  const text = cellText(value);
  if (!text) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const coop = parseCooperativeDate(text);
  if (coop?.iso) return coop.iso;
  rowErrors.push(`${label} "${text}" is not a valid date`);
  return null;
}

function parseAmountCell(value, rowErrors, label) {
  const text = cellText(value);
  if (!text) return null;
  const n = Number(String(text).replace(/[,₦$\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    rowErrors.push(`${label} "${text}" is not a positive amount`);
    return null;
  }
  return Math.round(n * 100) / 100;
}

function parseYesNo(value) {
  const s = cellText(value).toLowerCase();
  return ["yes", "y", "true", "1", "paid"].includes(s);
}

function splitNextOfKinName(value) {
  const parts = cellText(value).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function loadRowsFromFile(filePath) {
  const wb = XLSX.readFile(filePath);
  for (const sheetName of wb.SheetNames) {
    if (/instructions/i.test(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    if (!rows.length) continue;
    return { sheetName, rows };
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  return { sheetName: wb.SheetNames[0], rows };
}

function findHeaderRow(rows) {
  const fieldMap = headerFieldMap();
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const keys = rows[i].map(normalizeHeaderKey);
    const colToField = new Map();
    for (let c = 0; c < keys.length; c++) {
      const field = fieldMap.get(keys[c]);
      if (field && !colToField.has(c)) colToField.set(c, field);
    }
    const hasFirst = [...colToField.values()].includes("firstName");
    const hasLast = [...colToField.values()].includes("lastName");
    if (hasFirst && hasLast) return { index: i, colToField };
  }
  return null;
}

function importMemberTemplate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error("Upload file not found");
  const { rows } = loadRowsFromFile(filePath);
  const header = findHeaderRow(rows);
  if (!header) {
    throw new Error(
      "Could not find First Name and Last Name columns. Download the Member Import Template and keep its header row."
    );
  }

  const db = getDb();
  const rail = defaultPaymentRailLabel();
  const created = [];
  const updated = [];
  const skipped = [];
  const errors = [];

  const memberRows = db
    .prepare(`SELECT id, name, member_number, joined_at, notes FROM members`)
    .all();
  const seenNames = new Set(memberRows.map((r) => String(r.name).toLowerCase()));
  const seenNumbers = new Set(
    memberRows.filter((r) => r.member_number != null).map((r) => String(r.member_number).toLowerCase())
  );
  const memberByName = new Map(memberRows.map((r) => [String(r.name).toLowerCase(), r]));
  const memberByNumber = new Map(
    memberRows.filter((r) => r.member_number != null).map((r) => [String(r.member_number).toLowerCase(), r])
  );

  // Header columns that did not map to a schema field are preserved in
  // members.notes as "Header: value" pairs so no imported data is lost.
  const extraCols = [];
  for (let c = 0; c < rows[header.index].length; c++) {
    if (!header.colToField.has(c)) {
      const label = String(rows[header.index][c] || "").trim();
      if (label) extraCols.push({ col: c, label });
    }
  }

  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i];
    const isBlankRow = row.every((cell) => {
      if (cell == null || cell === "") return true;
      return BLANK_TOKENS.has(String(cell).trim().toLowerCase());
    });
    if (isBlankRow) continue;
    const record = {};
    for (const [colIdx, field] of header.colToField) {
      record[field] = row[colIdx];
    }
    const rowNumber = i + 1;
    const firstName = cellText(record.firstName);
    const lastName = cellText(record.lastName);
    const rowErrors = [];
    if (!firstName) rowErrors.push("First Name is required");
    if (!lastName) rowErrors.push("Last Name is required");

    const joinedDate = parseDateCell(record.joinedDate, rowErrors, "Joined Date");
    const dateOfBirth = parseDateCell(record.dateOfBirth, rowErrors, "Date of Birth");
    const openingDeposit = parseAmountCell(record.openingDeposit, rowErrors, "Opening Deposit");

    if (rowErrors.length) {
      errors.push({ row: rowNumber, name: [firstName, lastName].filter(Boolean).join(" ") || `Row ${rowNumber}`, errors: rowErrors });
      continue;
    }

    const displayName = [firstName, cellText(record.middleName), lastName].filter(Boolean).join(" ");
    const memberNo = cellText(record.memberNumber);
    const extrasText = extraCols
      .map(({ col, label }) => {
        const v = cellText(row[col]);
        return v && v !== "0" ? `${label}: ${v}` : null;
      })
      .filter(Boolean)
      .join("; ");
    const rowNotes = [cellText(record.notes), extrasText].filter(Boolean).join(" | ");

    const byNo = memberNo ? memberByNumber.get(memberNo.toLowerCase()) : null;
    const byName =
      memberByName.get(displayName.toLowerCase()) ||
      memberByName.get(`${firstName} ${lastName}`.toLowerCase());
    if (byNo && byName && byNo.id !== byName.id) {
      skipped.push({ row: rowNumber, name: displayName, reason: `Member No ${memberNo} belongs to a different member` });
      continue;
    }
    const existing = byNo || byName;
    if (existing) {
      // Fill blank profile/member fields only; never overwrite or duplicate.
      const nok = splitNextOfKinName(record.nextOfKinName);
      const profileFields = {
        middle_name: cellText(record.middleName),
        gender: cellText(record.gender),
        date_of_birth: dateOfBirth,
        email: cellText(record.email),
        phone: cellText(record.phone),
        address_line1: cellText(record.addressLine1),
        city: cellText(record.city),
        district: cellText(record.district),
        state: cellText(record.state),
        postal_code: cellText(record.postalCode),
        country: cellText(record.country),
        next_of_kin_first_name: nok.first,
        next_of_kin_last_name: nok.last,
        next_of_kin_phone: cellText(record.nextOfKinPhone),
        next_of_kin_relationship: cellText(record.nextOfKinRelationship),
        zelle_bank_name: cellText(record.paymentName),
      };
      const filled = fillMemberProfileBlanks(db, existing.id, profileFields);
      const memberSets = [];
      const memberParams = { id: existing.id };
      if (joinedDate) {
        memberSets.push(`joined_at = COALESCE(joined_at, @joined_at)`);
        memberParams.joined_at = joinedDate;
      }
      if (memberNo && !existing.member_number) {
        memberSets.push(`member_number = @member_number`);
        memberParams.member_number = memberNo;
        seenNumbers.add(memberNo.toLowerCase());
      }
      if (rowNotes) {
        const current = String(existing.notes || "");
        if (!current.includes(extrasText || rowNotes)) {
          memberSets.push(`notes = @notes`);
          memberParams.notes = [current, rowNotes].filter(Boolean).join(" | ");
        }
      }
      if (memberSets.length) {
        db.prepare(`UPDATE members SET ${memberSets.join(", ")} WHERE id = @id`).run(memberParams);
      }
      updated.push({ row: rowNumber, name: existing.name, memberNumber: existing.member_number || memberNo || null, memberId: existing.id, filled });
      continue;
    }
    if (memberNo && seenNumbers.has(memberNo.toLowerCase())) {
      skipped.push({ row: rowNumber, name: displayName, reason: `Member No ${memberNo} already exists` });
      continue;
    }
    if (seenNames.has(displayName.toLowerCase()) || seenNames.has(`${firstName} ${lastName}`.toLowerCase())) {
      skipped.push({ row: rowNumber, name: displayName, reason: "Member name already exists" });
      continue;
    }

    const nok = splitNextOfKinName(record.nextOfKinName);
    try {
      const result = createMember({
        memberNumber: memberNo || undefined,
        firstName,
        middleName: cellText(record.middleName) || undefined,
        lastName,
        gender: cellText(record.gender) || undefined,
        dateOfBirth: dateOfBirth || undefined,
        email: cellText(record.email) || undefined,
        phone: cellText(record.phone) || undefined,
        addressLine1: cellText(record.addressLine1) || undefined,
        city: cellText(record.city) || undefined,
        district: cellText(record.district) || undefined,
        state: cellText(record.state) || undefined,
        postalCode: cellText(record.postalCode) || undefined,
        country: cellText(record.country) || undefined,
        nextOfKinFirstName: nok.first || undefined,
        nextOfKinLastName: nok.last || undefined,
        nextOfKinPhone: cellText(record.nextOfKinPhone) || undefined,
        nextOfKinRelationship: cellText(record.nextOfKinRelationship) || undefined,
        preferredPaymentMethod: rail,
        zelleBankName: cellText(record.paymentName) || undefined,
        applicationSource: "Member import template",
        joinedAt: joinedDate || undefined,
        notes: rowNotes || undefined,
        recordMembershipFee: false,
      });

      if (parseYesNo(record.membershipFeePaid)) {
        db.prepare(`UPDATE members SET membership_fee_paid = 1 WHERE id = ?`).run(result.memberId);
      }

      let openingTransactionId = null;
      if (openingDeposit) {
        const dep = recordMemberDepositEntry({
          memberId: result.memberId,
          type: TRANSACTION_TYPES.DEPOSIT,
          amount: openingDeposit,
          transactionDate: joinedDate || new Date().toISOString().slice(0, 10),
          description: "Opening balance (member import)",
        });
        openingTransactionId = dep.transactionId;
      }

      seenNames.add(displayName.toLowerCase());
      if (memberNo) seenNumbers.add(memberNo.toLowerCase());
      created.push({
        row: rowNumber,
        name: result.ledgerName,
        memberNumber: result.memberNumber,
        memberId: result.memberId,
        openingDeposit: openingDeposit || null,
        feePaidFlag: parseYesNo(record.membershipFeePaid),
      });
      void openingTransactionId;
    } catch (err) {
      errors.push({ row: rowNumber, name: displayName || `Row ${rowNumber}`, errors: [err.message] });
    }
  }

  try {
    fs.unlinkSync(filePath);
  } catch (_) {
    /* uploaded temp file cleanup is best-effort */
  }

  return {
    created: created.length,
    updated: updated.length,
    skipped: skipped.length,
    failed: errors.length,
    members: created,
    updatedRows: updated,
    skippedRows: skipped,
    errors,
  };
}

// Set each supplied profile field only where the stored value is blank;
// never overwrites existing data. Returns the list of columns supplied.
function fillMemberProfileBlanks(db, memberId, fields) {
  db.prepare(`INSERT OR IGNORE INTO member_profiles (member_id) VALUES (?)`).run(memberId);
  const sets = [];
  const params = { id: memberId };
  const filled = [];
  for (const [col, val] of Object.entries(fields)) {
    if (!val) continue;
    sets.push(`${col} = COALESCE(NULLIF(TRIM(${col}), ''), @${col})`);
    params[col] = val;
    filled.push(col);
  }
  if (sets.length) {
    db.prepare(
      `UPDATE member_profiles SET ${sets.join(", ")}, updated_at = datetime('now') WHERE member_id = @id`
    ).run(params);
  }
  return filled;
}

module.exports = {
  TEMPLATE_HEADERS,
  buildMemberImportTemplateXlsxBuffer,
  buildMemberImportTemplateCsv,
  importMemberTemplate,
};
