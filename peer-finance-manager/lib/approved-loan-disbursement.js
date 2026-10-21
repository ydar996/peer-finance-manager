/**
 * Match an approved FlexxForms loan to the bank outflow that funds it.
 * The member loan account and Loans portfolio stay empty until that
 * loan_disbursement is on the books.
 */
const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const { typeLabelForLedger } = require("./transaction-import-types");
const { validateParsedRow } = require("./statement-import-parser");

const AMOUNT_TOLERANCE = 0.02;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function amountsMatch(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= AMOUNT_TOLERANCE;
}

function parseTerms(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function listPendingApprovedLoans() {
  const db = getDb();
  try {
    const { ensureMembershipApplicationSchema } = require("./flexxforms-membership-service");
    ensureMembershipApplicationSchema(db);
  } catch (_) {
    /* schema helper missing in some tests */
  }
  let rows = [];
  try {
    rows = db
      .prepare(
        `SELECT a.id AS applicationId,
                a.member_id AS memberId,
                a.loan_id AS loanId,
                a.terms_json AS termsJson,
                a.approved_at AS approvedAt,
                a.disbursement_tx_id AS disbursementTxId,
                COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName
         FROM flexxforms_applications a
         JOIN members m ON m.id = a.member_id
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         WHERE a.kind = 'loan'
           AND a.status = 'approved'
           AND a.member_id IS NOT NULL
           AND (a.disbursement_tx_id IS NULL OR a.disbursement_tx_id = 0)
         ORDER BY a.approved_at ASC, a.id ASC`
      )
      .all();
  } catch (_) {
    return [];
  }
  return rows
    .map((row) => {
      const terms = parseTerms(row.termsJson);
      const principal = Number(terms?.principal);
      if (!(principal > 0.005)) return null;
      return {
        applicationId: Number(row.applicationId),
        memberId: Number(row.memberId),
        loanId: row.loanId ? Number(row.loanId) : null,
        memberName: row.memberName || "Member",
        principal: round2(principal),
        terms,
        approvedAt: row.approvedAt,
      };
    })
    .filter(Boolean);
}

function isOutflowCandidate(row) {
  const type = String(row?.ledgerType || "");
  if (
    type === TRANSACTION_TYPES.DEPOSIT ||
    type === TRANSACTION_TYPES.LOAN_REPAYMENT ||
    type === TRANSACTION_TYPES.DISTRIBUTION
  ) {
    return false;
  }
  if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT) return true;
  return Number(row?.amount) < -0.005;
}

function descriptionMentionsMember(description, memberName) {
  const desc = String(description || "").toLowerCase();
  const parts = String(memberName || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 2);
  return parts.some((part) => desc.includes(part));
}

function matchPendingApprovedLoan(row, pending, claimedIds) {
  if (!isOutflowCandidate(row)) return null;
  const amount = Math.abs(Number(row.amount || 0));
  if (!(amount > 0.005)) return null;
  const rowMember = String(row.member || "").trim().toLowerCase();
  const candidates = pending.filter((app) => {
    if (claimedIds.has(app.applicationId)) return false;
    if (!amountsMatch(amount, app.principal)) return false;
    if (rowMember && rowMember !== String(app.memberName || "").trim().toLowerCase()) {
      return false;
    }
    return true;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aHint = descriptionMentionsMember(row.description, a.memberName) ? 0 : 1;
    const bHint = descriptionMentionsMember(row.description, b.memberName) ? 0 : 1;
    if (aHint !== bHint) return aHint - bHint;
    return a.applicationId - b.applicationId;
  });
  return candidates[0];
}

function applyApprovedLoanDisbursementMatches(previewRows, memberNames = []) {
  const pending = listPendingApprovedLoans();
  if (!pending.length || !Array.isArray(previewRows)) return previewRows;
  const claimed = new Set();
  for (const row of previewRows) {
    if (!row || row.bucket === "skipped") continue;
    const match = matchPendingApprovedLoan(row, pending, claimed);
    if (!match) continue;
    claimed.add(match.applicationId);
    row.ledgerType = TRANSACTION_TYPES.LOAN_DISBURSEMENT;
    row.typeLabel = typeLabelForLedger(TRANSACTION_TYPES.LOAN_DISBURSEMENT);
    row.member = match.memberName;
    row.approvedApplicationId = match.applicationId;
    row.matchNote = "Approved loan amount: will open the member loan account";
    if (!row.userOverride) row.typeSource = "approved_loan";
    const issues = validateParsedRow(
      {
        date: row.date,
        description: row.description,
        amount: row.amount,
        ledgerType: row.ledgerType,
        member: row.member,
        typeSource: "explicit",
        reference: row.reference,
      },
      memberNames
    );
    row.issues = issues;
    row.bucket = issues.length ? "needsReview" : "ready";
  }
  return previewRows;
}

function markApprovedLoanDisbursed({
  applicationId,
  transactionId,
  disbursementDate,
  memberId,
} = {}) {
  const id = Number(applicationId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const db = getDb();
  const { ensureMembershipApplicationSchema } = require("./flexxforms-membership-service");
  ensureMembershipApplicationSchema(db);
  const row = db
    .prepare(
      `SELECT id, loan_id AS loanId, terms_json AS termsJson, member_id AS memberId
       FROM flexxforms_applications
       WHERE id = ? AND kind = 'loan'`
    )
    .get(id);
  if (!row) return null;

  const date = String(disbursementDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const terms = parseTerms(row.termsJson) || {};
  if (terms.principal && terms.termMonths && terms.annualRate != null) {
    try {
      const { generateAmortizationSchedule, summarizeSchedule } = require("./loan-service");
      const schedule = generateAmortizationSchedule(
        terms.principal,
        terms.annualRate,
        terms.termMonths,
        date
      );
      Object.assign(terms, summarizeSchedule(schedule), {
        schedule,
        startDate: date,
        disbursedAt: date,
        firstDueDate: schedule[0]?.dueDate || null,
      });
      db.prepare(
        `UPDATE flexxforms_applications SET terms_json = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(JSON.stringify(terms), id);
      if (row.loanId) {
        db.prepare(`UPDATE loans SET start_date = ? WHERE id = ?`).run(date, row.loanId);
        db.prepare(`DELETE FROM loan_installments WHERE loan_id = ?`).run(row.loanId);
        const insertInst = db.prepare(
          `INSERT INTO loan_installments
            (loan_id, installment_number, due_date, principal_due, interest_due, total_due)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const inst of schedule) {
          insertInst.run(
            row.loanId,
            inst.installmentNumber,
            inst.dueDate,
            inst.principalDue,
            inst.interestDue,
            inst.totalDue
          );
        }
      }
    } catch (_) {
      /* schedule realign is best-effort */
    }
  }

  try {
    db.prepare(
      `UPDATE flexxforms_applications
       SET disbursement_tx_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(Number(transactionId) || null, id);
  } catch (_) {
    /* column may be missing in an old test DB */
  }

  return {
    applicationId: id,
    loanId: row.loanId || null,
    memberId: memberId || row.memberId,
    disbursementTxId: Number(transactionId) || null,
    disbursementDate: date,
  };
}

function findApprovedTermsForLot(memberId, lot) {
  const id = Number(memberId);
  if (!Number.isInteger(id) || id <= 0 || !lot) return null;
  const pendingOrLinked = listApprovedLoansForMember(id);
  const principal = Number(lot.principal || 0);
  const disbId = Number(lot.disbursementId || 0);
  const byTx = pendingOrLinked.find((row) => disbId && Number(row.disbursementTxId) === disbId);
  if (byTx?.terms) return byTx.terms;
  return (
    pendingOrLinked.find((row) => amountsMatch(row.principal, principal) && row.terms)?.terms ||
    null
  );
}

function listApprovedLoansForMember(memberId) {
  const db = getDb();
  try {
    const { ensureMembershipApplicationSchema } = require("./flexxforms-membership-service");
    ensureMembershipApplicationSchema(db);
  } catch (_) {}
  let rows = [];
  try {
    rows = db
      .prepare(
        `SELECT id, terms_json AS termsJson, disbursement_tx_id AS disbursementTxId
         FROM flexxforms_applications
         WHERE kind = 'loan' AND status = 'approved' AND member_id = ?
         ORDER BY id DESC`
      )
      .all(memberId);
  } catch (_) {
    return [];
  }
  return rows
    .map((row) => {
      const terms = parseTerms(row.termsJson);
      const principal = Number(terms?.principal);
      if (!(principal > 0.005)) return null;
      return {
        applicationId: row.id,
        principal: round2(principal),
        terms,
        disbursementTxId: row.disbursementTxId,
      };
    })
    .filter(Boolean);
}

function applyApprovedLoanScheduleToLot(lot, memberId) {
  const terms = findApprovedTermsForLot(memberId, lot);
  const schedule = Array.isArray(terms?.schedule) ? terms.schedule : [];
  if (!terms || !schedule.length) return false;
  const { computeInterestFromSchedule } = require("./loan-details-reference");
  lot.scheduleTitle = "Approved Repayment Schedule";
  lot.scheduledTotalInterest = Number(terms.totalInterest || 0);
  lot.scheduledMonthlyPayment = Number(terms.monthlyPayment || 0);
  lot.scheduledTotalPayable = Number(terms.totalPayable || 0);
  lot.schedule = schedule.map((row) => ({
    dueDate: row.dueDate || row.due_date,
    principal: row.principalDue ?? row.principal,
    interest: row.interestDue ?? row.interest,
    principalDue: row.principalDue ?? row.principal,
    interestDue: row.interestDue ?? row.interest,
    totalDue: row.totalDue ?? row.total_due,
  }));
  const payoffTarget =
    lot.scheduledTotalPayable > 0.005 ? lot.scheduledTotalPayable : lot.principal;
  const fullyPaid = Number(lot.collected || 0) >= payoffTarget - 0.005;
  if (fullyPaid && lot.scheduledTotalInterest > 0.005) {
    lot.interestIncome = lot.scheduledTotalInterest;
  } else {
    lot.interestIncome = computeInterestFromSchedule(lot.collected, lot.schedule).interestEarned;
  }
  const loanPrincipal = Number(lot.principal || 0);
  lot.principalRepaid = Math.min(
    loanPrincipal,
    Math.max(0, Number(lot.collected || 0) - Number(lot.interestIncome || 0))
  );
  lot.outstanding = Math.max(0, round2(loanPrincipal - lot.principalRepaid));
  lot.status = fullyPaid || lot.collected >= loanPrincipal - 0.005 ? "paid" : "active";
  if (lot.status === "paid") {
    lot.outstanding = 0;
    lot.principalRepaid = loanPrincipal;
  }
  return true;
}

module.exports = {
  AMOUNT_TOLERANCE,
  listPendingApprovedLoans,
  matchPendingApprovedLoan,
  applyApprovedLoanDisbursementMatches,
  markApprovedLoanDisbursed,
  findApprovedTermsForLot,
  applyApprovedLoanScheduleToLot,
};
