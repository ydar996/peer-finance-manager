/**
 * FlexxForms loan applications (all tenants).
 * Submissions are stored for Coop Admin review; approve creates a PFM loan.
 */
const { getDb } = require("../db/database");
const { DEFAULT_LOAN_TERM_MONTHS } = require("./constants");
const {
  createLoan,
  validateLoanApplication,
  generateAmortizationSchedule,
  summarizeSchedule,
  loanCoveredByDeposits,
  isEligibleForLoan,
} = require("./loan-service");
const { getLoanAnnualRate, normalizeAnnualRate } = require("./loan-policy-service");
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

  const existing = getLoanApplicationRow(applicationId);
  const keepStatus = [
    "terms_offered",
    "terms_accepted",
    "terms_rejected",
    "approved",
    "rejected",
  ].includes(existing?.status);
  const nextStatus = keepStatus ? existing.status : "pending_review";

  db.prepare(
    `UPDATE flexxforms_applications
     SET applicant_name = ?, applicant_email = ?, member_id = COALESCE(?, member_id),
         status = ?, processing_error = ?,
         processed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    parsed.applicantName || null,
    parsed.email || null,
    memberId,
    nextStatus,
    keepStatus ? existing.processingError : processingError,
    applicationId
  );

  return {
    applicationId,
    memberId: memberId || existing?.memberId || null,
    parsed,
    status: nextStatus,
  };
}

function parseTermsJson(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function presentTerms(terms) {
  if (!terms) return null;
  const schedule = Array.isArray(terms.schedule) ? terms.schedule : [];
  const summary = summarizeSchedule(schedule);
  return {
    principal: Number(terms.principal) || 0,
    termMonths: Number(terms.termMonths) || DEFAULT_LOAN_TERM_MONTHS,
    annualRate: Number(terms.annualRate) || getLoanAnnualRate(),
    startDate: terms.startDate || null,
    schedule,
    monthlyPayment: terms.monthlyPayment ?? summary.monthlyPayment,
    totalInterest: terms.totalInterest ?? summary.totalInterest,
    totalPayable: terms.totalPayable ?? summary.totalPayable,
    offeredAt: terms.offeredAt || null,
    offeredByUserId: terms.offeredByUserId || null,
    acceptedAt: terms.acceptedAt || null,
    acceptedByMemberId: terms.acceptedByMemberId || null,
    rejectedAt: terms.rejectedAt || null,
    rejectedByMemberId: terms.rejectedByMemberId || null,
    coveredByDeposits: Boolean(terms.coveredByDeposits),
    depositBalance: terms.depositBalance ?? null,
  };
}

function buildOfferedTerms({
  borrowerId,
  principal,
  termMonths,
  annualRate,
  startDate,
  offeredByUserId = null,
}) {
  const amount = parseMoney(principal);
  if (amount == null || amount <= 0) {
    const err = new Error("Loan amount is required");
    err.status = 400;
    throw err;
  }
  const months = parseMonths(termMonths) || DEFAULT_LOAN_TERM_MONTHS;
  const rate = annualRate != null && annualRate !== "" ? normalizeAnnualRate(annualRate) : getLoanAnnualRate();
  const start = String(startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const coverage = loanCoveredByDeposits(borrowerId, amount);
  if (!coverage.covered) {
    const err = new Error(
      `This amount is more than the member's contributions account (${coverage.depositBalance.toFixed(
        2
      )}). Two guarantors are required for amounts above contributions. That workflow is next.`
    );
    err.status = 400;
    throw err;
  }
  const eligibility = isEligibleForLoan(borrowerId, start);
  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason);
    err.status = 400;
    throw err;
  }
  const schedule = generateAmortizationSchedule(amount, rate, months, start);
  const summary = summarizeSchedule(schedule);
  return {
    principal: amount,
    termMonths: months,
    annualRate: rate,
    startDate: start,
    schedule,
    ...summary,
    coveredByDeposits: true,
    depositBalance: coverage.depositBalance,
    offeredAt: new Date().toISOString(),
    offeredByUserId: offeredByUserId || null,
    acceptedAt: null,
    acceptedByMemberId: null,
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
              terms_json AS termsJson,
              created_at AS createdAt, processed_at AS processedAt,
              approved_at AS approvedAt, approved_by_user_id AS approvedByUserId,
              disbursement_tx_id AS disbursementTxId
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
              terms_json AS termsJson,
              created_at AS createdAt, processed_at AS processedAt, approved_at AS approvedAt,
              disbursement_tx_id AS disbursementTxId
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
      disbursementTxId: row.disbursementTxId || null,
      awaitingBankDisbursement: row.status === "approved" && !row.disbursementTxId,
      applicantName: row.applicantName || parsed.applicantName || null,
      applicantEmail: row.applicantEmail || parsed.email || null,
      processingError: row.processingError,
      createdAt: row.createdAt,
      processedAt: row.processedAt,
      approvedAt: row.approvedAt,
      parsed: {
        principal: parsed.principal,
        termMonths: parsed.termMonths || DEFAULT_LOAN_TERM_MONTHS,
        purpose: parsed.purpose,
        guarantor1Name: parsed.guarantor1Name,
        guarantor2Name: parsed.guarantor2Name,
        startDate: parsed.startDate,
        notes: parsed.notes,
        phone: parsed.phone,
        answerSummary: parsed.answerSummary || [],
      },
      terms: presentTerms(parseTermsJson(row.termsJson)),
      coverage:
        row.memberId && parsed.principal != null
          ? loanCoveredByDeposits(row.memberId, parsed.principal)
          : null,
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
    parsed: {
      ...parsed,
      termMonths: parsed.termMonths || DEFAULT_LOAN_TERM_MONTHS,
    },
    terms: presentTerms(parseTermsJson(row.termsJson)),
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
  const sameMember = Number(row.memberId) === Number(memberId);
  const keepTerms =
    sameMember && ["terms_offered", "terms_accepted", "terms_rejected"].includes(row.status);
  db.prepare(
    `UPDATE flexxforms_applications
     SET member_id = ?, processing_error = NULL, status = ?,
         terms_json = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    Number(memberId),
    keepTerms ? row.status : "pending_review",
    keepTerms ? row.termsJson : null,
    applicationId
  );
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
  const keepStatus = ["terms_offered", "terms_accepted", "terms_rejected", "rejected"].includes(
    row.status
  );
  db.prepare(
    `UPDATE flexxforms_applications
     SET member_id = ?, processing_error = NULL, status = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(user.memberId, keepStatus ? row.status : "pending_review", row.id);
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

function previewLoanTerms(applicationId, overrides = {}) {
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  const borrowerId = Number(overrides.borrowerId || row.memberId);
  if (!borrowerId) {
    const err = new Error("Link an active borrower member before offering terms");
    err.status = 400;
    throw err;
  }
  let payload = {};
  try {
    payload = JSON.parse(row.payloadJson || "{}");
  } catch {
    payload = {};
  }
  const parsed = parseFlexxFormsLoanPayload(payload);
  const terms = buildOfferedTerms({
    borrowerId,
    principal: overrides.principal ?? parsed.principal,
    termMonths: overrides.termMonths ?? parsed.termMonths ?? DEFAULT_LOAN_TERM_MONTHS,
    annualRate: overrides.annualRate ?? overrides.annualRatePercent,
    startDate: overrides.startDate || parsed.startDate,
    offeredByUserId: overrides.offeredByUserId || null,
  });
  return { applicationId: Number(applicationId), borrowerId, terms };
}

async function offerLoanTerms(applicationId, offeredByUserId, overrides = {}) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  if (row.status === "approved") {
    const err = new Error("Approved applications cannot receive new terms");
    err.status = 400;
    throw err;
  }
  if (row.status === "rejected") {
    const err = new Error("Rejected applications cannot receive terms");
    err.status = 400;
    throw err;
  }
  const preview = previewLoanTerms(applicationId, {
    ...overrides,
    offeredByUserId,
  });
  db.prepare(
    `UPDATE flexxforms_applications
     SET terms_json = ?, status = 'terms_offered', processing_error = NULL,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(preview.terms), applicationId);

  const { notifyLoanTermsOffered } = require("./loan-application-notify");
  const notice = await notifyLoanTermsOffered({
    memberId: preview.borrowerId,
    terms: preview.terms,
    applicationId,
  });
  return {
    applicationId: Number(applicationId),
    status: "terms_offered",
    terms: preview.terms,
    notice,
  };
}

function listMemberLoanApplications(memberId) {
  const id = Number(memberId);
  if (!Number.isInteger(id) || id <= 0) return [];
  return listLoanApplications().filter((row) => Number(row.memberId) === id);
}

function acceptLoanTerms(user, applicationId) {
  if (user?.role !== "member" || !user.memberId) {
    const err = new Error("Member account required");
    err.status = 403;
    throw err;
  }
  const { assertActiveDirectoryMember } = require("./membership-status-service");
  assertActiveDirectoryMember(user.memberId, { action: "Loan applications" });
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  if (Number(row.memberId) !== Number(user.memberId)) {
    const err = new Error("This application is not yours");
    err.status = 403;
    throw err;
  }
  if (row.status === "approved") {
    return getLoanApplicationDetail(row.id);
  }
  if (row.status === "terms_accepted") {
    return getLoanApplicationDetail(row.id);
  }
  if (row.status !== "terms_offered") {
    const err = new Error("Repayment terms have not been offered yet");
    err.status = 400;
    throw err;
  }
  const terms = presentTerms(parseTermsJson(row.termsJson));
  if (!terms) {
    const err = new Error("Repayment terms were not found on this application");
    err.status = 400;
    throw err;
  }
  terms.acceptedAt = new Date().toISOString();
  terms.acceptedByMemberId = Number(user.memberId);
  db.prepare(
    `UPDATE flexxforms_applications
     SET terms_json = ?, status = 'terms_accepted', updated_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(terms), applicationId);
  return getLoanApplicationDetail(applicationId);
}

function rejectLoanTerms(user, applicationId) {
  if (user?.role !== "member" || !user.memberId) {
    const err = new Error("Member account required");
    err.status = 403;
    throw err;
  }
  const { assertActiveDirectoryMember } = require("./membership-status-service");
  assertActiveDirectoryMember(user.memberId, { action: "Loan applications" });
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  if (Number(row.memberId) !== Number(user.memberId)) {
    const err = new Error("This application is not yours");
    err.status = 403;
    throw err;
  }
  if (row.status === "approved") {
    const err = new Error("Approved loans cannot be rejected here");
    err.status = 400;
    throw err;
  }
  if (row.status === "terms_rejected") {
    return getLoanApplicationDetail(row.id);
  }
  if (row.status !== "terms_offered") {
    const err = new Error("Repayment terms have not been offered yet");
    err.status = 400;
    throw err;
  }
  const terms = presentTerms(parseTermsJson(row.termsJson)) || {};
  terms.rejectedAt = new Date().toISOString();
  terms.rejectedByMemberId = Number(user.memberId);
  db.prepare(
    `UPDATE flexxforms_applications
     SET terms_json = ?, status = 'terms_rejected', updated_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(terms), applicationId);
  return getLoanApplicationDetail(applicationId);
}

async function approveLoanApplication(applicationId, approvedByUserId, overrides = {}) {
  const db = getDb();
  ensureMembershipApplicationSchema(db);
  const row = getLoanApplicationRow(applicationId);
  if (!row) {
    const err = new Error("Loan application not found");
    err.status = 404;
    throw err;
  }
  if (row.status === "approved" && row.loanId) {
    const existingTerms = presentTerms(parseTermsJson(row.termsJson));
    return {
      applicationId,
      loanId: row.loanId,
      principal: existingTerms?.principal || null,
      alreadyApproved: true,
      awaitingBankDisbursement: !row.disbursementTxId,
    };
  }
  if (row.status !== "terms_accepted") {
    const err = new Error(
      "The member must Accept Terms in the portal before this loan can be approved."
    );
    err.status = 400;
    throw err;
  }

  let payload = {};
  try {
    payload = JSON.parse(row.payloadJson || "{}");
  } catch {
    payload = {};
  }
  const parsed = parseFlexxFormsLoanPayload(payload);
  const terms = presentTerms(parseTermsJson(row.termsJson));
  const borrowerId = Number(overrides.borrowerId || row.memberId);
  if (!borrowerId) {
    const err = new Error("Link an active borrower member before approving");
    err.status = 400;
    throw err;
  }
  if (!terms) {
    const err = new Error("Accepted repayment terms were not found");
    err.status = 400;
    throw err;
  }

  const principal = terms.principal;
  const termMonths = terms.termMonths;
  const annualRate = terms.annualRate;
  const startDate = terms.startDate;
  const guarantor1Id = resolveGuarantorId(overrides.guarantor1Id, parsed.guarantor1Name);
  const guarantor2Id = resolveGuarantorId(overrides.guarantor2Id, parsed.guarantor2Name);

  const validation = validateLoanApplication({
    borrowerId,
    principal,
    guarantor1Id: terms.coveredByDeposits ? null : guarantor1Id,
    guarantor2Id: terms.coveredByDeposits ? null : guarantor2Id,
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
    terms.coveredByDeposits ? "No guarantors: amount covered by contributions" : null,
    parsed.notes || null,
    overrides.notes || null,
  ].filter(Boolean);

  const loanId = createLoan({
    borrowerId,
    principal,
    annualRate,
    termMonths,
    startDate,
    guarantor1Id: terms.coveredByDeposits ? null : guarantor1Id,
    guarantor2Id: terms.coveredByDeposits ? null : guarantor2Id,
    notes: noteParts.join(" | "),
  });

  db.prepare(
    `UPDATE flexxforms_applications
     SET status = 'approved', member_id = ?, loan_id = ?,
         approved_at = datetime('now'), approved_by_user_id = ?,
         processing_error = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(borrowerId, loanId, approvedByUserId || null, applicationId);

  let notice = { portalPosted: false, emailStatus: "skipped" };
  try {
    const { notifyLoanApplicationApproved } = require("./loan-application-notify");
    notice = await notifyLoanApplicationApproved({
      memberId: borrowerId,
      terms,
      applicationId,
      loanId,
    });
  } catch (err) {
    notice = { portalPosted: false, emailStatus: "failed", error: err.message };
  }

  return {
    applicationId: Number(applicationId),
    loanId,
    borrowerId,
    principal,
    termMonths,
    annualRate,
    guarantor1Id: terms.coveredByDeposits ? null : guarantor1Id,
    guarantor2Id: terms.coveredByDeposits ? null : guarantor2Id,
    maxAmount: validation.maxAmount,
    notice,
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
  listMemberLoanApplications,
  getLoanApplicationDetail,
  linkLoanApplicationMember,
  claimLoanApplicationForMember,
  previewLoanTerms,
  offerLoanTerms,
  acceptLoanTerms,
  rejectLoanTerms,
  approveLoanApplication,
  rejectLoanApplication,
  deleteLoanApplication,
};
