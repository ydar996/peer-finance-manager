/**
 * FlexxForms membership applications: parse submissions, create pending profiles, admin approval.
 */
const { getDb } = require("../db/database");
const { createMember, updateMemberProfile } = require("./member-service");
const { buildFullName } = require("./member-name-match");
const {
  MEMBERSHIP_FEE,
  INITIAL_MEMBERSHIP_CONTRIBUTION,
  TRANSACTION_TYPES,
} = require("./constants");

const PENDING_ACCOUNT_STATUS = "pending_approval";

const FIELD_ALIASES = {
  firstName: ["firstname", "first_name", "first name", "givenname", "given_name"],
  middleName: ["middlename", "middle_name", "middle name", "mi"],
  lastName: ["lastname", "last_name", "last name", "surname", "familyname", "family_name"],
  email: ["email", "emailaddress", "email_address", "e mail"],
  phone: ["phone", "phonenumber", "phone_number", "mobile", "cell", "telephone"],
  gender: ["gender", "sex"],
  dateOfBirth: ["dateofbirth", "date_of_birth", "date birth", "dob", "birthdate", "birth_date"],
  addressLine1: [
    "addressline1",
    "address_line1",
    "address line 1",
    "address1",
    "street",
    "streetaddress",
    "currentaddressaddressline1",
  ],
  addressLine2: ["addressline2", "address_line2", "address line 2", "address2"],
  city: ["city", "currentaddresscity"],
  state: ["state", "province", "currentaddressstate"],
  postalCode: ["postalcode", "postal_code", "zip", "zipcode", "zip_code", "currentaddresszippostalcode"],
  country: ["country", "currentaddresscountry"],
  nextOfKinFirstName: ["nextofkinfirstname", "firstnamenextofkin", "first name next of kin", "nokfirstname"],
  nextOfKinLastName: ["nextofkinlastname", "lastnamenextofkin", "last name next of kin", "noklastname"],
  nextOfKinPhone: ["nextofkinphone", "phonenextofkin", "phone next of kin", "nokphone"],
  nextOfKinRelationship: [
    "nextofkinrelationship",
    "relationshiptonextofkin",
    "relationship to selected next of kin",
    "nokrelationship",
  ],
  signatureName: ["signaturename", "signature", "signature_name"],
};

function normalizeFieldKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function flattenSubmissionValues(payload) {
  const values = {};
  const data = payload?.data || payload?.submission || payload || {};

  const assign = (key, value) => {
    if (value == null) return;
    const text = String(value).trim();
    if (!text) return;
    values[normalizeFieldKey(key)] = text;
  };

  const walk = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const [key, raw] of Object.entries(obj)) {
      if (raw == null) continue;
      if (typeof raw === "object" && !Array.isArray(raw)) {
        if (Object.prototype.hasOwnProperty.call(raw, "value")) {
          assign(key, raw.value);
        } else {
          walk(raw);
        }
      } else {
        assign(key, raw);
      }
    }
  };

  walk(data);
  if (Array.isArray(data.fields)) {
    for (const field of data.fields) {
      assign(field.label || field.name || field.id || field.key, field.value ?? field.answer);
    }
  }
  if (data.answers && typeof data.answers === "object") walk(data.answers);
  if (data.responses && typeof data.responses === "object") walk(data.responses);
  if (data.values && typeof data.values === "object") walk(data.values);

  assign("firstName", data.firstName || data.first_name);
  assign("lastName", data.lastName || data.last_name);
  assign("email", data.email);
  assign("phone", data.phone);

  return values;
}

function pickField(values, logicalName) {
  const aliases = FIELD_ALIASES[logicalName] || [logicalName];
  for (const alias of aliases) {
    const hit = values[normalizeFieldKey(alias)];
    if (hit) return hit;
  }
  return null;
}

function parseUsDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function parseFlexxFormsMembershipPayload(payload) {
  const values = flattenSubmissionValues(payload);
  const firstName = pickField(values, "firstName");
  const middleName = pickField(values, "middleName");
  const lastName = pickField(values, "lastName");
  const email = pickField(values, "email");
  const displayName = buildFullName(firstName, middleName, lastName);

  return {
    firstName,
    middleName,
    lastName,
    email,
    phone: pickField(values, "phone"),
    gender: pickField(values, "gender"),
    dateOfBirth: parseUsDate(pickField(values, "dateOfBirth")),
    addressLine1: pickField(values, "addressLine1"),
    addressLine2: pickField(values, "addressLine2"),
    city: pickField(values, "city"),
    state: pickField(values, "state"),
    postalCode: pickField(values, "postalCode"),
    country: pickField(values, "country"),
    nextOfKinFirstName: pickField(values, "nextOfKinFirstName"),
    nextOfKinLastName: pickField(values, "nextOfKinLastName"),
    nextOfKinPhone: pickField(values, "nextOfKinPhone"),
    nextOfKinRelationship: pickField(values, "nextOfKinRelationship"),
    signatureName: pickField(values, "signatureName"),
    displayName,
    applicationSignedAt:
      payload?.submittedAt ||
      payload?.submitted_at ||
      payload?.data?.submittedAt ||
      payload?.data?.submitted_at ||
      null,
  };
}

function ensureMembershipApplicationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flexxforms_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      flexxforms_submission_id TEXT,
      form_id TEXT,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      member_id INTEGER,
      loan_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const cols = db.prepare(`PRAGMA table_info(flexxforms_applications)`).all().map((c) => c.name);
  const add = (name, sql) => {
    if (cols.includes(name)) return;
    try {
      db.exec(`ALTER TABLE flexxforms_applications ${sql}`);
      cols.push(name);
    } catch (_) {}
  };
  add("applicant_name", "ADD COLUMN applicant_name TEXT");
  add("applicant_email", "ADD COLUMN applicant_email TEXT");
  add("processed_at", "ADD COLUMN processed_at TEXT");
  add("approved_at", "ADD COLUMN approved_at TEXT");
  add("approved_by_user_id", "ADD COLUMN approved_by_user_id INTEGER");
  add("processing_error", "ADD COLUMN processing_error TEXT");
}

function getApplicantPaymentReadiness(memberId) {
  const db = getDb();
  const member = db.prepare(`SELECT membership_fee_paid FROM members WHERE id = ?`).get(memberId);
  const depositTotal =
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM transactions
         WHERE member_id = ? AND type = ?`
      )
      .get(memberId, TRANSACTION_TYPES.DEPOSIT)?.total || 0;

  const membershipFeePaid = Boolean(member?.membership_fee_paid);
  const initialContributionMet = Number(depositTotal) >= INITIAL_MEMBERSHIP_CONTRIBUTION;

  return {
    membershipFeePaid,
    membershipFeeRequired: MEMBERSHIP_FEE,
    initialContributionMet,
    initialContributionRequired: INITIAL_MEMBERSHIP_CONTRIBUTION,
    depositTotal: Number(depositTotal),
    canApprove: membershipFeePaid && initialContributionMet,
  };
}

function findMemberByEmailOrName(email, displayName) {
  const db = getDb();
  if (email) {
    const byEmail = db
      .prepare(
        `SELECT m.id, m.name, mp.cooperative_account_status AS accountStatus
         FROM member_profiles mp
         JOIN members m ON m.id = mp.member_id
         WHERE lower(mp.email) = lower(?)
         LIMIT 1`
      )
      .get(email);
    if (byEmail) return byEmail;
  }
  if (displayName) {
    return (
      db
        .prepare(
          `SELECT m.id, m.name, mp.cooperative_account_status AS accountStatus
           FROM members m
           LEFT JOIN member_profiles mp ON mp.member_id = m.id
           WHERE m.name = ?
           LIMIT 1`
        )
        .get(displayName) || null
    );
  }
  return null;
}

function processMembershipFormSubmission(applicationId, payload) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);

  const parsed = parseFlexxFormsMembershipPayload(payload);
  if (!parsed.displayName && !parsed.email) {
    throw new Error("Submission is missing applicant name and email");
  }

  const existing = findMemberByEmailOrName(parsed.email, parsed.displayName);
  if (existing && existing.accountStatus !== PENDING_ACCOUNT_STATUS) {
    db.prepare(
      `UPDATE flexxforms_applications
       SET status = 'duplicate', member_id = ?, applicant_name = ?, applicant_email = ?,
           processed_at = datetime('now'), processing_error = ?
       WHERE id = ?`
    ).run(
      existing.id,
      parsed.displayName || existing.name,
      parsed.email || null,
      "An active member profile already exists for this applicant",
      applicationId
    );
    return { ok: true, duplicate: true, memberId: existing.id };
  }

  let memberId = existing?.id || null;
  if (!memberId) {
    const created = createMember({
      firstName: parsed.firstName,
      middleName: parsed.middleName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      gender: parsed.gender,
      dateOfBirth: parsed.dateOfBirth,
      addressLine1: parsed.addressLine1,
      addressLine2: parsed.addressLine2,
      city: parsed.city,
      state: parsed.state,
      postalCode: parsed.postalCode,
      country: parsed.country,
      nextOfKinFirstName: parsed.nextOfKinFirstName,
      nextOfKinLastName: parsed.nextOfKinLastName,
      nextOfKinPhone: parsed.nextOfKinPhone,
      nextOfKinRelationship: parsed.nextOfKinRelationship,
      cooperativeAccountStatus: PENDING_ACCOUNT_STATUS,
      applicationSource: "FlexxForms membership application",
      recordMembershipFee: false,
      notes: "Pending admin approval after membership fee and initial contribution are confirmed.",
    });
    memberId = created.memberId;
  } else {
    updateMemberProfile(memberId, {
      ...parsed,
      cooperativeAccountStatus: PENDING_ACCOUNT_STATUS,
      applicationSource: "FlexxForms membership application",
    });
  }

  if (parsed.applicationSignedAt || parsed.signatureName) {
    db.prepare(
      `UPDATE member_profiles
       SET application_signed_at = COALESCE(?, application_signed_at),
           signature_name = COALESCE(?, signature_name),
           updated_at = datetime('now')
       WHERE member_id = ?`
    ).run(parsed.applicationSignedAt, parsed.signatureName, memberId);
  }

  const readiness = getApplicantPaymentReadiness(memberId);
  const nextStatus = readiness.canApprove ? "awaiting_approval" : "awaiting_payment";

  db.prepare(
    `UPDATE flexxforms_applications
     SET status = ?, member_id = ?, applicant_name = ?, applicant_email = ?,
         processed_at = datetime('now'), processing_error = NULL
     WHERE id = ?`
  ).run(nextStatus, memberId, parsed.displayName, parsed.email || null, applicationId);

  return { ok: true, memberId, status: nextStatus, readiness };
}

function refreshMembershipApplicationStatus(applicationId) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = db
    .prepare(`SELECT id, member_id, status FROM flexxforms_applications WHERE id = ?`)
    .get(applicationId);
  if (!row?.member_id) return null;
  if (row.status === "approved" || row.status === "duplicate" || row.status === "rejected") {
    return row;
  }
  const readiness = getApplicantPaymentReadiness(row.member_id);
  const nextStatus = readiness.canApprove ? "awaiting_approval" : "awaiting_payment";
  if (nextStatus !== row.status) {
    db.prepare(`UPDATE flexxforms_applications SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
      nextStatus,
      applicationId
    );
  }
  return { ...row, status: nextStatus, readiness };
}

function approveMembershipApplication(applicationId, approvedByUserId) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const app = db
    .prepare(
      `SELECT id, kind, member_id, status FROM flexxforms_applications WHERE id = ?`
    )
    .get(applicationId);
  if (!app) throw new Error("Application not found");
  if (app.kind !== "membership") throw new Error("Only membership applications can be approved here");
  if (!app.member_id) throw new Error("Application has no linked member profile yet");
  if (app.status === "approved") throw new Error("Application is already approved");

  const readiness = getApplicantPaymentReadiness(app.member_id);
  if (!readiness.canApprove) {
    throw new Error(
      `Cannot approve yet. Record membership fee ($${MEMBERSHIP_FEE}) and initial contribution ($${INITIAL_MEMBERSHIP_CONTRIBUTION} deposit) for this applicant first.`
    );
  }

  const joinedAt = new Date().toISOString().slice(0, 10);
  db.prepare(
    `UPDATE member_profiles
     SET cooperative_account_status = 'active', updated_at = datetime('now')
     WHERE member_id = ?`
  ).run(app.member_id);
  db.prepare(`UPDATE members SET joined_at = COALESCE(joined_at, ?) WHERE id = ?`).run(joinedAt, app.member_id);
  db.prepare(
    `UPDATE flexxforms_applications
     SET status = 'approved', approved_at = datetime('now'), approved_by_user_id = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(approvedByUserId || null, applicationId);

  return { memberId: app.member_id, status: "approved" };
}

function listMembershipApplications() {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const rows = db
    .prepare(
      `SELECT id, kind, flexxforms_submission_id AS submissionId, form_id AS formId,
              status, member_id AS memberId, applicant_name AS applicantName,
              applicant_email AS applicantEmail, processing_error AS processingError,
              created_at AS createdAt, processed_at AS processedAt, approved_at AS approvedAt
       FROM flexxforms_applications
       WHERE kind = 'membership'
       ORDER BY id DESC
       LIMIT 100`
    )
    .all();

  return rows.map((row) => {
    const readiness = row.memberId ? getApplicantPaymentReadiness(row.memberId) : null;
    let status = row.status;
    if (row.memberId && !["approved", "duplicate", "rejected"].includes(status)) {
      status = readiness?.canApprove ? "awaiting_approval" : "awaiting_payment";
    }
    return { ...row, status, readiness };
  });
}

module.exports = {
  PENDING_ACCOUNT_STATUS,
  parseFlexxFormsMembershipPayload,
  processMembershipFormSubmission,
  refreshMembershipApplicationStatus,
  approveMembershipApplication,
  getApplicantPaymentReadiness,
  listMembershipApplications,
  ensureMembershipApplicationSchema,
};
