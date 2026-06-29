const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const { getAllBankLoanLots, hasBankLoanLedger } = require("./loan-ledger-service");

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

function periodTotalDue(period) {
  const total =
    period.totalDue != null
      ? Number(period.totalDue)
      : round2(Number(period.interest || 0) + Number(period.principal || 0));
  return total > 0.005 ? total : 0;
}

function outstandingDueFromSchedule(collected, schedule, year, month) {
  if (!schedule?.length) return 0;

  let remaining = Number(collected) || 0;
  let dueThisMonth = 0;

  for (const period of schedule) {
    const totalDue = periodTotalDue(period);
    if (!totalDue) continue;

    const due = parseDueMonth(period.dueDate);
    const dueInMonth = due && due.year === year && due.month === month;

    if (remaining >= totalDue - 0.005) {
      remaining = round2(remaining - totalDue);
      continue;
    }

    const shortfall = round2(totalDue - Math.max(0, remaining));
    remaining = 0;
    if (dueInMonth) {
      dueThisMonth += shortfall;
    }
  }

  return round2(dueThisMonth);
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
  if (!hasBankLoanLedger()) return 0;
  const lots = getAllBankLoanLots({ status: "active" });
  return round2(
    lots.reduce((sum, lot) => {
      if (lot.outstanding <= 0.005) return sum;
      return sum + outstandingDueFromSchedule(lot.collected, lot.schedule, year, month);
    }, 0)
  );
}

function getOutstandingLoanRepaymentsDueInMonth(asOf = new Date()) {
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1;
  const fromInstallments = sumInstallmentRepaymentsDueInMonth(year, month);
  const fromBankLedger = sumBankLedgerRepaymentsDueInMonth(year, month);
  return {
    year,
    month,
    monthLabel: asOf.toLocaleString("en-US", { month: "long", year: "numeric" }),
    total: round2(fromInstallments + fromBankLedger),
    fromInstallments,
    fromBankLedger,
  };
}

function getDashboardMetrics(asOf = new Date()) {
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1;
  const day = asOf.getDate();

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
      monthLabel: asOf.toLocaleString("en-US", { month: "long", year: "numeric" }),
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
