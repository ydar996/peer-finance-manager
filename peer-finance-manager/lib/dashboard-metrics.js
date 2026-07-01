const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const { getAllBankLoanLots, hasBankLoanLedger } = require("./loan-ledger-service");
const { calendarParts, getCooperativeTimezone } = require("./cooperative-time");

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function monthBounds(year, month) {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

function ytdBounds(year, month, day) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return {
    start: `${year}-01-01`,
    end: `${year}-${mm}-${dd}`,
  };
}

function sumDepositsBetween(startDate, endDate) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE type = ?
         AND amount > 0
         AND transaction_date >= ?
         AND transaction_date <= ?`
    )
    .get(TRANSACTION_TYPES.DEPOSIT, startDate, endDate);
  return round2(row.total || 0);
}

function pctChange(current, prior) {
  if (!prior || prior <= 0) {
    if (current > 0) return null;
    return 0;
  }
  return round2(((current - prior) / prior) * 100);
}

function formatPctChange(value) {
  if (value == null) return "new";
  if (value === 0) return "0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function parseDueMonth(dueDate) {
  if (!dueDate) return null;
  const iso = String(dueDate).slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function typicalPeriodPayment(period) {
  const explicit = Number(period.totalDue);
  const parts = round2(Number(period.interest || 0) + Number(period.principal || 0));
  if (explicit > 0.005) return explicit;
  if (parts > 0.005) return parts;
  return 0;
}

function monthlyPaymentFromLot(lot) {
  if (Number(lot.scheduledMonthlyPayment) > 0.005) {
    return round2(lot.scheduledMonthlyPayment);
  }
  for (const period of lot.schedule || []) {
    const payment = typicalPeriodPayment(period);
    if (payment > 0.005) return payment;
  }
  return 0;
}

function isMonthAfterDisbursement(disbursementDate, year, month) {
  const due = parseDueMonth(disbursementDate);
  if (!due) return false;
  if (year > due.year) return true;
  return year === due.year && month > due.month;
}

function expectedRepaymentForLotInMonth(lot, year, month) {
  if (lot.outstanding <= 0.005) return 0;

  const schedule = lot.schedule || [];
  const datedInMonth = schedule.filter((period) => {
    const due = parseDueMonth(period.dueDate);
    return due && due.year === year && due.month === month;
  });
  if (datedInMonth.length) {
    return round2(
      datedInMonth.reduce((sum, period) => sum + typicalPeriodPayment(period), 0)
    );
  }

  if (!isMonthAfterDisbursement(lot.disbursementDate, year, month)) return 0;

  const monthly = monthlyPaymentFromLot(lot);
  if (monthly <= 0) return 0;
  return round2(Math.min(monthly, lot.outstanding));
}

function sumRepaymentsReceivedInMonth(memberId, year, month) {
  const { start, end } = monthBounds(year, month);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE member_id = ?
         AND type = ?
         AND transaction_date >= ?
         AND transaction_date <= ?`
    )
    .get(memberId, TRANSACTION_TYPES.LOAN_REPAYMENT, start, end);
  return round2(row.total || 0);
}

function sumInstallmentRepaymentsDueInMonth(year, month) {
  const { start, end } = monthBounds(year, month);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(i.total_due - i.paid_amount), 0) AS total
       FROM loan_installments i
       JOIN loans l ON l.id = i.loan_id
       WHERE l.status = 'active'
         AND i.paid_amount < i.total_due
         AND i.due_date >= ?
         AND i.due_date <= ?`
    )
    .get(start, end);
  return round2(row.total || 0);
}

function sumBankLedgerRepaymentsDueInMonth(year, month) {
  if (!hasBankLoanLedger()) return { total: 0, borrowersStillDue: 0 };

  const lots = getAllBankLoanLots({ status: "active" }).filter(
    (lot) => lot.outstanding > 0.005
  );
  const expectedByMember = new Map();

  for (const lot of lots) {
    const expected = expectedRepaymentForLotInMonth(lot, year, month);
    if (expected <= 0) continue;
    expectedByMember.set(
      lot.memberId,
      round2((expectedByMember.get(lot.memberId) || 0) + expected)
    );
  }

  let total = 0;
  let borrowersStillDue = 0;
  for (const [memberId, expectedTotal] of expectedByMember) {
    const received = sumRepaymentsReceivedInMonth(memberId, year, month);
    const shortfall = round2(Math.max(0, expectedTotal - received));
    if (shortfall > 0) {
      total += shortfall;
      borrowersStillDue += 1;
    }
  }

  return { total: round2(total), borrowersStillDue };
}

function getOutstandingLoanRepaymentsDueInMonth(asOf = new Date()) {
  const { year, month } = calendarParts(asOf);
  const fromInstallments = sumInstallmentRepaymentsDueInMonth(year, month);
  const bank = sumBankLedgerRepaymentsDueInMonth(year, month);
  return {
    year,
    month,
    monthLabel: new Date(year, month - 1, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: COOPERATIVE_TIMEZONE,
    }),
    total: round2(fromInstallments + bank.total),
    fromInstallments,
    fromBankLedger: bank.total,
    borrowersStillDue: bank.borrowersStillDue,
  };
}

function getDashboardMetrics(asOf = new Date()) {
  const { year, month, day } = calendarParts(asOf);

  const thisMonth = monthBounds(year, month);
  const depositsThisMonth = sumDepositsBetween(thisMonth.start, thisMonth.end);

  const ytd = ytdBounds(year, month, day);
  const depositsYtd = sumDepositsBetween(ytd.start, ytd.end);

  const lastYearYtd = ytdBounds(year - 1, month, day);
  const depositsYtdLastYear = sumDepositsBetween(lastYearYtd.start, lastYearYtd.end);

  const twoYearsYtd = ytdBounds(year - 2, month, day);
  const depositsYtdTwoYearsAgo = sumDepositsBetween(twoYearsYtd.start, twoYearsYtd.end);

  const loanRepaymentsDue = getOutstandingLoanRepaymentsDueInMonth(asOf);

  return {
    asOf: ytd.end,
    depositsThisMonth: {
      year,
      month,
      monthLabel: new Date(year, month - 1, 1).toLocaleString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: getCooperativeTimezone(),
      }),
      total: depositsThisMonth,
    },
    depositsYtd: {
      year,
      through: ytd.end,
      total: depositsYtd,
      lastYear: {
        year: year - 1,
        total: depositsYtdLastYear,
        pctChange: pctChange(depositsYtd, depositsYtdLastYear),
      },
      twoYearsAgo: {
        year: year - 2,
        total: depositsYtdTwoYearsAgo,
        pctChange: pctChange(depositsYtd, depositsYtdTwoYearsAgo),
      },
    },
    loanRepaymentsDue,
  };
}

module.exports = {
  getDashboardMetrics,
  sumDepositsBetween,
  getOutstandingLoanRepaymentsDueInMonth,
  formatPctChange,
};
