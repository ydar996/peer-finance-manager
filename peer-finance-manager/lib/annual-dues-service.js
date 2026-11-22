/**
 * Annual membership dues tracking for the "annual" fee model.
 *
 * Dues paid in a calendar year = total |membership_fee| transactions dated in
 * that year. Requirement for a year comes from the policy dues schedule
 * (explicit year amount, else latest prior amount, else current amount).
 * Recorded transactions are never rewritten when the amount changes.
 */
const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const {
  getMembershipPolicy,
  duesRequirementForYear,
  FEE_MODEL_ANNUAL,
} = require("./membership-policy-service");

function currentDuesYear() {
  return new Date().getUTCFullYear();
}

function isAnnualFeeModel() {
  return getMembershipPolicy().feeModel === FEE_MODEL_ANNUAL;
}

function memberDuesPaid(memberId, year) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE member_id = ? AND type = ?
         AND transaction_date >= ? AND transaction_date <= ?`
    )
    .get(memberId, TRANSACTION_TYPES.MEMBERSHIP_FEE, `${year}-01-01`, `${year}-12-31`);
  return -Number(row.total || 0) + 0;
}

/** Per-active-member dues status for a year. */
function getAnnualDuesStatus(year = currentDuesYear()) {
  const db = getDb();
  const policy = getMembershipPolicy();
  const required = duesRequirementForYear(year, policy.annualDuesAmount);
  const { ACTIVE_DIRECTORY_SQL } = require("./membership-status-service");
  const members = db
    .prepare(
      `SELECT m.id, m.name, m.member_number
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE ${ACTIVE_DIRECTORY_SQL}
       ORDER BY m.name COLLATE NOCASE`
    )
    .all();
  const rows = members.map((m) => {
    const paid = memberDuesPaid(m.id, year);
    const outstanding = Math.max(0, Math.round((required - paid) * 100) / 100);
    return {
      memberId: m.id,
      name: m.name,
      memberNo: m.member_number || "",
      paid: Math.round(paid * 100) / 100,
      required,
      outstanding,
      status:
        paid + 0.005 >= required ? "paid" : paid > 0 ? "partial" : "unpaid",
    };
  });
  return {
    year,
    feeModel: policy.feeModel,
    required,
    rows,
    totals: {
      members: rows.length,
      paid: rows.filter((r) => r.status === "paid").length,
      partial: rows.filter((r) => r.status === "partial").length,
      unpaid: rows.filter((r) => r.status === "unpaid").length,
      outstandingTotal:
        Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100,
    },
  };
}

/** Members with an outstanding dues balance for a year (for reminders). */
function listOutstandingDues(year = currentDuesYear()) {
  return getAnnualDuesStatus(year).rows.filter((r) => r.outstanding > 0);
}

module.exports = {
  currentDuesYear,
  isAnnualFeeModel,
  memberDuesPaid,
  getAnnualDuesStatus,
  listOutstandingDues,
};
