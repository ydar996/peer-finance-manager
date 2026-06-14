const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getCoopRoot } = require("./paths");

const DEFAULT_WORKBOOK = "loan details and interest.xlsx";

/**
 * Bank check amount differed from agreed loan principal; excess was refunded
 * and is already recorded in bank repayment cashflows.
 */
const LOAN_PRINCIPAL_CORRECTIONS = [
  {
    memberPattern: /embassey/i,
    checkPattern: /1181/,
    bankDisbursement: 2200,
    loanPrincipal: 2000,
    note:
      "Administrative error on Check 1181 ($2,200). Borrower refunded $200 immediately; agreed loan principal is $2,000.",
  },
];

let cachedReference = null;

function excelSerialToIso(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && value > 30000) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + value * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isPeriodRow(row) {
  const period = row[0];
  return typeof period === "number" && period >= 1 && period <= 60;
}

function isHeaderRow(row) {
  const label = String(row[1] || "").toLowerCase();
  return label.includes("beginning balance") || label === "date";
}

function isLoanTitleRow(row) {
  const title = String(row[0] || "").trim();
  const principal = parseNumber(row[1]);
  if (!title || principal == null || principal < 500) return null;
  if (/^\d+$/.test(title)) return null;
  if (!/[a-zA-Z]/.test(title)) return null;
  if (isHeaderRow(row)) return null;
  if (/^year\b/i.test(title)) return null;
  return { title, principal };
}

function isTotalInterestRow(row, afterSchedule) {
  if (!afterSchedule) return null;
  if (isPeriodRow(row)) return null;
  const col0 = String(row[0] || "").trim();
  const col1 = String(row[1] || "").trim();
  if (col0 || col1) return null;
  const interest = parseNumber(row[2]);
  if (interest == null || interest <= 0) return null;
  return interest;
}

function parseAmortizationSection(rows, startIdx) {
  let idx = startIdx;
  while (idx < rows.length && !isHeaderRow(rows[idx])) idx += 1;
  if (idx >= rows.length) return null;
  idx += 1;

  const installments = [];
  let monthlyPayment = null;

  while (idx < rows.length) {
    const row = rows[idx];
    if (!row || row.every((cell) => cell === "" || cell == null)) {
      idx += 1;
      continue;
    }

    const totalInterest = isTotalInterestRow(row, installments.length > 0);
    if (totalInterest != null) {
      return { installments, totalScheduledInterest: totalInterest, monthlyPayment, endIdx: idx };
    }

    const title = isLoanTitleRow(row);
    if (title && installments.length > 0) {
      return {
        installments,
        totalScheduledInterest: sumInstallmentInterest(installments),
        monthlyPayment,
        endIdx: idx,
        nextSectionAt: idx,
      };
    }

    if (!isPeriodRow(row)) {
      idx += 1;
      continue;
    }

    const interest = Math.abs(parseNumber(row[2]) || 0);
    const principal = Math.abs(parseNumber(row[3]) || 0);
    const beginningBalance = parseNumber(row[1]);
    let payment = parseNumber(row[6]) ?? parseNumber(row[5]);
    if (
      payment != null &&
      beginningBalance != null &&
      payment > beginningBalance
    ) {
      payment = parseNumber(row[6]) ?? round2(interest + principal);
    }
    if (payment == null) payment = round2(interest + principal);
    if (payment != null && monthlyPayment == null) monthlyPayment = payment;

    const dueDate = excelSerialToIso(row[9] ?? row[1]);
    const actualPayment = parseNumber(row[10] ?? row[6]);

    installments.push({
      period: row[0],
      dueDate,
      interest,
      principal,
      totalDue: payment ?? round2(interest + principal),
      actualPayment,
      actualPaymentDate: actualPayment != null ? dueDate : null,
    });
    idx += 1;
  }

  return {
    installments,
    totalScheduledInterest: sumInstallmentInterest(installments),
    monthlyPayment,
    endIdx: idx,
  };
}

function parseDateKeyedSection(rows, startIdx) {
  let idx = startIdx;
  while (idx < rows.length && !isHeaderRow(rows[idx])) idx += 1;
  if (idx >= rows.length) return null;
  idx += 1;

  const installments = [];
  let monthlyPayment = null;

  while (idx < rows.length) {
    const row = rows[idx];
    if (!row || row.every((cell) => cell === "" || cell == null)) {
      idx += 1;
      continue;
    }

    const totalInterest = isTotalInterestRow(row, installments.length > 0);
    if (totalInterest != null) {
      return { installments, totalScheduledInterest: totalInterest, monthlyPayment, endIdx: idx };
    }

    const title = isLoanTitleRow(row);
    if (title && installments.length > 0) {
      return {
        installments,
        totalScheduledInterest: sumInstallmentInterest(installments),
        monthlyPayment,
        endIdx: idx,
        nextSectionAt: idx,
      };
    }

    if (!isPeriodRow(row)) {
      idx += 1;
      continue;
    }

    const dueDate = excelSerialToIso(row[1]);
    const totalDue = parseNumber(row[2]);
    const principal = Math.abs(parseNumber(row[3]) || 0);
    const interest = Math.abs(parseNumber(row[4]) || 0);
    if (totalDue != null && monthlyPayment == null) monthlyPayment = totalDue;

    installments.push({
      period: row[0],
      dueDate,
      interest,
      principal,
      totalDue: totalDue ?? round2(interest + principal),
    });
    idx += 1;
  }

  return {
    installments,
    totalScheduledInterest: sumInstallmentInterest(installments),
    monthlyPayment,
    endIdx: idx,
  };
}

function sumInstallmentInterest(installments) {
  return round2(installments.reduce((sum, row) => sum + (row.interest || 0), 0));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeMemberKey(title) {
  const t = String(title).toLowerCase();
  if (t.includes("embassey")) return "embassey";
  if (t.includes("gbanju")) return "gbanju";
  if (t.includes("oluwabiyi")) return "oluwabiyi";
  if (t.includes("saheed")) return "saheed";
  if (/^oluwabiyi$/i.test(String(title).trim())) return "oluwabiyi";
  if (/^saheed$/i.test(String(title).trim())) return "saheed";
  return t.replace(/loan\s*\d+\s*[-–]?\s*/gi, "").trim();
}

function memberNameMatchesKey(memberName, memberKey) {
  const name = String(memberName || "").toLowerCase();
  const key = String(memberKey || "").toLowerCase();
  if (!name || !key) return false;
  if (name.includes(key)) return true;
  if (key.includes("oluwabiyi") && name.includes("omotuyole")) return true;
  if (key.includes("saheed") && name.includes("salami")) return true;
  if (key.includes("gbanju") && name.includes("aruwayo")) return true;
  return false;
}

function parseWorkbookRows(rows) {
  const loans = [];
  let idx = 0;

  while (idx < rows.length) {
    const titleInfo = isLoanTitleRow(rows[idx]);
    if (!titleInfo) {
      idx += 1;
      continue;
    }

    const headerRow = rows[idx + 1] || [];
    const isDateKeyed = String(headerRow[1] || "").toLowerCase() === "date";
    const parsed = isDateKeyed
      ? parseDateKeyedSection(rows, idx + 1)
      : parseAmortizationSection(rows, idx + 1);

    if (!parsed || !parsed.installments.length) {
      idx += 1;
      continue;
    }

    loans.push({
      title: titleInfo.title,
      memberKey: normalizeMemberKey(titleInfo.title),
      principal: titleInfo.principal,
      totalScheduledInterest: parsed.totalScheduledInterest,
      monthlyPayment: parsed.monthlyPayment,
      installments: parsed.installments,
      scheduledTotalPayable: round2(
        titleInfo.principal + (parsed.totalScheduledInterest || 0)
      ),
    });
    idx = parsed.nextSectionAt != null ? parsed.nextSectionAt : parsed.endIdx + 1;
  }

  return loans;
}

function getWorkbookPath(customPath) {
  if (customPath && fs.existsSync(customPath)) return customPath;
  const coopRoot = getCoopRoot();
  const candidate = path.join(coopRoot, DEFAULT_WORKBOOK);
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function loadLoanDetailsReference(filePath) {
  const workbookPath = getWorkbookPath(filePath);
  if (!workbookPath) return { loans: [], workbookPath: null };

  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets["Loan Details"] || workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const loans = parseWorkbookRows(rows);

  return { loans, workbookPath };
}

function getLoanDetailsReference({ refresh = false, filePath } = {}) {
  if (!refresh && cachedReference) return cachedReference;
  cachedReference = loadLoanDetailsReference(filePath);
  return cachedReference;
}

function clearLoanDetailsCache() {
  cachedReference = null;
}

function matchLotToReference(lot, memberName, references) {
  const bankPrincipal = lot.principal;
  const check = String(lot.disbursementDescription || "");

  const memberLoans = references.filter((ref) =>
    memberNameMatchesKey(memberName, ref.memberKey)
  );

  if (!memberLoans.length) return null;

  if (/1169/.test(check)) {
    return memberLoans.find((ref) => /loan\s*3/i.test(ref.title)) || null;
  }
  if (/1190/.test(check)) {
    return memberLoans.find((ref) => /loan\s*7/i.test(ref.title)) || null;
  }
  if (/1181/.test(check)) {
    return memberLoans.find((ref) => /embassey/i.test(ref.title)) || null;
  }
  if (/1178/.test(check)) {
    return memberLoans.find((ref) => Math.abs(ref.principal - 7500) < 0.01) || null;
  }
  if (/1187/.test(check)) {
    return memberLoans.find((ref) => Math.abs(ref.principal - 8400) < 0.01) || null;
  }
  if (/1160/.test(check)) {
    return memberLoans.find((ref) => Math.abs(ref.principal - 3700) < 0.01) || null;
  }
  if (/1163/.test(check)) {
    return memberLoans.find((ref) => Math.abs(ref.principal - 6000) < 0.01) || null;
  }

  let match = memberLoans.find(
    (ref) => Math.abs(ref.principal - bankPrincipal) < 0.01
  );
  if (match) return match;

  if (memberLoans.length === 1) return memberLoans[0];

  return null;
}

function computeInterestFromSchedule(collected, installments) {
  if (!installments?.length || collected <= 0.005) {
    return { interestEarned: 0, principalRepaid: 0, periodsSatisfied: 0 };
  }

  let remaining = collected;
  let interestEarned = 0;
  let principalRepaid = 0;
  let periodsSatisfied = 0;

  for (const period of installments) {
    const totalDue = period.totalDue || round2((period.interest || 0) + (period.principal || 0));
    if (totalDue <= 0.005) continue;

    if (remaining >= totalDue - 0.005) {
      interestEarned += period.interest || 0;
      principalRepaid += period.principal || 0;
      remaining = round2(remaining - totalDue);
      periodsSatisfied += 1;
      continue;
    }

    if (remaining > 0.005) {
      const ratio = remaining / totalDue;
      interestEarned += (period.interest || 0) * ratio;
      principalRepaid += (period.principal || 0) * ratio;
      remaining = 0;
      periodsSatisfied += ratio;
    }
    break;
  }

  return {
    interestEarned: round2(interestEarned),
    principalRepaid: round2(principalRepaid),
    periodsSatisfied: round2(periodsSatisfied),
  };
}

function applyPrincipalCorrection(lot, memberName) {
  const bankAmount = lot.principal;
  for (const rule of LOAN_PRINCIPAL_CORRECTIONS) {
    if (!rule.memberPattern.test(memberName || "")) continue;
    if (rule.checkPattern && !rule.checkPattern.test(lot.disbursementDescription || "")) {
      continue;
    }
    if (Math.abs(bankAmount - rule.bankDisbursement) < 0.01) {
      lot.bankDisbursementAmount = bankAmount;
      lot.principal = rule.loanPrincipal;
      lot.principalNote = rule.note;
      return;
    }
  }
}

function applyWorkbookInterestToLot(lot, reference, memberName = "") {
  applyPrincipalCorrection(lot, memberName);
  lot.agreedPrincipal = reference.principal;
  lot.scheduleTitle = reference.title;
  lot.scheduledTotalInterest = reference.totalScheduledInterest;
  lot.scheduledMonthlyPayment = reference.monthlyPayment;
  lot.scheduledTotalPayable = reference.scheduledTotalPayable;
  lot.schedule = reference.installments;

  const { interestEarned } = computeInterestFromSchedule(
    lot.collected,
    reference.installments
  );
  lot.interestIncome = interestEarned;

  const loanPrincipal = lot.principal;
  const cashPrincipalRepaid = Math.min(
    loanPrincipal,
    Math.max(0, lot.collected - lot.interestIncome)
  );
  lot.principalRepaid = cashPrincipalRepaid;
  lot.outstanding = Math.max(0, Math.round((loanPrincipal - cashPrincipalRepaid) * 100) / 100);
  lot.status = lot.collected >= loanPrincipal - 0.005 ? "paid" : "active";
  if (lot.status === "paid") {
    lot.outstanding = 0;
    lot.principalRepaid = loanPrincipal;
  }
}

module.exports = {
  getLoanDetailsReference,
  clearLoanDetailsCache,
  matchLotToReference,
  computeInterestFromSchedule,
  applyPrincipalCorrection,
  applyWorkbookInterestToLot,
  getWorkbookPath,
  loadLoanDetailsReference,
  LOAN_PRINCIPAL_CORRECTIONS,
};
