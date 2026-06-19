const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { getCoopRoot, getStatementsDir } = require("./paths");
const { getDb } = require("../db/database");
const {
  getMemberDepositAccountBalance,
  attachDepositRunningBalances,
} = require("./balance-service");
const { TRANSACTION_TYPES, MONTH_NAMES } = require("./constants");

const DEPOSIT_STATEMENT_TYPES = [
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.DISTRIBUTION,
  TRANSACTION_TYPES.MEMBERSHIP_FEE,
];

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatMoney(value) {
  const number = Number(value) || 0;
  const formatted = moneyFmt.format(Math.abs(number));
  return number < 0 ? `(${formatted})` : formatted;
}

function formatTxType(type) {
  const labels = {
    deposit: "Contribution",
    withdrawal: "Withdrawal",
    distribution: "Distribution",
    membership_fee: "Registration Fee",
  };
  return labels[type] || String(type || "").replace(/_/g, " ");
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
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

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function monthRange(year, month) {
  const padded = String(month).padStart(2, "0");
  const lastDay = lastDayOfMonth(year, month);
  return {
    start: `${year}-${padded}-01`,
    end: `${year}-${padded}-${String(lastDay).padStart(2, "0")}`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    slug: `${year}-${padded}`,
  };
}

function openingBalanceBefore(memberId, beforeDate) {
  const db = getDb();
  const placeholders = DEPOSIT_STATEMENT_TYPES.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE member_id = ? AND type IN (${placeholders}) AND transaction_date < ?`
    )
    .get(memberId, ...DEPOSIT_STATEMENT_TYPES, beforeDate).total;
}

function getDepositLedgerTransactions(memberId) {
  const db = getDb();
  const placeholders = DEPOSIT_STATEMENT_TYPES.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT * FROM transactions
       WHERE member_id = ? AND type IN (${placeholders})
       ORDER BY transaction_date ASC, id ASC`
    )
    .all(memberId, ...DEPOSIT_STATEMENT_TYPES);
}

function getMemberStatementData(memberId, options = {}) {
  const db = getDb();
  const profile = db
    .prepare(
      `SELECT m.name AS ledger_account_name, mp.display_name, mp.email
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE m.id = ?`
    )
    .get(memberId);
  if (!profile) return null;

  const transactions = getDepositLedgerTransactions(memberId);
  const withBalances = attachDepositRunningBalances(memberId, transactions);
  const balance = getMemberDepositAccountBalance(memberId);
  const memberName = profile.display_name || profile.ledger_account_name;

  let periodLabel = "All Activity";
  let openingBalance = 0;
  let periodTransactions = withBalances;

  if (options.year && options.month) {
    const range = monthRange(Number(options.year), Number(options.month));
    periodLabel = range.label;
    openingBalance = openingBalanceBefore(memberId, range.start);
    periodTransactions = withBalances.filter(
      (tx) => tx.transaction_date >= range.start && tx.transaction_date <= range.end
    );
  }

  const closingBalance =
    periodTransactions.length > 0
      ? periodTransactions[periodTransactions.length - 1].balance_after
      : openingBalance;

  return {
    profile,
    transactions: periodTransactions,
    balance,
    memberName,
    ledgerName: profile.ledger_account_name,
    periodLabel,
    openingBalance,
    closingBalance,
    isMonthly: Boolean(options.year && options.month),
  };
}

function listMemberDepositStatementMonths(memberId) {
  const db = getDb();
  const placeholders = DEPOSIT_STATEMENT_TYPES.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT DISTINCT
          CAST(strftime('%Y', transaction_date) AS INTEGER) AS year,
          CAST(strftime('%m', transaction_date) AS INTEGER) AS month
       FROM transactions
       WHERE member_id = ? AND type IN (${placeholders})
       ORDER BY year DESC, month DESC`
    )
    .all(memberId, ...DEPOSIT_STATEMENT_TYPES);

  const months = rows.map((row) => ({
    year: row.year,
    month: row.month,
    label: `${MONTH_NAMES[row.month - 1]} ${row.year}`,
    slug: `${row.year}-${String(row.month).padStart(2, "0")}`,
  }));

  const data = getMemberStatementData(memberId);
  if (!data) return months;

  const seen = new Set(months.map((m) => m.slug));
  const statementsRoot = getStatementsDir();
  if (fs.existsSync(statementsRoot)) {
    for (const dirName of fs.readdirSync(statementsRoot)) {
      if (!/^\d{4}-\d{2}$/.test(dirName) || seen.has(dirName)) continue;
      const dir = path.join(statementsRoot, dirName);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
      } catch (_) {
        continue;
      }
      const pdf = findExistingMonthlyStatementPdf(data, dir);
      if (!pdf) continue;
      const [year, month] = dirName.split("-").map(Number);
      months.push({
        year,
        month,
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        slug: dirName,
        hasGeneratedPdf: true,
      });
      seen.add(dirName);
    }
  }

  return months.sort((a, b) => b.year - a.year || b.month - a.month);
}

function findExistingMonthlyStatementPdf(data, statementsDir) {
  if (!fs.existsSync(statementsDir)) return null;
  const names = [data.memberName, data.ledgerName].filter(Boolean).map(sanitizeFilename);
  const files = fs.readdirSync(statementsDir).filter((f) => f.endsWith(".pdf"));
  for (const file of files) {
    if (names.some((name) => file.includes(name))) {
      return path.join(statementsDir, file);
    }
  }
  return null;
}

function buildDepositStatementHtml(data, preparedOn) {
  const projectRoot = getCoopRoot();
  const stylesPath = path.join(projectRoot, "styles.css");
  const styles = fs.existsSync(stylesPath) ? fs.readFileSync(stylesPath, "utf8") : "";
  const rows = data.transactions
    .map(
      (tx) => `
      <tr>
        <td>${tx.transaction_date}</td>
        <td>${formatTxType(tx.type)}</td>
        <td class="money">${formatMoney(tx.amount)}</td>
        <td class="money">${formatMoney(tx.balance_after ?? 0)}</td>
        <td>${String(tx.description || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>
      </tr>`
    )
    .join("");

  const summaryRows = data.isMonthly
    ? `
      <div><p class="label">Opening Balance</p><p class="value">${formatMoney(data.openingBalance)}</p></div>
      <div><p class="label">Closing Balance</p><p class="value">${formatMoney(data.closingBalance)}</p></div>`
    : `<div><p class="label">Current Balance</p><p class="value">${formatMoney(data.balance)}</p></div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
${styles}
body { background: #fff; }
.topbar, .controls, .btn, .tabs { display: none !important; }
</style></head><body>
<div class="app"><section class="panel statement">
  <div class="statement-title">
    <p class="brand">Assurance Investment and Cooperative Inc.</p>
    <h2>Member Contributions Account Statement</h2>
  </div>
  <div class="statement-header">
    <div><p class="label">Member</p><p class="value">${data.memberName}</p></div>
    <div><p class="label">Statement Period</p><p class="value">${data.periodLabel}</p></div>
    <div><p class="label">Prepared On</p><p class="value">${preparedOn}</p></div>
    ${summaryRows}
  </div>
  <div class="table-wrap">
    <table class="statement-table">
      <thead><tr><th>Date</th><th>Type</th><th class="money">Amount</th><th class="money">Balance</th><th>Description</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No transactions</td></tr>'}</tbody>
    </table>
  </div>
</section></div></body></html>`;
}

async function generateMemberDepositStatementPdf(memberId, options = {}) {
  const data = getMemberStatementData(memberId, options);
  if (!data) throw new Error("Member not found");

  if (options.year && options.month) {
    const range = monthRange(Number(options.year), Number(options.month));
    const statementsDir = path.join(getStatementsDir(), range.slug);
    const existing = findExistingMonthlyStatementPdf(data, statementsDir);
    if (existing && !options.forceGenerate) {
      return { outputPath: existing, fileName: path.basename(existing), reused: true };
    }
  }

  const preparedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const html = buildDepositStatementHtml(data, preparedOn);
  const monthTag = options.year && options.month
    ? monthRange(Number(options.year), Number(options.month)).slug
    : new Date().toISOString().slice(0, 7);
  const outDir =
    options.year && options.month
      ? path.join(getStatementsDir(), monthTag)
      : path.join(getStatementsDir(), "member-deposits", monthTag);
  fs.mkdirSync(outDir, { recursive: true });
  const periodSuffix = options.year && options.month
    ? monthRange(Number(options.year), Number(options.month)).label
    : "Full History";
  const fileName = `Contributions Statement - ${sanitizeFilename(data.memberName)} - ${periodSuffix}.pdf`;
  const outputPath = path.join(outDir, fileName);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveExecutablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: outputPath,
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });
  } finally {
    await browser.close();
  }

  return { outputPath, fileName, reused: false };
}

module.exports = {
  getMemberStatementData,
  listMemberDepositStatementMonths,
  generateMemberDepositStatementPdf,
  formatTxType,
};
