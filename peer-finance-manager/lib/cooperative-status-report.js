const fs = require("fs");
const path = require("path");
const { launchBrowser } = require("./puppeteer-launch");
const { getCoopRoot, getStatementsDir } = require("./paths");
const { getDb } = require("../db/database");
const { getCooperativeBooks } = require("./cooperative-books");
const { getLoanPortfolioFromBankLedger } = require("./loan-ledger-service");
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

function investmentSectionLabel(investmentRows) {
  if (!investmentRows.length) return "Investments";
  if (investmentRows.length === 1 && investmentRows[0].description) {
    return `Investments (${investmentRows[0].description})`;
  }
  const names = investmentRows
    .map((row) => row.description)
    .filter(Boolean)
    .join("; ");
  return names ? `Investments (${names})` : "Investments";
}

function getCooperativeStatusReportData(options = {}) {
  const period = resolveReportPeriod(options);
  const branding = {
    organizationName: options.organizationName || "Cooperative",
    website: options.website || "",
  };
  const books = getCooperativeBooks();
  const db = getDb();

  const expenseRows = db
    .prepare(
      `SELECT expense_date, category, description, amount
       FROM expenses
       ORDER BY expense_date ASC, id ASC`
    )
    .all();

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

  const activeLoans = getLoanPortfolioFromBankLedger()
    .filter((row) => row.status === "active")
    .map((row) => {
      const scheduled = row.scheduledTotalInterest;
      const earned = row.interestIncome || 0;
      const future =
        scheduled != null && scheduled > 0 ? Math.max(0, scheduled - earned) : 0;
      return {
        loanNumber: row.loanNumber,
        borrower: row.borrower,
        futureInterest: future,
      };
    })
    .filter((row) => row.futureInterest > 0)
    .sort((a, b) => a.loanNumber - b.loanNumber);

  const expectedCdInterest = books.expectedCdInterest || 0;
  const totalUnearnedIncome =
    (books.expectedLoanInterest || 0) + expectedCdInterest;

  return {
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
      label: row.description || row.category || "Expense",
      amount: row.amount,
    })),
    operationalExpensesTotal: operationalExpenses,
    unearnedIncome: {
      loanRows: activeLoans,
      expectedCdInterest,
      total: totalUnearnedIncome,
    },
  };
}

function reportTable(title, rows) {
  const body = rows
    .map(
      ([label, amount, bold]) =>
        `<tr${bold ? ' class="total-row"' : ""}><td>${escapeHtml(label)}</td><td class="money">${amount}</td></tr>`
    )
    .join("");
  return `
    <section class="report-block">
      <h2>${escapeHtml(title)}</h2>
      <table class="report-table">
        <thead><tr><th>Description</th><th class="money">Amount</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

function buildCooperativeStatusReportHtml(data) {
  const { period } = data;
  const styles = `
    @page { size: Letter; margin: 0.65in; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.45; margin: 0; }
    .cover { text-align: center; padding: 48px 0 32px; page-break-after: always; }
    .cover .org { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
    .cover .site { font-size: 13px; color: #0369a1; margin: 0 0 40px; }
    .cover h1 { font-size: 22px; margin: 0 0 6px; }
    .cover .as-of { font-size: 14px; color: #475569; margin: 0; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h2 { font-size: 16px; margin: 0 0 12px; color: #0f172a; }
    h3 { font-size: 14px; margin: 20px 0 10px; }
    .report-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .report-table th, .report-table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
    .report-table th { background: #f8fafc; font-weight: 600; }
    .report-table td.money, .report-table th.money { text-align: right; white-space: nowrap; }
    .report-table tr.total-row td { font-weight: 700; border-top: 2px solid #cbd5e1; }
    .subtle { color: #64748b; font-size: 11px; margin-top: 24px; }
    .report-block + .report-block { margin-top: 28px; }
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
        `<tr><td>Unearned Income on loan ${row.loanNumber}</td><td class="money">${formatMoney(row.futureInterest)}</td></tr>`
    )
    .join("");

  const cdUnearnedRow =
    data.unearnedIncome.expectedCdInterest > 0
      ? `<tr><td>Unearned Income on CD</td><td class="money">${formatMoney(data.unearnedIncome.expectedCdInterest)}</td></tr>`
      : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cooperative Status ${period.labelUs}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="cover">
    <p class="org">${escapeHtml(data.organizationName)}</p>
    ${data.website ? `<p class="site">${escapeHtml(data.website)}</p>` : ""}
    <h1>Cooperative Monthly Status Report</h1>
    <p class="as-of">Statement of Affairs as at ${period.labelUs}</p>
    <p class="subtle">Prepared ${escapeHtml(data.preparedOn)} · Figures from cooperative ledger</p>
  </div>

  <div class="page">
    ${reportTable("Bank Balances", [
      ["Cash at Hand", formatMoney(bank.cashAtHand)],
      [bank.cdLabel, formatMoney(bank.cdBalance)],
      ["Total", formatMoney(bank.total), true],
    ])}
  </div>

  <div class="page">
    <section class="report-block">
      <h2>Statement of Affairs as at ${period.labelUs}</h2>
      <h3>Income Statement</h3>
      <table class="report-table">
        <tbody>
          <tr><td>Interest Income earned</td><td class="money">${formatMoney(income.interestIncomeEarned)}</td></tr>
          <tr><td>Registration Income</td><td class="money">${formatMoney(income.registrationIncome)}</td></tr>
          <tr class="total-row"><td>Total Income</td><td class="money">${formatMoney(income.totalIncome)}</td></tr>
          <tr><td>Operational Expenses*</td><td class="money">${formatMoney(-income.operationalExpenses, { parens: true })}</td></tr>
          <tr class="total-row"><td>Net Income</td><td class="money">${formatMoney(income.netIncome)}</td></tr>
        </tbody>
      </table>
    </section>
  </div>

  <div class="page">
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
      <h3>Liabilities</h3>
      <table class="report-table">
        <tbody>
          <tr><td>Members' Deposits</td><td class="money">${formatMoney(sheet.membersDeposits)}</td></tr>
          <tr><td>Retained Earnings</td><td class="money">${formatMoney(sheet.retainedEarnings)}</td></tr>
          <tr class="total-row"><td>Total Liabilities and Equity</td><td class="money">${formatMoney(sheet.totalLiabilitiesEquity)}</td></tr>
        </tbody>
      </table>
    </section>
  </div>

  <div class="page">
    <section class="report-block">
      <h2>Operational Expenses*</h2>
      <table class="report-table">
        <thead><tr><th>Description</th><th class="money">Amount</th></tr></thead>
        <tbody>
          ${expenseRowsHtml || '<tr><td colspan="2">No expenses recorded</td></tr>'}
          <tr class="total-row"><td>Total Operational Expenses</td><td class="money">${formatMoney(-data.operationalExpensesTotal, { parens: true })}</td></tr>
        </tbody>
      </table>
    </section>
  </div>

  <div class="page">
    <section class="report-block">
      <h2>Expected Future Earnings on Outstanding Loans</h2>
      <table class="report-table">
        <thead><tr><th>Description</th><th class="money">Amount</th></tr></thead>
        <tbody>
          ${loanUnearnedHtml || '<tr><td colspan="2">No unearned loan interest on active loans</td></tr>'}
          ${cdUnearnedRow}
          <tr class="total-row"><td>Total Unearned Income</td><td class="money">${formatMoney(data.unearnedIncome.total)}</td></tr>
        </tbody>
      </table>
    </section>
  </div>
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
  generateCooperativeStatusReportPdf,
  defaultReportMonthEnd,
  resolveReportPeriod,
};
