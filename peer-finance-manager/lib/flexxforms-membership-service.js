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

/** FlexxForms membership form field labels (Assurance published form question text). */
const FLEXXFORMS_MEMBERSHIP_FIELD_LABELS = {
  firstName: ["First Name"],
  middleName: ["Middle Name"],
  lastName: ["Last Name"],
  email: ["Email"],
  phone: ["Phone"],
  gender: ["Gender"],
  dateOfBirth: ["Date of Birth"],
  addressLine1: ["Current Address: Address Line 1"],
  addressLine2: ["Current Address: Address Line 2"],
  city: ["Current Address: City"],
  state: ["Current Address: State"],
  postalCode: ["Current Address: Zip/Postal Code"],
  country: ["Current Address: Country"],
  nextOfKinFirstName: ["First Name - Next of Kin"],
  nextOfKinLastName: ["Last Name - Next of Kin"],
  nextOfKinPhone: ["Phone- Next of Kin", "Phone - Next of Kin"],
  nextOfKinRelationship: ["Relationship to selected Next of Kin"],
  signatureName: [
    "Signature to confirm that the demographics above are accurate and voluntarily submitted",
    "Signature",
  ],
  applicationSignedAt: ["Signed this day, at San Diego County, California"],
};

const FIELD_ALIASES = {
  firstName: ["firstname", "first_name", "first name", "givenname", "given_name"],
  middleName: ["middlename", "middle_name", "middle name", "mi"],
  lastName: ["lastname", "last_name", "last name", "surname", "familyname", "family_name"],
  email: ["email", "emailaddress", "email_address", "e mail", "e-mail"],
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
  signatureName: ["signaturename", "signature_name"],
};

function normalizeFieldKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isNextOfKinLabel(label) {
  const n = normalizeFieldKey(label);
  return (
    n.includes("nextofkin") ||
    n.includes("nok") ||
    (n.includes("kin") && (n.includes("first") || n.includes("last") || n.includes("phone") || n.includes("relationship")))
  );
}

function cleanPhone(value) {
  const s = String(value || "").replace(/^'/, "").trim();
  return s || null;
}

function collectLabeledFields(data, byLabel) {
  const add = (label, value) => {
    if (!label || value == null) return;
    const text = String(value).trim();
    if (!text || text.startsWith("data:image")) return;
    const key = String(label).trim();
    byLabel[key] = text;
    byLabel[normalizeFieldKey(key)] = text;
  };

  const fromFieldList = (fields) => {
    if (!Array.isArray(fields)) return;
    for (const field of fields) {
      const label = field.label || field.title || field.name || field.question || field.fieldLabel;
      const value =
        field.value ??
        field.answer ??
        field.response ??
        field.text ??
        (field.values && !Array.isArray(field.values) ? field.values : null);
      add(label, value);
      if (Array.isArray(field.values)) {
        for (const part of field.values) {
          if (part && typeof part === "object") {
            fromFieldList([part]);
          } else {
            add(label, part);
          }
        }
      }
    }
  };

  fromFieldList(data.fields);
  fromFieldList(data.responses);
  fromFieldList(data.answers);
  if (data.answers && typeof data.answers === "object" && !Array.isArray(data.answers)) {
    for (const [label, value] of Object.entries(data.answers)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        add(label, value.value ?? value.answer ?? value.text);
      } else {
        add(label, value);
      }
    }
  }
}

function flattenSubmissionValues(payload) {
  const applicantValues = {};
  const nokValues = {};
  const byLabel = {};
  const data = payload?.data || payload?.submission || payload || {};

  collectLabeledFields(data, byLabel);

  const assign = (key, value, bucket) => {
    if (value == null) return;
    const text = String(value).trim();
    if (!text || text.startsWith("data:image")) return;
    bucket[normalizeFieldKey(key)] = text;
  };

  const skipKeys = new Set(["fields", "responses", "answers", "values", "metadata", "form", "formid"]);

  const walk = (obj, path = "") => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    const pathNorm = normalizeFieldKey(path);
    const inNokContext =
      pathNorm.includes("nextofkin") || pathNorm.includes("nok");

    for (const [key, raw] of Object.entries(obj)) {
      if (skipKeys.has(String(key).toLowerCase())) continue;
      if (raw == null) continue;

      const keyNorm = normalizeFieldKey(key);
      const nok = inNokContext || isNextOfKinLabel(key);
      const bucket = nok ? nokValues : applicantValues;

      if (typeof raw === "object" && !Array.isArray(raw)) {
        if (Object.prototype.hasOwnProperty.call(raw, "value")) {
          assign(key, raw.value, isNextOfKinLabel(key) || inNokContext ? nokValues : applicantValues);
        } else if (Object.prototype.hasOwnProperty.call(raw, "answer")) {
          assign(key, raw.answer, bucket);
        } else {
          walk(raw, path ? `${path}.${key}` : key);
        }
      } else if (!Array.isArray(raw)) {
        assign(key, raw, bucket);
      }
    }
  };

  walk(data);

  assign("firstName", data.firstName || data.first_name, applicantValues);
  assign("lastName", data.lastName || data.last_name, applicantValues);
  assign("email", data.email, applicantValues);
  assign("phone", data.phone, applicantValues);

  if (data.values && typeof data.values === "object" && !Array.isArray(data.values)) {
    for (const [key, value] of Object.entries(data.values)) {
      const bucket = isNextOfKinLabel(key) ? nokValues : applicantValues;
      assign(key, value, bucket);
    }
  }

  return { byLabel, applicantValues, nokValues };
}

function pickByLabels(byLabel, labels) {
  for (const label of labels) {
    const hit = byLabel[label] || byLabel[normalizeFieldKey(label)];
    if (hit) return hit;
  }
  return null;
}

function pickField(values, logicalName) {
  const aliases = FIELD_ALIASES[logicalName] || [logicalName];
  for (const alias of aliases) {
    const hit = values[normalizeFieldKey(alias)];
    if (hit) return hit;
  }
  return null;
}

function pickMembershipField(flat, logicalName) {
  const formLabels = FLEXXFORMS_MEMBERSHIP_FIELD_LABELS[logicalName];
  if (formLabels) {
    const fromLabel = pickByLabels(flat.byLabel, formLabels);
    if (fromLabel) return fromLabel;
  }
  const nokFields = new Set([
    "nextOfKinFirstName",
    "nextOfKinLastName",
    "nextOfKinPhone",
    "nextOfKinRelationship",
  ]);
  const bucket = nokFields.has(logicalName) ? flat.nokValues : flat.applicantValues;
  const fromBucket = pickField(bucket, logicalName);
  if (fromBucket) return fromBucket;
  if (!nokFields.has(logicalName)) {
    return pickField(flat.applicantValues, logicalName);
  }
  return pickField(flat.nokValues, logicalName);
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
  const flat = flattenSubmissionValues(payload);
  const firstName = pickMembershipField(flat, "firstName");
  const middleName = pickMembershipField(flat, "middleName");
  const lastName = pickMembershipField(flat, "lastName");
  const email = pickMembershipField(flat, "email");
  const displayName = buildFullName(firstName, middleName, lastName);

  const signedAtRaw =
    pickMembershipField(flat, "applicationSignedAt") ||
    payload?.submittedAt ||
    payload?.submitted_at ||
    payload?.data?.submittedAt ||
    payload?.data?.submitted_at ||
    null;

  return {
    firstName,
    middleName,
    lastName,
    email,
    phone: cleanPhone(pickMembershipField(flat, "phone")),
    gender: pickMembershipField(flat, "gender"),
    dateOfBirth: parseUsDate(pickMembershipField(flat, "dateOfBirth")),
    addressLine1: pickMembershipField(flat, "addressLine1"),
    addressLine2: pickMembershipField(flat, "addressLine2"),
    city: pickMembershipField(flat, "city"),
    state: pickMembershipField(flat, "state"),
    postalCode: pickMembershipField(flat, "postalCode"),
    country: pickMembershipField(flat, "country"),
    nextOfKinFirstName: pickMembershipField(flat, "nextOfKinFirstName"),
    nextOfKinLastName: pickMembershipField(flat, "nextOfKinLastName"),
    nextOfKinPhone: cleanPhone(pickMembershipField(flat, "nextOfKinPhone")),
    nextOfKinRelationship: pickMembershipField(flat, "nextOfKinRelationship"),
    signatureName: pickMembershipField(flat, "signatureName"),
    displayName,
    applicationSignedAt: parseSignedAt(signedAtRaw) || signedAtRaw,
  };
}

function parseSignedAt(value) {
  const m = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const month = String(m[1]).padStart(2, "0");
  const day = String(m[2]).padStart(2, "0");
  if (m[4] != null) {
    const hour = String(m[4]).padStart(2, "0");
    return `${m[3]}-${month}-${day}T${hour}:${m[5]}:00`;
  }
  return `${m[3]}-${month}-${day}`;
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

function reprocessMembershipApplication(applicationId) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = db
    .prepare(
      `SELECT id, kind, member_id AS memberId, payload_json AS payloadJson, status
       FROM flexxforms_applications WHERE id = ?`
    )
    .get(applicationId);
  if (!row) throw new Error("Application not found");
  if (row.kind !== "membership") throw new Error("Only membership applications can be reprocessed");
  if (!row.payloadJson) throw new Error("Application has no stored submission payload");
  if (row.status === "approved") {
    throw new Error("Approved applications cannot be reprocessed automatically");
  }

  let payload;
  try {
    payload = JSON.parse(row.payloadJson);
  } catch (_) {
    throw new Error("Stored submission payload is invalid JSON");
  }

  const parsed = parseFlexxFormsMembershipPayload(payload);
  if (!parsed.displayName && !parsed.email) {
    throw new Error("Submission is missing applicant name and email");
  }

  let memberId = row.memberId || null;
  if (memberId) {
    const member = db.prepare(`SELECT id, name FROM members WHERE id = ?`).get(memberId);
    if (!member) memberId = null;
  }

  if (!memberId) {
    return processMembershipFormSubmission(applicationId, payload);
  }

  updateMemberProfile(memberId, {
    ...parsed,
    name: parsed.displayName,
    displayName: parsed.displayName,
    cooperativeAccountStatus: PENDING_ACCOUNT_STATUS,
    applicationSource: "FlexxForms membership application",
  });

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
     SET status = ?, applicant_name = ?, applicant_email = ?,
         processed_at = datetime('now'), processing_error = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, parsed.displayName, parsed.email || null, applicationId);

  return { ok: true, memberId, status: nextStatus, readiness, reprocessed: true };
}

function getProspectiveMemberDeleteBlockers(memberId) {
  const db = getDb();
  const profile = db
    .prepare(`SELECT cooperative_account_status AS accountStatus FROM member_profiles WHERE member_id = ?`)
    .get(memberId);

  if (!profile) {
    return "Linked member profile was not found.";
  }
  if (profile.accountStatus !== PENDING_ACCOUNT_STATUS) {
    return "Linked member is not pending approval. Remove the application only, or manage the member under Members & Accounts.";
  }

  const txCount =
    db.prepare(`SELECT COUNT(*) AS count FROM transactions WHERE member_id = ?`).get(memberId)?.count || 0;
  if (txCount > 0) {
    return "Linked member has ledger transactions. Reverse or reassign those before deleting the profile.";
  }

  const loanCount =
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM loans
         WHERE borrower_id = ? OR guarantor1_id = ? OR guarantor2_id = ?`
      )
      .get(memberId, memberId, memberId)?.count || 0;
  if (loanCount > 0) {
    return "Linked member has loan records. Remove those before deleting the profile.";
  }

  return null;
}

function deleteProspectiveMember(memberId) {
  const db = getDb();
  const blocker = getProspectiveMemberDeleteBlockers(memberId);
  if (blocker) throw new Error(blocker);

  const userIds = db.prepare(`SELECT id FROM users WHERE member_id = ?`).all(memberId).map((row) => row.id);
  for (const userId of userIds) {
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  }
  db.prepare(`DELETE FROM users WHERE member_id = ?`).run(memberId);
  db.prepare(`DELETE FROM members WHERE id = ?`).run(memberId);
}

function deleteMembershipApplication(applicationId) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);

  const app = db
    .prepare(
      `SELECT id, kind, status, member_id AS memberId
       FROM flexxforms_applications WHERE id = ?`
    )
    .get(applicationId);
  if (!app) throw new Error("Application not found");
  if (app.kind !== "membership") {
    throw new Error("Only membership applications can be deleted here");
  }
  if (app.status === "approved") {
    throw new Error("Approved applications cannot be deleted. Manage the member under Members & Accounts.");
  }

  const memberId = app.memberId || null;
  let memberRemoved = false;
  let applicationOnly = false;

  const run = db.transaction(() => {
    if (app.status === "duplicate") {
      db.prepare(`DELETE FROM flexxforms_applications WHERE id = ?`).run(applicationId);
      applicationOnly = true;
      return;
    }

    if (memberId) {
      const otherApps =
        db
          .prepare(`SELECT COUNT(*) AS count FROM flexxforms_applications WHERE member_id = ? AND id != ?`)
          .get(memberId, applicationId)?.count || 0;
      if (otherApps > 0) {
        db.prepare(`DELETE FROM flexxforms_applications WHERE id = ?`).run(applicationId);
        applicationOnly = true;
        return;
      }
      deleteProspectiveMember(memberId);
      memberRemoved = true;
    }

    db.prepare(`DELETE FROM flexxforms_applications WHERE id = ?`).run(applicationId);
  });

  run();

  return {
    ok: true,
    applicationId,
    memberId,
    memberRemoved,
    applicationOnly,
  };
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
  reprocessMembershipApplication,
  deleteMembershipApplication,
  refreshMembershipApplicationStatus,
  approveMembershipApplication,
  getApplicantPaymentReadiness,
  listMembershipApplications,
  ensureMembershipApplicationSchema,
};
