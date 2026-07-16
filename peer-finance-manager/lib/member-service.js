const { getDb } = require("../db/database");
const { addTransaction } = require("./balance-service");
const { MEMBERSHIP_FEE, TRANSACTION_TYPES } = require("./constants");
const { ensureMemberNumber } = require("./member-number-service");
const { syncMemberPortalLoginEmail } = require("./auth-service");
const { buildFullName, zelleNameFromApplication } = require("./member-name-match");
const {
  formatPersonName,
  formatNamePart,
  normalizeProfileFields,
} = require("./text-format");

function resolveLedgerName({ name, firstName, middleName, lastName }) {
  const trimmed = String(name || "").trim();
  if (trimmed) return formatPersonName(trimmed);
  const full = buildFullName(
    formatNamePart(firstName),
    formatNamePart(middleName),
    formatNamePart(lastName)
  );
  if (!full) throw new Error("Ledger account name or member name is required");
  return full;
}

function hasProfileInput(fields) {
  return Boolean(
    fields.firstName ||
      fields.middleName ||
      fields.lastName ||
      fields.dateOfBirth ||
      fields.email ||
      fields.phone ||
      fields.city ||
      fields.state ||
      fields.addressLine1 ||
      fields.gender
  );
}

function profileFieldsFromPayload(payload) {
  const firstName = payload.firstName?.trim() || null;
  const middleName = payload.middleName?.trim() || null;
  const lastName = payload.lastName?.trim() || null;
  const displayName =
    payload.displayName?.trim() ||
    buildFullName(firstName, middleName, lastName) ||
    null;

  const fields = normalizeProfileFields({
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    display_name: displayName,
    gender: payload.gender?.trim() || null,
    date_of_birth: payload.dateOfBirth || null,
    email: payload.email?.trim() || null,
    phone: payload.phone?.trim() || null,
    address_line1: payload.addressLine1?.trim() || null,
    address_line2: payload.addressLine2?.trim() || null,
    city: payload.city?.trim() || null,
    state: payload.state?.trim() || null,
    postal_code: payload.postalCode?.trim() || null,
    country: payload.country?.trim() || null,
    next_of_kin_first_name: payload.nextOfKinFirstName?.trim() || null,
    next_of_kin_last_name: payload.nextOfKinLastName?.trim() || null,
    next_of_kin_email: payload.nextOfKinEmail?.trim() || null,
    next_of_kin_phone: payload.nextOfKinPhone?.trim() || null,
    next_of_kin_relationship: payload.nextOfKinRelationship?.trim() || null,
    preferred_payment_method: payload.preferredPaymentMethod?.trim() || "Zelle",
    zelle_bank_name:
      payload.zelleBankName?.trim() ||
      zelleNameFromApplication(firstName, middleName, lastName),
    application_source: payload.applicationSource?.trim() || "Manual entry",
  });

  // Only set status when explicitly provided so profile edits cannot reset resigned/etc.
  if (payload.cooperativeAccountStatus != null && String(payload.cooperativeAccountStatus).trim()) {
    fields.cooperative_account_status = String(payload.cooperativeAccountStatus).trim();
  }

  return fields;
}

function upsertMemberProfile(db, memberId, fields) {
  db.prepare(
    `INSERT INTO member_profiles (
      member_id, photo_path, first_name, middle_name, last_name, display_name,
      gender, date_of_birth, email, phone,
      address_line1, address_line2, city, state, postal_code, country,
      next_of_kin_first_name, next_of_kin_last_name, next_of_kin_email, next_of_kin_phone,
      next_of_kin_relationship, application_signed_at, signature_name,
      preferred_payment_method, zelle_bank_name, cooperative_account_status,
      application_source, updated_at
    ) VALUES (
      @member_id, NULL, @first_name, @middle_name, @last_name, @display_name,
      @gender, @date_of_birth, @email, @phone,
      @address_line1, @address_line2, @city, @state, @postal_code, @country,
      @next_of_kin_first_name, @next_of_kin_last_name, @next_of_kin_email, @next_of_kin_phone,
      @next_of_kin_relationship, NULL, NULL,
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
      next_of_kin_email = excluded.next_of_kin_email,
      next_of_kin_phone = excluded.next_of_kin_phone,
      next_of_kin_relationship = excluded.next_of_kin_relationship,
      preferred_payment_method = excluded.preferred_payment_method,
      zelle_bank_name = excluded.zelle_bank_name,
      cooperative_account_status = excluded.cooperative_account_status,
      application_source = excluded.application_source,
      updated_at = datetime('now')`
  ).run({ member_id: memberId, ...fields });
}

function recordMembershipFee(memberId, { feeDate, amount } = {}) {
  const db = getDb();
  const member = db.prepare(`SELECT * FROM members WHERE id = ?`).get(memberId);
  if (!member) throw new Error("Member not found");

  const existing = db
    .prepare(
      `SELECT id FROM transactions WHERE member_id = ? AND type = ?`
    )
    .get(memberId, TRANSACTION_TYPES.MEMBERSHIP_FEE);
  if (existing) throw new Error("Membership fee already recorded for this member");

  const feeAmount = amount != null ? Number(amount) : MEMBERSHIP_FEE;
  if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
    throw new Error("Membership fee amount must be greater than zero");
  }

  const txDate =
    feeDate || member.joined_at || new Date().toISOString().slice(0, 10);
  const signedAmount = -Math.abs(feeAmount);

  const txId = addTransaction({
    memberId,
    type: TRANSACTION_TYPES.MEMBERSHIP_FEE,
    amount: signedAmount,
    transactionDate: txDate,
    description: `One-time membership fee (${feeAmount})`,
    source: "manual",
  });

  db.prepare(
    `UPDATE members SET membership_fee_paid = 1, joined_at = COALESCE(joined_at, ?) WHERE id = ?`
  ).run(txDate, memberId);

  return { transactionId: txId, amount: signedAmount };
}

function createMember(payload = {}) {
  const ledgerName = resolveLedgerName(payload);
  const db = getDb();

  const existing = db.prepare(`SELECT id FROM members WHERE name = ?`).get(ledgerName);
  if (existing) throw new Error(`Member "${ledgerName}" already exists`);

  const joinedAt = payload.joinedAt || null;
  const notes = payload.notes?.trim() || null;
  const profileFields = profileFieldsFromPayload(payload);
  if (!profileFields.cooperative_account_status) {
    profileFields.cooperative_account_status =
      payload.cooperativeAccountStatus?.trim() || "active";
  }
  const shouldCreateProfile = hasProfileInput(payload) || Boolean(profileFields.display_name);
  const recordFee = payload.recordMembershipFee !== false;

  const result = db.transaction(() => {
    const insert = db
      .prepare(`INSERT INTO members (name, joined_at, notes) VALUES (?, ?, ?)`)
      .run(ledgerName, joinedAt, notes);
    const memberId = insert.lastInsertRowid;
    ensureMemberNumber(db, memberId);

    if (shouldCreateProfile) {
      upsertMemberProfile(db, memberId, profileFields);
    }

    let feeResult = null;
    if (recordFee) {
      feeResult = recordMembershipFee(memberId, {
        feeDate: payload.membershipFeeDate || joinedAt,
        amount: payload.membershipFeeAmount,
      });
    }

    return {
      memberId,
      ledgerName,
      memberNumber: db.prepare(`SELECT member_number FROM members WHERE id = ?`).get(memberId)
        ?.member_number,
      profileCreated: shouldCreateProfile,
      membershipFee: feeResult,
    };
  })();

  return result;
}

function updateMemberProfile(memberId, payload = {}) {
  const db = getDb();
  const member = db.prepare(`SELECT id, name FROM members WHERE id = ?`).get(memberId);
  if (!member) throw new Error("Member not found");

  const existingProfile = db
    .prepare(`SELECT * FROM member_profiles WHERE member_id = ?`)
    .get(memberId);

  const incoming = profileFieldsFromPayload({
    ...payload,
    displayName: payload.displayName || member.name,
  });

  const profileFields = existingProfile
    ? {
        ...existingProfile,
        ...incoming,
        display_name:
          incoming.display_name ||
          existingProfile.display_name ||
          member.name,
        // Preserve status unless the caller explicitly sent cooperativeAccountStatus.
        cooperative_account_status:
          incoming.cooperative_account_status ||
          existingProfile.cooperative_account_status ||
          "active",
      }
    : {
        ...incoming,
        cooperative_account_status:
          incoming.cooperative_account_status || "active",
      };

  if (payload.name?.trim() && payload.name.trim() !== member.name) {
    const newName = formatPersonName(payload.name.trim());
    const clash = db.prepare(`SELECT id FROM members WHERE name = ? AND id != ?`).get(newName, memberId);
    if (clash) throw new Error(`Member name "${newName}" is already in use`);
    db.prepare(`UPDATE members SET name = ? WHERE id = ?`).run(newName, memberId);
  }

  if (payload.joinedAt !== undefined) {
    db.prepare(`UPDATE members SET joined_at = ? WHERE id = ?`).run(
      payload.joinedAt || null,
      memberId
    );
  }

  if (payload.notes !== undefined) {
    db.prepare(`UPDATE members SET notes = ? WHERE id = ?`).run(
      payload.notes?.trim() || null,
      memberId
    );
  }

  upsertMemberProfile(db, memberId, profileFields);

  const priorEmail = existingProfile?.email
    ? String(existingProfile.email).trim().toLowerCase()
    : null;
  const newEmail = profileFields.email
    ? String(profileFields.email).trim().toLowerCase()
    : null;
  if (newEmail && newEmail !== priorEmail) {
    syncMemberPortalLoginEmail(db, memberId, profileFields.email);
  }

  return { memberId, ledgerName: payload.name?.trim() || member.name };
}

module.exports = {
  createMember,
  updateMemberProfile,
  recordMembershipFee,
};
