const fs = require("fs");
const path = require("path");
const { launchBrowser } = require("./puppeteer-launch");
const { getCoopRoot, getStatementsDir } = require("./paths");
const { getDb } = require("../db/database");
const { getCooperativeBooks } = require("./cooperative-books");
const { getLoanPortfolioFromBankLedger } = require("./loan-ledger-service");
const { buildLoanPublicIdMap, getLoanPublicId } = require("./loan-public-id");
const { getExpensesForStatusReport } = require("./expense-report-label-service");
const { MONTH_NAMES } = require("./constants");

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatMoney(value, { parens = false } = {}) {
  const number = Number(value) || 0;
  const formatted = moneyFmt.format(Math.abs(number));
  if (number < 0 || parens) {
    return number < 0 || parens ? `(${formatted})` : formatted;
  }
  return formatted;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseMonthEndDate(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error("Invalid year or month");
  }
  const day = lastDayOfMonth(y, m);
  return {
    year: y,
    month: m,
    dateIso: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    labelUs: `${String(m).padStart(2, "0")}/${String(day).padStart(2, "0")}/${y}`,
    slug: `${y}-${String(m).padStart(2, "0")}`,
    periodLabel: `${MONTH_NAMES[m - 1]} ${y}`,
  };
}

/** Default report date: last calendar day of the current month (month-end simulation). */
function defaultReportMonthEnd() {
  const now = new Date();
  return parseMonthEndDate(now.getFullYear(), now.getMonth() + 1);
}

function resolveReportPeriod(options = {}) {
  if (options.asOfDate) {
    const m = String(options.asOfDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw new Error("asOfDate must be YYYY-MM-DD");
    return parseMonthEndDate(Number(m[1]), Number(m[2]));
  }
  if (options.year != null && options.month != null) {
    return parseMonthEndDate(options.year, options.month);
  }
  return defaultReportMonthEnd();
}

const INVESTMENT_DESCRIPTION_LABELS = {
  "Check 1172": "Investment in Caribe Lounge",
};

function investmentSectionLabel(investmentRows) {
  if (!investmentRows.length) return "Investments";
  const labels = investmentRows.map((row) => {
    const desc = String(row.description || "").trim();
    return INVESTMENT_DESCRIPTION_LABELS[desc] || desc || "Investment";
  });
  if (investmentRows.length === 1) return labels[0];
  const joined = labels.filter(Boolean).join("; ");
  return joined || "Investments";
}

function buildPerformanceOverview(data, books) {
  const { period, organizationName, incomeStatement, balanceSheet, bankBalances, unearnedIncome } =
    data;
  const memberCount = books.memberCount || 0;
  const activeBorrowers = books.loanBorrowerCount || 0;
  const netPhrase =
    incomeStatement.netIncome >= 0
      ? `net income of ${formatMoney(incomeStatement.netIncome)}`
      : `a net loss of ${formatMoney(Math.abs(incomeStatement.netIncome))}`;

  const sentences = [
    `As at ${period.labelUs}, ${organizationName} serves ${memberCount} member${memberCount === 1 ? "" : "s"} with ${formatMoney(balanceSheet.membersDeposits)} in deposit accounts and ${formatMoney(balanceSheet.totalAssets)} in total assets.`,
    `The cooperative generated ${formatMoney(incomeStatement.totalIncome)} in income and reported ${netPhrase} after operational expenses of ${formatMoney(incomeStatement.operationalExpenses)}.`,
    `Liquid resources total ${formatMoney(bankBalances.total)} between cash at hand and the certificate of deposit. Outstanding member loans are ${formatMoney(balanceSheet.loansOutstanding)}${activeBorrowers ? ` across ${activeBorrowers} active borrower${activeBorrowers === 1 ? "" : "s"}` : ""}.`,
  ];

  if (unearnedIncome.total > 0) {
    sentences.push(
      `Expected future loan and CD earnings of ${formatMoney(unearnedIncome.total)} remain to be collected.`
    );
  }

  return sentences.join(" ");
}

function getCooperativeStatusReportData(options = {}) {
  const period = resolveReportPeriod(options);
  const branding = {
    organizationName: options.organizationName || "Cooperative",
    website: options.website || "",
  };
  const books = getCooperativeBooks();
  const db = getDb();

  const expenseRows = getExpensesForStatusReport();

  const investmentRows = db
    .prepare(
      `SELECT transaction_date, amount, description
       FROM transactions
       WHERE type = 'investment'
       ORDER BY transaction_date ASC, id ASC`
    )
    .all();

  const membersDeposits = books.totalMemberDepositAccounts || 0;
  const retainedEarnings = books.cooperativeNetIncome || 0;
  const loansOutstanding = books.loansOutstanding || 0;
  const cdBalance = books.cdBalance != null ? Number(books.cdBalance) : 0;
  const investments = books.investments || 0;
  const cashAtHand =
    membersDeposits + retainedEarnings - loansOutstanding - cdBalance - investments;

  const interestIncomeEarned =
    (books.loanInterestIncome || 0) + (books.cdInterestIncome || 0);
  const registrationIncome = books.registrationIncome || 0;
  const totalIncome = interestIncomeEarned + registrationIncome;
  const operationalExpenses = books.expenses || 0;
  const netIncome = books.cooperativeNetIncome || 0;

  const totalAssets = loansOutstanding + cashAtHand + cdBalance + investments;
  const totalLiabilitiesEquity = membersDeposits + retainedEarnings;

  const apyLabel =
    books.cdApy != null
      ? `${Number(books.cdApy).toFixed(2)} APY`
      : books.cdAnnualRate != null
        ? `${Number(books.cdAnnualRate).toFixed(2)}% APY`
        : null;
  const cdLabel = apyLabel
    ? `Certificate of Deposit (${apyLabel})`
    : "Certificate of Deposit";

  const loanPortfolio = getLoanPortfolioFromBankLedger();
  const loanPublicIdMap = buildLoanPublicIdMap(loanPortfolio);

  const activeLoans = loanPortfolio
    .filter((row) => row.status === "active")
    .map((row) => {
      const scheduled = row.scheduledTotalInterest;
      const earned = row.interestIncome || 0;
      const future =
        scheduled != null && scheduled > 0 ? Math.max(0, scheduled - earned) : 0;
      return {
        publicId: getLoanPublicId(loanPublicIdMap, row.borrowerId, row.loanNumber),
        futureInterest: future,
      };
    })
    .filter((row) => row.futureInterest > 0)
    .sort((a, b) => a.publicId.localeCompare(b.publicId));

  const expectedCdInterest = books.expectedCdInterest || 0;
  const totalUnearnedIncome =
    (books.expectedLoanInterest || 0) + expectedCdInterest;

  const reportCore = {
    organizationName: branding.organizationName,
    website: branding.website,
    period,
    preparedOn: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    bankBalances: {
      cashAtHand,
      cdBalance,
      cdLabel,
      total: cashAtHand + cdBalance,
    },
    incomeStatement: {
      interestIncomeEarned,
      registrationIncome,
      totalIncome,
      operationalExpenses,
      netIncome,
    },
    balanceSheet: {
      loansOutstanding,
      cashAtHand,
      cdBalance,
      cdLabel,
      investments,
      investmentLabel: investmentSectionLabel(investmentRows),
      totalAssets,
      membersDeposits,
      retainedEarnings,
      totalLiabilitiesEquity,
    },
    expenses: expenseRows.map((row) => ({
      label: row.label,
      amount: row.amount,
      consolidated: row.consolidated,
    })),
    operationalExpensesTotal: operationalExpenses,
    unearnedIncome: {
      loanRows: activeLoans,
      expectedCdInterest,
      total: totalUnearnedIncome,
    },
  };

  return {
    ...reportCore,
    performanceOverview: buildPerformanceOverview(reportCore, books),
  };
}

function reportTable(title, rows, { compact = false } = {}) {
  const body = rows
    .map(
      ([label, amount, bold]) =>
        `<tr${bold ? ' class="total-row"' : ""}><td>${escapeHtml(label)}</td><td class="money">${amount}</td></tr>`
    )
    .join("");
  const thead = compact
    ? ""
    : "<thead><tr><th>Description</th><th class=\"money\">Amount</th></tr></thead>";
  return `
    <section class="report-block">
      <h2>${escapeHtml(title)}</h2>
      <table class="report-table">
        ${thead}
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

function sectionDivider() {
  return '<hr class="section-divider" aria-hidden="true" />';
}

function buildCooperativeStatusReportHtml(data) {
  const { period } = data;
  const styles = `
    @page { size: Letter; margin: 0.5in; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.4; margin: 0; }
    .report-header { text-align: center; border-bottom: 3px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 14px; }
    .report-header .org { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
    .report-header .site { font-size: 12px; color: #0369a1; margin: 0 0 8px; }
    .report-header h1 { font-size: 16px; margin: 0 0 4px; font-weight: 700; }
    .report-header .as-of { font-size: 12px; color: #475569; margin: 0; }
    .report-header .prepared { color: #64748b; font-size: 10px; margin: 8px 0 0; }
    .performance-overview {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 2px;
    }
    .performance-overview h2 {
      font-size: 11px;
      margin: 0 0 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0369a1;
      font-weight: 700;
    }
    .performance-overview p { margin: 0; font-size: 11px; line-height: 1.45; }
    .section-divider { border: none; border-top: 2px solid #cbd5e1; margin: 12px 0; }
    .report-grid-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
    h2 { font-size: 12px; margin: 0 0 6px; color: #0f172a; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
    h3 { font-size: 11px; margin: 8px 0 4px; color: #334155; font-weight: 600; }
    .report-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    .report-table th, .report-table td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; font-size: 10.5px; }
    .report-table th { background: #f8fafc; font-weight: 600; }
    .report-table td.money, .report-table th.money { text-align: right; white-space: nowrap; }
    .report-table tr.total-row td { font-weight: 700; border-top: 2px solid #cbd5e1; }
    .report-footnote { color: #64748b; font-size: 10px; margin-top: 10px; }
    .report-block { margin: 0; }
  `;

  const bank = data.bankBalances;
  const income = data.incomeStatement;
  const sheet = data.balanceSheet;

  const expenseRowsHtml = data.expenses
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td class="money">${formatMoney(-Math.abs(row.amount), { parens: true })}</td></tr>`
    )
    .join("");

  const loanUnearnedHtml = data.unearnedIncome.loanRows
    .map(
      (row) =>
        `<tr><td>Unearned Income on ${escapeHtml(row.publicId)}</td><td class="money">${formatMoney(row.futureInterest)}</td></tr>`
    )
    .join("");

  const cdUnearnedRow =
    data.unearnedIncome.expectedCdInterest > 0
      ? `<tr><td>Unearned Income on CD</td><td class="money">${formatMoney(data.unearnedIncome.expectedCdInterest)}</td></tr>`
      : "";

  const incomeStatementBlock = `
    <section class="report-block">
      <h2>Income Statement</h2>
      <table class="report-table">
        <tbody>
          <tr><td>Interest Income earned</td><td class="money">${formatMoney(income.interestIncomeEarned)}</td></tr>
          <tr><td>Registration Income</td><td class="money">${formatMoney(income.registrationIncome)}</td></tr>
          <tr class="total-row"><td>Total Income</td><td class="money">${formatMoney(income.totalIncome)}</td></tr>
          <tr><td>Operational Expenses*</td><td class="money">${formatMoney(-income.operationalExpenses, { parens: true })}</td></tr>
          <tr class="total-row"><td>Net Income</td><td class="money">${formatMoney(income.netIncome)}</td></tr>
        </tbody>
      </table>
    </section>`;

  const balanceSheetBlock = `
    <section class="report-block">
      <h2>Balance Sheet</h2>
      <h3>Assets</h3>
      <table class="report-table">
        <tbody>
          <tr><td>Loans to Members</td><td class="money">${formatMoney(sheet.loansOutstanding)}</td></tr>
          <tr><td>Cash at Hand</td><td class="money">${formatMoney(sheet.cashAtHand)}</td></tr>
          <tr><td>${escapeHtml(sheet.cdLabel)}</td><td class="money">${formatMoney(sheet.cdBalance)}</td></tr>
          <tr><td>${escapeHtml(sheet.investmentLabel)}</td><td class="money">${formatMoney(sheet.investments)}</td></tr>
          <tr class="total-row"><td>Total Assets</td><td class="money">${formatMoney(sheet.totalAssets)}</td></tr>
        </tbody>
      </table>
      <h3>Liabilities and Equity</h3>
      <table class="report-table">
        <tbody>
          <tr><td>Members' Deposits</td><td class="money">${formatMoney(sheet.membersDeposits)}</td></tr>
          <tr><td>Retained Earnings</td><td class="money">${formatMoney(sheet.retainedEarnings)}</td></tr>
          <tr class="total-row"><td>Total Liabilities and Equity</td><td class="money">${formatMoney(sheet.totalLiabilitiesEquity)}</td></tr>
        </tbody>
      </table>
    </section>`;

  const expensesBlock = `
    <section class="report-block">
      <h2>Operational Expenses*</h2>
      <table class="report-table">
        <thead><tr><th>Description</th><th class="money">Amount</th></tr></thead>
        <tbody>
          ${expenseRowsHtml || '<tr><td colspan="2">No expenses recorded</td></tr>'}
          <tr class="total-row"><td>Total Operational Expenses</td><td class="money">${formatMoney(-data.operationalExpensesTotal, { parens: true })}</td></tr>
        </tbody>
      </table>
    </section>`;

  const unearnedBlock = `
    <section class="report-block">
      <h2>Expected Future Earnings</h2>
      <table class="report-table">
        <thead><tr><th>Description</th><th class="money">Amount</th></tr></thead>
        <tbody>
          ${loanUnearnedHtml || '<tr><td colspan="2">No unearned loan interest on active loans</td></tr>'}
          ${cdUnearnedRow}
          <tr class="total-row"><td>Total Unearned Income</td><td class="money">${formatMoney(data.unearnedIncome.total)}</td></tr>
        </tbody>
      </table>
    </section>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cooperative Status ${period.labelUs}</title>
  <style>${styles}</style>
</head>
<body>
  <header class="report-header">
    <p class="org">${escapeHtml(data.organizationName)}</p>
    ${data.website ? `<p class="site">${escapeHtml(data.website)}</p>` : ""}
    <h1>Cooperative Monthly Status Report</h1>
    <p class="as-of">Statement of Affairs as at ${period.labelUs}</p>
    <p class="prepared">Prepared ${escapeHtml(data.preparedOn)} · Figures from cooperative ledger</p>
  </header>

  <section class="performance-overview">
    <h2>Performance Overview</h2>
    <p>${escapeHtml(data.performanceOverview)}</p>
  </section>

  ${sectionDivider()}

  <div class="report-grid-two">
    ${reportTable("Bank Balances", [
      ["Cash at Hand", formatMoney(bank.cashAtHand)],
      [bank.cdLabel, formatMoney(bank.cdBalance)],
      ["Total", formatMoney(bank.total), true],
    ])}
    ${incomeStatementBlock}
  </div>

  ${sectionDivider()}

  ${balanceSheetBlock}

  ${sectionDivider()}

  <div class="report-grid-two">
    ${expensesBlock}
    ${unearnedBlock}
  </div>

  <p class="report-footnote">* Operational expenses are grouped by administrator-assigned report labels. Expand details in the member portal if needed.</p>
</body>
</html>`;
}

async function generateCooperativeStatusReportPdf(options = {}) {
  const data = getCooperativeStatusReportData(options);
  const html = buildCooperativeStatusReportHtml(data);

  const outDir =
    options.outputDir ||
    path.join(getStatementsDir(), "cooperative-status", data.period.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const fileName = `Cooperative Status ${data.period.labelUs.replace(/\//g, "-")}.pdf`;
  const outputPath = path.join(outDir, fileName);

  const browser = await launchBrowser({ headless: "new", timeout: 60000 });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.pdf({
      path: outputPath,
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    });
  } finally {
    await browser.close();
  }

  return {
    outputPath,
    fileName,
    period: data.period,
    relativePath: path
      .relative(getCoopRoot(), outputPath)
      .split(path.sep)
      .join("/"),
  };
}

module.exports = {
  getCooperativeStatusReportData,
  buildCooperativeStatusReportHtml,
  buildPerformanceOverview,
  generateCooperativeStatusReportPdf,
  defaultReportMonthEnd,
  resolveReportPeriod,
};
