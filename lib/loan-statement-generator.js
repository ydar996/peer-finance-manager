const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { getCoopRoot, getStatementsDir } = require("./paths");
const { getDb } = require("../db/database");
const { MONTH_NAMES } = require("./constants");

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatMoney(value) {
  const number = Number(value) || 0;
  const formatted = moneyFmt.format(Math.abs(number));
  return number < 0 ? `(${formatted})` : formatted;
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDisplayDate(value) {
  if (!value || value === ":") return ":";
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function getBorrowerProfile(memberId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT m.name AS ledger_account_name, mp.display_name, mp.email, mp.phone
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE m.id = ?`
    )
    .get(memberId);
}

function monthRange(year, month) {
  const padded = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${padded}-01`,
    end: `${year}-${padded}-${String(lastDay).padStart(2, "0")}`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

function buildActivityRows(loan, options = {}) {
  const rows = [];
  let balance = loan.principal;
  rows.push({
    date: loan.disbursementDate,
    type: "Disbursement",
    amount: -loan.principal,
    balance,
    description: loan.disbursementDescription || "Loan disbursement",
  });

  const repayments = [...(loan.repayments || [])].sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    return byDate !== 0 ? byDate : (a.transactionId || 0) - (b.transactionId || 0);
  });

  for (const payment of repayments) {
    balance = Math.max(0, balance - payment.amount);
    rows.push({
      date: payment.date,
      type: "Repayment",
      amount: payment.amount,
      balance,
      description: payment.description || "",
    });
  }

  if (!options.year || !options.month) {
    return {
      rows,
      periodLabel: "All Activity",
      openingBalance: loan.principal,
      closingBalance: rows[rows.length - 1]?.balance ?? loan.outstanding,
      isMonthly: false,
    };
  }

  const range = monthRange(Number(options.year), Number(options.month));
  const beforeMonth = rows.filter((row) => String(row.date) < range.start);
  const openingBalance =
    beforeMonth.length > 0
      ? beforeMonth[beforeMonth.length - 1].balance
      : rows[0]?.date && String(rows[0].date) < range.start
        ? loan.principal
        : 0;
  const periodRows = rows.filter(
    (row) => String(row.date) >= range.start && String(row.date) <= range.end
  );
  const closingBalance =
    periodRows.length > 0
      ? periodRows[periodRows.length - 1].balance
      : openingBalance;

  return {
    rows: periodRows,
    periodLabel: range.label,
    openingBalance,
    closingBalance,
    isMonthly: true,
  };
}

function buildScheduleHtml(loan) {
  if (!loan.schedule?.length) return "";
  const rows = loan.schedule
    .map(
      (row) => `
      <tr>
        <td>${row.period}</td>
        <td>${formatDisplayDate(row.dueDate || ":")}</td>
        <td class="money">${formatMoney(row.totalDue || 0)}</td>
        <td class="money">${formatMoney(row.interest || 0)}</td>
        <td class="money">${formatMoney(row.principal || 0)}</td>
      </tr>`
    )
    .join("");
  const meta = [];
  if (loan.scheduledMonthlyPayment != null) {
    meta.push(`Agreed payment ${formatMoney(loan.scheduledMonthlyPayment)}`);
  }
  if (loan.scheduledTotalInterest != null) {
    meta.push(`Total scheduled interest ${formatMoney(loan.scheduledTotalInterest)}`);
  }
  return `
    <h3 style="margin-top:24px">${loan.scheduleTitle || "Agreed Repayment Schedule"}</h3>
    <p class="subtle">Informational only : actual repayments come from bank records.</p>
    ${meta.length ? `<p class="subtle">${meta.join(" · ")}</p>` : ""}
    <div class="table-wrap">
      <table class="statement-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Due</th>
            <th class="money">Payment</th>
            <th class="money">Interest</th>
            <th class="money">Principal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function buildLoanStatementHtml(loan, profile, preparedOn, options = {}) {
  const projectRoot = getCoopRoot();
  const stylesPath = path.join(projectRoot, "styles.css");
  const styles = fs.existsSync(stylesPath) ? fs.readFileSync(stylesPath, "utf8") : "";
  const borrower = loan.borrower || profile?.display_name || profile?.ledger_account_name || "Member";
  const activity = buildActivityRows(loan, options);
  const activityRows = activity.rows;
  const statusLabel = loan.status === "paid" ? "Paid in Full" : "Active";
  const principalNote = loan.principalNote
    ? `<p class="subtle">${String(loan.principalNote).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`
    : "";

  const activityHtml = activityRows
    .map(
      (row) => `
      <tr>
        <td>${formatDisplayDate(row.date)}</td>
        <td>${row.type}</td>
        <td class="money">${formatMoney(row.amount)}</td>
        <td class="money">${formatMoney(row.balance)}</td>
        <td>${String(row.description || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${styles}
      body { background: #ffffff; }
      .topbar, .controls, .btn { display: none !important; }
      .app { padding: 0; max-width: none; }
      .panel { box-shadow: none; border-radius: 0; padding: 0; }
      .statement { padding: 0; }
      .statement-table td.money, .statement-table th.money { text-align: right; }
    </style>
  </head>
  <body>
    <div class="app">
      <section class="panel statement">
        <div class="statement-title">
          <p class="brand">Assurance Investment and Cooperative Inc.</p>
          <h2>Loan Account Statement</h2>
        </div>
        <div class="statement-header">
          <div>
            <p class="label">Borrower</p>
            <p class="value">${borrower}</p>
          </div>
          <div>
            <p class="label">Loan</p>
            <p class="value">Loan ${loan.loanNumber} · Disbursed ${formatDisplayDate(loan.disbursementDate)}</p>
          </div>
          <div>
            <p class="label">Statement Period</p>
            <p class="value">${activity.periodLabel}</p>
          </div>
          <div>
            <p class="label">Prepared On</p>
            <p class="value">${preparedOn}</p>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card">
            <p class="label">Principal Disbursed</p>
            <p class="amount">${formatMoney(loan.principal)}</p>
          </div>
          ${activity.isMonthly ? `
          <div class="summary-card">
            <p class="label">Opening Balance</p>
            <p class="amount">${formatMoney(activity.openingBalance)}</p>
          </div>
          <div class="summary-card accent">
            <p class="label">Closing Balance</p>
            <p class="amount">${formatMoney(activity.closingBalance)}</p>
          </div>` : `
          <div class="summary-card">
            <p class="label">Total Repaid</p>
            <p class="amount">${formatMoney(loan.collected)}</p>
          </div>
          <div class="summary-card accent">
            <p class="label">Outstanding Balance</p>
            <p class="amount">${formatMoney(loan.outstanding)}</p>
          </div>`}
          <div class="summary-card">
            <p class="label">Interest Earned</p>
            <p class="amount">${formatMoney(loan.interestIncome || 0)}</p>
          </div>
          <div class="summary-card">
            <p class="label">Status</p>
            <p class="amount" style="font-size:18px">${statusLabel}</p>
          </div>
        </div>
        ${principalNote}
        <div class="table-wrap">
          <table class="statement-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th class="money">Amount</th>
                <th class="money">Balance</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>${activityHtml}</tbody>
          </table>
        </div>
        ${buildScheduleHtml(loan)}
        <footer class="statement-footer">
          <p class="subtle">
            This loan account statement lists all disbursements and repayments recorded for
            this loan. It is generated from Assurance Cooperative bank ledger records.
          </p>
        </footer>
      </section>
    </div>
  </body>
</html>`;
}

async function generateLoanStatementPdf(loan, options = {}) {
  if (!loan) throw new Error("Loan not found");

  const profile = getBorrowerProfile(loan.memberId);
  const preparedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const html = buildLoanStatementHtml(loan, profile, preparedOn, options);

  const borrowerSlug = sanitizeFilename(loan.borrower || profile?.ledger_account_name || "member");
  const periodSlug =
    options.year && options.month
      ? monthRange(Number(options.year), Number(options.month)).label
      : loan.disbursementDate;
  const outputDir = path.join(getStatementsDir(), "loan-accounts", borrowerSlug);
  fs.mkdirSync(outputDir, { recursive: true });

  const fileName = `Loan ${loan.loanNumber} - ${borrowerSlug} - ${periodSlug}.pdf`;
  const outputPath = path.join(outputDir, fileName);

  const executablePath = resolveExecutablePath();
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    args: ["--no-sandbox", "--disable-gpu"],
    timeout: 60000,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      timeout: 60000,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    await page.close();
  } finally {
    await browser.close();
  }

  return {
    outputPath,
    outputDir,
    fileName,
    relativePath: path
      .relative(getCoopRoot(), outputPath)
      .split(path.sep)
      .join("/"),
  };
}

module.exports = {
  buildLoanStatementHtml,
  generateLoanStatementPdf,
};
