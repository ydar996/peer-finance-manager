/**
 * Downloadable repayment plan (PDF and Excel) for approved/disbursed loans.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { launchBrowser } = require("./puppeteer-launch");
const { getStatementsDir } = require("./paths");
const { formatMoney } = require("./money-format");
const { formatCooperativeDate } = require("./cooperative-date-format");
const { getOrgSlugOrNull } = require("./org-context");

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function organizationName() {
  const slug = getOrgSlugOrNull();
  if (!slug) return "Peer Finance Manager";
  try {
    const { getOrganization } = require("./organization-service");
    return getOrganization(slug)?.name || "Peer Finance Manager";
  } catch (_) {
    return "Peer Finance Manager";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function normalizePlanRows(schedule = [], principal = 0) {
  let balance = round2(principal);
  return (schedule || []).map((row, index) => {
    const payment = round2(row.totalDue ?? row.total_due ?? 0);
    const principalDue = round2(row.principalDue ?? row.principal ?? 0);
    const interestDue = round2(row.interestDue ?? row.interest ?? 0);
    balance = Math.max(0, round2(balance - principalDue));
    return {
      installmentNumber: row.installmentNumber || row.period || index + 1,
      dueDate: String(row.dueDate || row.due_date || "").slice(0, 10),
      payment,
      principalDue,
      interestDue,
      balance,
    };
  });
}

function planFromTerms(terms, extras = {}) {
  const schedule = Array.isArray(terms?.schedule) ? terms.schedule : [];
  if (!schedule.length) {
    const err = new Error("No repayment schedule is available yet.");
    err.status = 404;
    throw err;
  }
  const principal = Number(terms.principal || extras.principal || 0);
  return {
    borrower: extras.borrower || "Member",
    orgName: organizationName(),
    principal,
    annualRate: terms.annualRate,
    termMonths: terms.termMonths,
    monthlyPayment: terms.monthlyPayment,
    totalInterest: terms.totalInterest,
    totalPayable: terms.totalPayable,
    disbursementDate: terms.disbursedAt || extras.disbursementDate || terms.startDate || "",
    firstDueDate: terms.firstDueDate || schedule[0]?.dueDate || "",
    rows: normalizePlanRows(schedule, principal),
  };
}

function planFromBankLot(lot) {
  const schedule = Array.isArray(lot?.schedule) ? lot.schedule : [];
  if (!schedule.length) {
    const err = new Error("No repayment schedule is available for this loan yet.");
    err.status = 404;
    throw err;
  }
  const principal = Number(lot.principal || lot.agreedPrincipal || 0);
  return {
    borrower: lot.borrower || "Member",
    orgName: organizationName(),
    principal,
    annualRate: null,
    termMonths: schedule.length,
    monthlyPayment: lot.scheduledMonthlyPayment,
    totalInterest: lot.scheduledTotalInterest,
    totalPayable: lot.scheduledTotalPayable,
    disbursementDate: lot.disbursementDate || "",
    firstDueDate: schedule[0]?.dueDate || schedule[0]?.due_date || "",
    rows: normalizePlanRows(schedule, principal),
  };
}

function displayDate(iso) {
  try {
    return formatCooperativeDate(iso) || iso || ":";
  } catch (_) {
    return iso || ":";
  }
}

function buildPlanHtml(plan) {
  const rate =
    plan.annualRate != null && Number(plan.annualRate) > 0
      ? `${Math.round(Number(plan.annualRate) * 10000) / 100}%`
      : ":";
  const rows = plan.rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.installmentNumber)}</td>
        <td>${escapeHtml(displayDate(row.dueDate))}</td>
        <td class="money">${escapeHtml(formatMoney(row.payment))}</td>
        <td class="money">${escapeHtml(formatMoney(row.principalDue))}</td>
        <td class="money">${escapeHtml(formatMoney(row.interestDue))}</td>
        <td class="money">${escapeHtml(formatMoney(row.balance))}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Georgia, "Times New Roman", serif; color: #1b1f1c; margin: 0; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      h2 { font-size: 16px; margin: 0 0 16px; font-weight: 600; }
      .meta { font-size: 13px; line-height: 1.45; margin: 0 0 18px; }
      .meta strong { display: inline-block; min-width: 160px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #c9d0cb; padding: 7px 8px; }
      th { background: #eef3ef; text-align: left; font-weight: 600; }
      td.money, th.money { text-align: right; font-variant-numeric: tabular-nums; }
      tbody tr:nth-child(even) { background: #f7f9f7; }
      .hint { font-size: 12px; color: #445048; margin-top: 16px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(plan.orgName)}</h1>
    <h2>Loan Repayment Plan</h2>
    <p class="meta">
      <strong>Borrower</strong> ${escapeHtml(plan.borrower)}<br>
      <strong>Principal</strong> ${escapeHtml(formatMoney(plan.principal))}<br>
      <strong>Disbursement Date</strong> ${escapeHtml(displayDate(plan.disbursementDate))}<br>
      <strong>First Repayment Due</strong> ${escapeHtml(displayDate(plan.firstDueDate))}<br>
      <strong>Term</strong> ${escapeHtml(String(plan.termMonths || plan.rows.length))} Months<br>
      <strong>Monthly Payment</strong> ${escapeHtml(formatMoney(plan.monthlyPayment || 0))}<br>
      <strong>Annual Rate</strong> ${escapeHtml(rate)}<br>
      <strong>Total Interest</strong> ${escapeHtml(formatMoney(plan.totalInterest || 0))}<br>
      <strong>Total Payable</strong> ${escapeHtml(formatMoney(plan.totalPayable || 0))}
    </p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Due Date</th>
          <th class="money">Payment</th>
          <th class="money">Principal</th>
          <th class="money">Interest</th>
          <th class="money">Balance</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">First repayment is due 30 days after disbursement. Later payments fall on that same calendar day each month. Actual receipts follow bank records.</p>
  </body>
</html>`;
}

function planFileBase(plan) {
  const borrower = sanitizeFilename(plan.borrower || "member");
  const when = sanitizeFilename(plan.disbursementDate || "plan");
  return `Repayment Plan - ${borrower} - ${when}`;
}

async function generateRepaymentPlanPdf(plan) {
  const html = buildPlanHtml(plan);
  const outputDir = path.join(getStatementsDir(), "repayment-plans");
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `${planFileBase(plan)}.pdf`;
  const outputPath = path.join(outputDir, fileName);
  const browser = await launchBrowser({ headless: "new", timeout: 60000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 1280 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.pdf({
      path: outputPath,
      format: "Letter",
      printBackground: true,
      timeout: 60000,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    await page.close();
  } finally {
    await browser.close();
  }
  return { outputPath, fileName, contentType: "application/pdf" };
}

function generateRepaymentPlanXlsx(plan) {
  const header = [
    [plan.orgName],
    ["Loan Repayment Plan"],
    [],
    ["Borrower", plan.borrower],
    ["Principal", plan.principal],
    ["Disbursement Date", plan.disbursementDate || ""],
    ["First Repayment Due", plan.firstDueDate || ""],
    ["Term (Months)", plan.termMonths || plan.rows.length],
    ["Monthly Payment", plan.monthlyPayment || 0],
    ["Total Interest", plan.totalInterest || 0],
    ["Total Payable", plan.totalPayable || 0],
    [],
    ["#", "Due Date", "Payment", "Principal", "Interest", "Balance"],
  ];
  const body = plan.rows.map((row) => [
    row.installmentNumber,
    row.dueDate,
    row.payment,
    row.principalDue,
    row.interestDue,
    row.balance,
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([
    ...header,
    ...body,
    [],
    ["First repayment is due 30 days after disbursement. Later payments fall on that same calendar day each month."],
  ]);
  sheet["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Repayment Plan");
  const outputDir = path.join(getStatementsDir(), "repayment-plans");
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `${planFileBase(plan)}.xlsx`;
  const outputPath = path.join(outputDir, fileName);
  XLSX.writeFile(wb, outputPath);
  return {
    outputPath,
    fileName,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

async function generateRepaymentPlan(plan, format) {
  const kind = String(format || "pdf").toLowerCase();
  if (kind === "xlsx" || kind === "excel") return generateRepaymentPlanXlsx(plan);
  return generateRepaymentPlanPdf(plan);
}

function planFromApplication(application) {
  if (!application?.terms) {
    const err = new Error("No repayment schedule is available yet.");
    err.status = 404;
    throw err;
  }
  return planFromTerms(application.terms, {
    borrower: application.memberName || application.applicantName || "Member",
    disbursementDate: application.terms.disbursedAt || application.terms.startDate,
  });
}

module.exports = {
  planFromTerms,
  planFromBankLot,
  planFromApplication,
  generateRepaymentPlan,
  generateRepaymentPlanPdf,
  generateRepaymentPlanXlsx,
  normalizePlanRows,
};
