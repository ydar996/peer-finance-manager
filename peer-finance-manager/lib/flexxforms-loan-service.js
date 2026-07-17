/**
 * FlexxForms loan applications (all tenants).
 * Submissions are stored for Coop Admin review; approve creates a PFM loan.
 */
const { getDb } = require("../db/database");
const {
  DEFAULT_LOAN_ANNUAL_RATE,
  DEFAULT_LOAN_TERM_MONTHS,
} = require("./constants");
const { createLoan, validateLoanApplication } = require("./loan-service");
const { ACTIVE_DIRECTORY_SQL } = require("./membership-status-service");
const {
  findAnswersArray,
  ensureMembershipApplicationSchema,
} = require("./flexxforms-membership-service");

const LOAN_FIELD_LABELS = {
  applicantName: ["Applicant Name", "Borrower Name", "Full Name"],
  firstName: ["First Name", "Borrower First Name"],
  lastName: ["Last Name", "Borrower Last Name"],
  email: ["Email", "Applicant Email", "Borrower Email"],
  phone: ["Phone", "Mobile", "Telephone"],
  principal: [
    "Loan Amount",
    "Amount Requested",
    "Principal",
    "Requested Amount",
    "Amount",
  ],
  termMonths: ["Term (Months)", "Loan Term", "Term Months", "Term", "Months"],
  purpose: ["Purpose", "Loan Purpose", "Reason", "Use of Funds"],
  guarantor1Name: ["Guarantor 1", "Guarantor 1 Name", "First Guarantor"],
  guarantor2Name: ["Guarantor 2", "Guarantor 2 Name", "Second Guarantor"],
  startDate: ["Start Date", "Requested Start Date", "Disbursement Date"],
  notes: ["Notes", "Additional Notes", "Comments"],
};

function normalizeLabel(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseMoney(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseMonths(value) {
  const n = parseMoney(value);
  if (n == null) return null;
  return Math.max(1, Math.round(n));
}

function answerText(row) {
  if (!row) return "";
  const v = row.value;
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (typeof v === "object") {
    if (v.fullName) return String(v.fullName).trim();
    if (v.first || v.last) {
      return [v.first, v.middle, v.last].filter(Boolean).join(" ").trim();
    }
    if (v.text) return String(v.text).trim();
  }
  return String(v).trim();
}

function pickAnswer(answers, labels) {
  const wanted = labels.map(normalizeLabel).filter(Boolean);
  for (const row of answers || []) {
    const label = normalizeLabel(row.label || row.fieldLabel || "");
    if (wanted.includes(label)) {
      const text = answerText(row);
      if (text) return text;
    }
  }
  for (const row of answers || []) {
    const label = normalizeLabel(row.label || row.fieldLabel || "");
    if (!label || label.includes("guarantor")) continue;
    for (const w of wanted) {
      if (w.length < 5) continue;
      if (label.includes(w) || (label.length >= 5 && w.includes(label))) {
        const text = answerText(row);
        if (text) return text;
      }
    }
  }
  return null;
}

function walkLabeledFields(payload, out = {}, depth = 0) {
  if (!payload || depth > 14) return out;
  if (Array.isArray(payload)) {
    for (const item of payload) walkLabeledFields(item, out, depth + 1);
    return out;
  }
  if (typeof payload !== "object") return out;
  const label = payload.label || payload.fieldLabel || payload.name;
  const value = payload.value ?? payload.answer ?? payload.response;
  if (label && value != null && typeof value !== "object") {
    out[normalizeLabel(label)] = String(value).trim();
  }
  for (const v of Object.values(payload)) {
    if (v && typeof v === "object") walkLabeledFields(v, out, depth + 1);
  }
  return out;
}

function parseFlexxFormsLoanPayload(payload) {
  const answers = findAnswersArray(payload) || [];
  const flat = walkLabeledFields(payload);
  const get = (key) => {
    const fromAnswers = pickAnswer(answers, LOAN_FIELD_LABELS[key] || []);
    if (fromAnswers) return fromAnswers;
    for (const label of LOAN_FIELD_LABELS[key] || []) {
      const hit = flat[normalizeLabel(label)];
      if (hit) return hit;
    }
    return null;
  };

  const firstName = get("firstName");
  const lastName = get("lastName");
  const applicantName =
    get("applicantName") ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    null;
  const email = (get("email") || "").toLowerCase() || null;
  const principal = parseMoney(get("principal"));
  const termMonths = parseMonths(get("termMonths"));
  const purpose = get("purpose");
  const guarantor1Name = get("guarantor1Name");
  const guarantor2Name = get("guarantor2Name");
  const startDate = get("startDate");
  const notes = get("notes");
  const phone = get("phone");

  const answerSummary = (answers || [])
    .map((row) => ({
      label: row.label || row.fieldLabel || "",
      value: answerText(row),
      fieldIndex: row.fieldIndex ?? row.index ?? null,
    }))
    .filter((row) => row.label || row.value);

  return {
    applicantName,
    firstName,
    lastName,
    email,
    phone,
    principal,
    termMonths,
    purpose,
    guarantor1Name,
    guarantor2Name,
    startDate,
    notes,
    answerSummary,
    hasAnswers: answerSummary.length > 0 || Boolean(applicantName || email || principal),
  };
}

function findMemberByEmail(email) {
  if (!email) return null;
  const db = getDb();
  const { ensureMembershipStatusColumns } = require("./membership-status-service");
  ensureMembershipStatusColumns(db);
  return (
    db
      .prepare(
        `SELECT m.id AS memberId,
                COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName,
                COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), '')) AS email
         FROM members m
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         LEFT JOIN users u ON u.member_id = m.id AND u.role = 'member' AND u.active = 1
         WHERE ${ACTIVE_DIRECTORY_SQL}
           AND lower(COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), ''))) = lower(?)
         LIMIT 1`
      )
      .get(String(email).trim()) || null
  );
}

function findMemberByName(name) {
  if (!name) return null;
  const db = getDb();
  const { ensureMembershipStatusColumns } = require("./membership-status-service");
  ensureMembershipStatusColumns(db);
  const needle = String(name).trim().toLowerCase();
  const rows = db
    .prepare(
      `SELECT m.id AS memberId,
              COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE ${ACTIVE_DIRECTORY_SQL}`
    )
    .all();
  const exact = rows.find((r) => String(r.memberName || "").trim().toLowerCase() === needle);
  return exact || null;
}

function processLoanFormSubmission(applicationId, payload) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const parsed = parseFlexxFormsLoanPayload(payload);
  let memberId = null;
  let processingError = null;

  if (parsed.email) {
    memberId = findMemberByEmail(parsed.email)?.memberId || null;
  }
  if (!memberId && parsed.applicantName) {
    memberId = findMemberByName(parsed.applicantName)?.memberId || null;
  }
  if (!memberId) {
    processingError =
      "Borrower not matched automatically. Link an active member before approving.";
  }

  db.prepare(
    `UPDATE flexxforms_applications
     SET applicant_name = ?, applicant_email = ?, member_id = ?,
         status = 'pending_review', processing_error = ?,
         processed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    parsed.applicantName || null,
    parsed.email || null,
    memberId,
    processingError,
    applicationId
  );

  return {
    applicationId,
    memberId,
    parsed,
    status: "pending_review",
  };
}

function getLoanApplicationRow(applicationId) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  return db
    .prepare(
      `SELECT id, kind, flexxforms_submission_id AS submissionId, form_id AS formId,
              status, member_id AS memberId, loan_id AS loanId,
              applicant_name AS applicantName, applicant_email AS applicantEmail,
              processing_error AS processingError, payload_json AS payloadJson,
              created_at AS createdAt, processed_at AS processedAt,
              approved_at AS approvedAt, approved_by_user_id AS approvedByUserId
       FROM flexxforms_applications
       WHERE id = ? AND kind = 'loan'`
    )
    .get(applicationId);
}

function listLoanApplications() {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const rows = db
    .prepare(
      `SELECT id, kind, flexxforms_submission_id AS submissionId, form_id AS formId,
              status, member_id AS memberId, loan_id AS loanId,
              applicant_name AS applicantName, applicant_email AS applicantEmail,
              processing_error AS processingError, payload_json AS payloadJson,
              created_at AS createdAt, processed_at AS processedAt, approved_at AS approvedAt
       FROM flexxforms_applications
       WHERE kind = 'loan'
       ORDER BY id DESC
       LIMIT 100`
    )
    .all();

  return rows.map((row) => {
    let parsed = {};
    try {
      parsed = parseFlexxFormsLoanPayload(JSON.parse(row.payloadJson || "{}"));
    } catch {
      parsed = {};
    }
    let memberName = null;
    if (row.memberId) {
      const m = db
        .prepare(
          `SELECT COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS name
           FROM members m
           LEFT JOIN member_profiles mp ON mp.member_id = m.id
           WHERE m.id = ?`
        )
        .get(row.memberId);
      memberName = m?.name || null;
    }
    return {
      id: row.id,
      kind: row.kind,
      submissionId: row.submissionId,
      formId: row.formId,
      status: row.status,
      memberId: row.memberId,
      memberName,
      loanId: row.loanId,
      applicantName: row.applicantName || parsed.applicantName || null,
      applicantEmail: row.applicantEmail || parsed.email || null,
      processingError: row.processingError,
      createdAt: row.createdAt,
      processedAt: row.processedAt,
      approvedAt: row.approvedAt,
      parsed: {
        principal: parsed.principal,
        termMonths: parsed.termMonths,
        purpose: parsed.purpose,
        guarantor1Name: parsed.guarantor1Name,
        guarantor2Name: parsed.guarantor2Name,
        startDate: parsed.startDate,
        notes: parsed.notes,
        phone: parsed.phone,
        answerSummary: parsed.answerSummary || [],
      },
    };
  });
}

function getLoanApplicationDetail(applicationId) {
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  let payload = {};
  try {
    payload = JSON.parse(row.payloadJson || "{}");
  } catch {
    payload = {};
  }
  const parsed = parseFlexxFormsLoanPayload(payload);
  const listed = listLoanApplications().find((a) => a.id === Number(applicationId));
  return {
    ...listed,
    payload,
    parsed,
  };
}

function linkLoanApplicationMember(applicationId, memberId) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  if (row.status === "approved") {
    const err = new Error("Approved applications cannot be re-linked");
    err.status = 400;
    throw err;
  }
  const { assertActiveDirectoryMember } = require("./membership-status-service");
  assertActiveDirectoryMember(Number(memberId), { action: "Loan applications" });
  db.prepare(
    `UPDATE flexxforms_applications
     SET member_id = ?, processing_error = NULL, status = 'pending_review',
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(Number(memberId), applicationId);
  return getLoanApplicationDetail(applicationId);
}

function claimLoanApplicationForMember(user, { submissionId, applicationId } = {}) {
  if (user?.role !== "member" || !user.memberId) {
    const err = new Error("Member account required");
    err.status = 403;
    throw err;
  }
  const { assertActiveDirectoryMember } = require("./membership-status-service");
  assertActiveDirectoryMember(user.memberId, { action: "Loan applications" });

  const db = getDb();
  ensureMembershipApplicationSchema(db);
  let row = null;
  if (applicationId) {
    row = getLoanApplicationRow(Number(applicationId));
  } else if (submissionId) {
    row = db
      .prepare(
        `SELECT id FROM flexxforms_applications
         WHERE kind = 'loan' AND flexxforms_submission_id = ?
         ORDER BY id DESC LIMIT 1`
      )
      .get(String(submissionId));
    if (row) row = getLoanApplicationRow(row.id);
  }
  if (!row) {
    const err = new Error("Loan application not found yet. Try again in a moment.");
    err.status = 404;
    throw err;
  }
  if (row.status === "approved") {
    return getLoanApplicationDetail(row.id);
  }
  if (row.memberId && Number(row.memberId) !== Number(user.memberId)) {
    const err = new Error("This application is linked to another member");
    err.status = 403;
    throw err;
  }
  db.prepare(
    `UPDATE flexxforms_applications
     SET member_id = ?, processing_error = NULL, status = 'pending_review',
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(user.memberId, row.id);
  return getLoanApplicationDetail(row.id);
}

function resolveGuarantorId(value, nameHint) {
  if (value != null && value !== "") {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) return id;
  }
  if (nameHint) {
    return findMemberByName(nameHint)?.memberId || null;
  }
  return null;
}

function approveLoanApplication(applicationId, approvedByUserId, overrides = {}) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  if (row.status === "approved" && row.loanId) {
    return { applicationId, loanId: row.loanId, alreadyApproved: true };
  }

  let payload = {};
  try {
    payload = JSON.parse(row.payloadJson || "{}");
  } catch {
    payload = {};
  }
  const parsed = parseFlexxFormsLoanPayload(payload);
  const borrowerId = Number(overrides.borrowerId || row.memberId);
  if (!borrowerId) {
    const err = new Error("Link an active borrower member before approving");
    err.status = 400;
    throw err;
  }

  const principal = parseMoney(overrides.principal ?? parsed.principal);
  const termMonths =
    parseMonths(overrides.termMonths ?? parsed.termMonths) || DEFAULT_LOAN_TERM_MONTHS;
  const annualRate =
    overrides.annualRate != null && overrides.annualRate !== ""
      ? Number(overrides.annualRate)
      : DEFAULT_LOAN_ANNUAL_RATE;
  const startDate =
    String(overrides.startDate || parsed.startDate || new Date().toISOString().slice(0, 10)).slice(
      0,
      10
    );
  const guarantor1Id = resolveGuarantorId(overrides.guarantor1Id, parsed.guarantor1Name);
  const guarantor2Id = resolveGuarantorId(overrides.guarantor2Id, parsed.guarantor2Name);

  if (principal == null || principal <= 0) {
    const err = new Error("Loan amount is required to approve");
    err.status = 400;
    throw err;
  }
  if (!guarantor1Id || !guarantor2Id) {
    const err = new Error(
      "Two guarantor member ids are required. Select them on Approve (guarantor names from the form are hints only)."
    );
    err.status = 400;
    throw err;
  }

  const validation = validateLoanApplication({
    borrowerId,
    principal,
    guarantor1Id,
    guarantor2Id,
    startDate,
  });
  if (!validation.valid) {
    const err = new Error(validation.errors.join("; "));
    err.status = 400;
    throw err;
  }

  const noteParts = [
    `FlexxForms loan application #${applicationId}`,
    parsed.purpose ? `Purpose: ${parsed.purpose}` : null,
    parsed.notes || null,
    overrides.notes || null,
  ].filter(Boolean);

  const loanId = createLoan({
    borrowerId,
    principal,
    annualRate: Number.isFinite(annualRate) ? annualRate : DEFAULT_LOAN_ANNUAL_RATE,
    termMonths,
    startDate,
    guarantor1Id,
    guarantor2Id,
    notes: noteParts.join(" | "),
  });

  db.prepare(
    `UPDATE flexxforms_applications
     SET status = 'approved', member_id = ?, loan_id = ?,
         approved_at = datetime('now'), approved_by_user_id = ?,
         processing_error = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(borrowerId, loanId, approvedByUserId || null, applicationId);

  return {
    applicationId: Number(applicationId),
    loanId,
    borrowerId,
    principal,
    termMonths,
    guarantor1Id,
    guarantor2Id,
    maxAmount: validation.maxAmount,
  };
}

function rejectLoanApplication(applicationId, reason) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  if (row.status === "approved") {
    const err = new Error("Approved applications cannot be rejected");
    err.status = 400;
    throw err;
  }
  db.prepare(
    `UPDATE flexxforms_applications
     SET status = 'rejected',
         processing_error = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(reason || "Rejected by Cooperative administrator", applicationId);
  return getLoanApplicationDetail(applicationId);
}

function deleteLoanApplication(applicationId) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  if (row.status === "approved") {
    const err = new Error("Approved applications stay on file. Delete is blocked.");
    err.status = 400;
    throw err;
  }
  db.prepare(`DELETE FROM flexxforms_applications WHERE id = ?`).run(applicationId);
  return { deleted: true, applicationId: Number(applicationId) };
}

module.exports = {
  parseFlexxFormsLoanPayload,
  processLoanFormSubmission,
  listLoanApplications,
  getLoanApplicationDetail,
  linkLoanApplicationMember,
  claimLoanApplicationForMember,
  approveLoanApplication,
  rejectLoanApplication,
  deleteLoanApplication,
};
