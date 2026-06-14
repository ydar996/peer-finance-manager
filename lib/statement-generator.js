const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const puppeteer = require("puppeteer");

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const formatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
});

function formatMoney(value) {
  const number = Number(value) || 0;
  const formatted = formatter.format(Math.abs(number));
  return number < 0 ? `(${formatted})` : formatted;
}

function sanitizeFilename(value) {
  return value.replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim();
}

function cleanDistributionHeader(value) {
  return String(value || "").replace(/^\*+\s*/, "").trim();
}

/**
 * Parse sheet name like "February 2026" or "Account Statements 2024 F" to get statement month/year.
 * Returns { statementMonthLabel, statementYear, statementMonthIndex } or null.
 */
function parseStatementMonthFromSheetName(sheetName) {
  const match = sheetName.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i
  );
  if (match) {
    const monthName = match[1];
    const year = parseInt(match[2], 10);
    const monthIndex = MONTH_NAMES.findIndex((m) => m.toLowerCase() === monthName.toLowerCase());
    return {
      statementMonthLabel: `${monthName} ${year}`,
      statementYear: year,
      statementMonthIndex: monthIndex >= 0 ? monthIndex : 0,
    };
  }
  return null;
}

/**
 * Parse a distribution/interest payout Excel file.
 * Returns { memberName: amount } map. Members with 0 or blank get 0.
 * Expects: Member Name column + Interest/Distribution/Amount/Dividend column.
 */
function parseDistributionFile(workbookPath) {
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return {};

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rows.length < 2) return {};

  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const row = rows[r].map((h) => String(h || "").trim().toLowerCase());
    const hasName = row.some(
      (h) => h === "member name" || h === "name" || h === "member"
    );
    const hasAmount = row.some(
      (h) =>
        /interest|distribution|amount|dividend|payout/.test(h) &&
        !/registration/.test(h)
    );
    if (hasName && hasAmount) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = rows[headerRowIndex].map((h) =>
    String(h || "").trim().toLowerCase()
  );
  const nameCol = headerRow.findIndex(
    (h) => h === "member name" || h === "name" || h === "member"
  );
  const amountCol = headerRow.findIndex(
    (h) =>
      /interest|distribution|amount|dividend|payout/.test(h) &&
      !/registration/.test(h)
  );
  if (nameCol < 0 || amountCol < 0) return {};

  const result = {};
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[nameCol] || "").trim();
    if (!name || name.toLowerCase() === "total") continue;
    const amount = Number(row[amountCol]) || 0;
    result[name] = amount;
  }
  return result;
}

/**
 * Inspect a workbook and return available sheets and suggested statement sheet.
 */
function inspectWorkbook(workbookPath) {
  const workbook = XLSX.readFile(workbookPath);
  const sheets = workbook.SheetNames || [];
  const statementMonths = sheets
    .map((name) => {
      const parsed = parseStatementMonthFromSheetName(name);
      return parsed ? { sheetName: name, ...parsed } : null;
    })
    .filter(Boolean);
  const suggestedSheet = statementMonths[0]?.sheetName || sheets[0] || null;
  return { sheets, statementMonths, suggestedSheet };
}

/**
 * Parse workbook and extract members. Uses sheet name to derive statement month.
 */
function parseWorkbook(workbookPath, sheetName) {
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet '${sheetName}' not found.`);
  }

  const parsed = parseStatementMonthFromSheetName(sheetName);
  const statementMonthLabel = parsed?.statementMonthLabel || sheetName;
  const statementYear = parsed?.statementYear ?? new Date().getFullYear();
  const statementMonthIndex = parsed?.statementMonthIndex ?? 11;

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rows.length < 3) {
    throw new Error("Worksheet does not contain enough rows.");
  }

  const yearRow = rows[0] || [];
  const headerRow = rows[1] || [];
  if (headerRow[0] !== "Member Name") {
    throw new Error("Unable to locate the member header row.");
  }

  const monthColumns = headerRow
    .map((month, index) => {
      const year = Number(yearRow[index]);
      if (!year || typeof month !== "string" || month === "Month") return null;
      if (!MONTH_NAMES.includes(month)) return null;
      return { year, month, index };
    })
    .filter(Boolean);

  const totalDepositsIndex = headerRow.indexOf("Total Deposits");
  const registrationIndex = headerRow.indexOf("Registration Income");
  const balanceIndex = headerRow.indexOf("Account Balance");

  const prevMonthIndex = (statementMonthIndex + 12 - 1) % 12;
  const prevMonthName = MONTH_NAMES[prevMonthIndex];
  let distributionColIndex = headerRow.findIndex((h) => {
    const s = String(h || "").trim();
    if (!/distribution/i.test(s)) return false;
    return new RegExp(`\\b${prevMonthName}\\b`, "i").test(s);
  });
  if (distributionColIndex < 0) {
    distributionColIndex = headerRow.findIndex((h) =>
      /^\*?\s*Distribution/i.test(String(h || "").trim())
    );
  }
  const workbookDistributionLabel =
    distributionColIndex >= 0
      ? String(headerRow[distributionColIndex] || "").trim()
      : null;

  const memberRows = rows.slice(2).filter((row) => {
    if (!row || !row[0]) return false;
    if (typeof row[0] !== "string") return false;
    return row[0].toLowerCase() !== "total";
  });

  const getMonthValue = (row, year, monthName) => {
    const match = monthColumns.find(
      (col) => col.year === year && col.month === monthName
    );
    return match ? Number(row[match.index]) || 0 : 0;
  };

  const sumYearOnly = (row, exactYear) =>
    monthColumns.reduce((total, col) => {
      if (col.year !== exactYear) return total;
      const value = Number(row[col.index]) || 0;
      return value > 0 ? total + value : total;
    }, 0);

  const years = [...new Set(monthColumns.map((c) => c.year))].sort();
  const detailRows = [];
  for (const y of years) {
    detailRows.push({ type: "yearTotal", year: y, label: `Total Deposits ${y}` });
  }
  const FEBRUARY_INDEX = 1;
  for (let m = 0; m <= statementMonthIndex; m++) {
    detailRows.push({
      type: "monthDeposit",
      year: statementYear,
      month: MONTH_NAMES[m],
      label: `${MONTH_NAMES[m]} ${statementYear} Deposit`,
    });
    // Distribution (e.g. February payout) sits next to the February deposit row.
    if (m === FEBRUARY_INDEX) {
      detailRows.push({ type: "distribution" });
    }
  }

  const members = memberRows.map((row) => {
    const name = row[0];
    const yearTotals = {};
    const monthDeposits = {};
    const monthWithdrawals = {};
    for (const y of years) {
      yearTotals[y] = sumYearOnly(row, y);
    }
    for (let m = 0; m <= statementMonthIndex; m++) {
      const monthName = MONTH_NAMES[m];
      const raw = getMonthValue(row, statementYear, monthName);
      monthDeposits[monthName] = raw > 0 ? raw : 0;
      monthWithdrawals[monthName] = raw < 0 ? raw : 0;
    }
    const totalDeposits =
      Number(row[totalDepositsIndex]) ||
      Object.values(yearTotals).reduce((a, b) => a + b, 0);
    const registrationDeduction = Number(row[registrationIndex]) || 0;
    const accountBalance = Number(row[balanceIndex]) || totalDeposits + registrationDeduction;
    const sheetDistribution =
      distributionColIndex >= 0
        ? Number(row[distributionColIndex]) || 0
        : 0;

    return {
      name,
      yearTotals,
      monthDeposits,
      monthWithdrawals,
      totalDeposits,
      registrationDeduction,
      accountBalance,
      sheetDistribution,
    };
  });

  return {
    members,
    statementMonthLabel,
    statementYear,
    statementMonthIndex,
    years,
    detailRows,
    workbookDistributionLabel,
  };
}

function buildHtml(
  member,
  preparedOn,
  statementMonthLabel,
  statementYear,
  statementMonthIndex,
  years,
  detailRows,
  projectRoot,
  distributionInfo
) {
  const styles = fs.readFileSync(path.join(projectRoot, "styles.css"), "utf8");
  const distributionAmount = distributionInfo
    ? distributionInfo.amounts[member.name] || 0
    : 0;
  const distributionLabel = distributionInfo
    ? `${cleanDistributionHeader(distributionInfo.label)} (Credit)`
    : null;

  const totalDepositsToDate = member.totalDeposits;
  let statementWithdrawals = 0;
  let hasStatementWithdrawal = false;
  for (let m = 0; m <= statementMonthIndex; m++) {
    const withdrawal = member.monthWithdrawals[MONTH_NAMES[m]] || 0;
    if (withdrawal < 0) {
      statementWithdrawals += withdrawal;
      hasStatementWithdrawal = true;
    }
  }

  // Closing balance: start from Total Deposits, apply registration and distribution
  // credits, then subtract any cash withdrawals in this statement period.
  let accountBalanceToDate = member.totalDeposits + member.registrationDeduction;
  if (distributionAmount > 0) {
    accountBalanceToDate += distributionAmount;
  }
  accountBalanceToDate += statementWithdrawals;

  // When a member withdraws in this period, the workbook Account Balance column
  // and distribution credit are already reflected in Total Deposits; only
  // apply the withdrawal against gross deposits (registration still shown as debit).
  if (hasStatementWithdrawal) {
    accountBalanceToDate = member.totalDeposits + statementWithdrawals;
  }

  const statementMonthName = MONTH_NAMES[statementMonthIndex];
  const currentMonthDepositAmount = member.monthDeposits[statementMonthName] || 0;
  const currentMonthWithdrawalAmount =
    member.monthWithdrawals[statementMonthName] || 0;

  const distributionRow =
    distributionLabel && distributionAmount > 0
      ? `<tr><td>${distributionLabel}</td><td>${formatMoney(distributionAmount)}</td></tr>`
      : "";

  let monthRows = "";
  for (const d of detailRows) {
    if (d.type === "yearTotal") {
      const value = formatMoney(member.yearTotals[d.year] || 0);
      monthRows += `<tr><td>${d.label}</td><td>${value}</td></tr>`;
      continue;
    }
    if (d.type === "distribution") {
      if (distributionRow) {
        monthRows += distributionRow;
      }
      continue;
    }
    if (d.type === "monthDeposit") {
      const value = formatMoney(member.monthDeposits[d.month] || 0);
      monthRows += `<tr><td>${d.label}</td><td>${value}</td></tr>`;
      const withdrawal = member.monthWithdrawals[d.month] || 0;
      if (withdrawal < 0) {
        monthRows += `<tr><td>${d.month} ${statementYear} Withdrawal</td><td>${formatMoney(withdrawal)}</td></tr>`;
      }
    }
  }

  return `
<!doctype html>
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
    </style>
  </head>
  <body>
    <div class="app">
      <section class="panel statement">
        <div class="statement-title">
          <p class="brand">Assurance Investment and Cooperative Inc.</p>
          <h2>Statement of Account</h2>
        </div>
        <div class="statement-header">
          <div>
            <p class="label">Member</p>
            <p class="value">${member.name}</p>
          </div>
          <div>
            <p class="label">Statement Month</p>
            <p class="value">${statementMonthLabel}</p>
          </div>
          <div>
            <p class="label">Prepared On</p>
            <p class="value">${preparedOn}</p>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card">
            <p class="label">Total Deposits to Date</p>
            <p class="amount">${formatMoney(totalDepositsToDate)}</p>
          </div>
          <div class="summary-card">
            <p class="label">Registration Deduction</p>
            <p class="amount">${formatMoney(member.registrationDeduction)}</p>
          </div>
          ${years
            .map(
              (y) => `
          <div class="summary-card">
            <p class="label">Total Deposits ${y}</p>
            <p class="amount">${formatMoney(member.yearTotals[y] || 0)}</p>
          </div>`
            )
            .join("")}
          ${distributionAmount > 0 ? `
          <div class="summary-card">
            <p class="label">${distributionLabel}</p>
            <p class="amount">${formatMoney(distributionAmount)}</p>
          </div>` : ""}
          <div class="summary-card">
            <p class="label">${statementMonthName} ${statementYear} Deposit</p>
            <p class="amount">${formatMoney(currentMonthDepositAmount)}</p>
          </div>
          ${currentMonthWithdrawalAmount < 0 ? `
          <div class="summary-card">
            <p class="label">${statementMonthName} ${statementYear} Withdrawal</p>
            <p class="amount">${formatMoney(currentMonthWithdrawalAmount)}</p>
          </div>` : ""}
          <div class="summary-card accent">
            <p class="label">Account Balance</p>
            <p class="amount">${formatMoney(accountBalanceToDate)}</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="statement-table">
            <thead>
              <tr><th>Period</th><th>Contribution</th></tr>
            </thead>
            <tbody>${monthRows}</tbody>
          </table>
        </div>
        <footer class="statement-footer">
          <p class="subtle">
            This statement is generated from Assurance Cooperative records and
            is intended for member use only.
          </p>
        </footer>
      </section>
    </div>
  </body>
</html>
  `;
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

/**
 * Generate PDF statements. Returns { count, outputDir, outputPaths }.
 * Accepts: { workbookPath, sheetName, baseDir, onProgress } or positional args.
 */
async function generateStatements(optsOrPath, sheetName, projectRoot, onProgress) {
  const opts =
    typeof optsOrPath === "object" && optsOrPath !== null
      ? optsOrPath
      : {
          workbookPath: optsOrPath,
          sheetName,
          baseDir: projectRoot,
          onProgress,
        };
  const root = opts.baseDir || path.join(__dirname, "..");
  const workbookPath = opts.workbookPath;
  const sheetNameToUse = opts.sheetName ?? sheetName;
  const onProg = opts.onProgress ?? onProgress;
  const parsed = parseWorkbook(workbookPath, sheetNameToUse);
  const {
    members,
    statementMonthLabel,
    statementYear,
    statementMonthIndex,
    years,
    detailRows,
    workbookDistributionLabel,
  } = parsed;

  let distributionInfo = null;
  const sheetAmounts = Object.fromEntries(
    members.map((m) => [m.name, m.sheetDistribution || 0])
  );
  const hasSheetDistribution = Object.values(sheetAmounts).some((a) => a > 0);

  let fileAmounts = {};
  if (opts.distributionFilePath && fs.existsSync(opts.distributionFilePath)) {
    try {
      fileAmounts = parseDistributionFile(opts.distributionFilePath) || {};
    } catch (_) {}
  }
  const hasFileAmounts = Object.values(fileAmounts).some((a) => a > 0);

  if (hasSheetDistribution || hasFileAmounts) {
    const mergedAmounts = {};
    for (const m of members) {
      mergedAmounts[m.name] =
        (sheetAmounts[m.name] || 0) + (fileAmounts[m.name] || 0);
    }
    let label = "Interest/Distribution";
    if (hasSheetDistribution && workbookDistributionLabel) {
      label = cleanDistributionHeader(workbookDistributionLabel) || label;
    }
    if (hasFileAmounts && opts.distributionFilePath) {
      const baseName = path.basename(
        opts.distributionFilePath,
        path.extname(opts.distributionFilePath)
      );
      const yearMatch = baseName.match(/\b(20\d{2})\b/);
      const yearLabel = yearMatch ? yearMatch[1] : baseName;
      if (hasSheetDistribution) {
        label = `${label} + file (${yearLabel})`;
      } else {
        label = `Interest/Distribution (${yearLabel})`;
      }
    }
    distributionInfo = { amounts: mergedAmounts, label };
  }

  const yyyymm = `${statementYear}-${String(statementMonthIndex + 1).padStart(2, "0")}`;
  const slug =
    opts.outputSubdir && String(opts.outputSubdir).trim()
      ? String(opts.outputSubdir).trim()
      : yyyymm;
  const outputDir = path.join(root, "statements", slug);
  fs.mkdirSync(outputDir, { recursive: true });

  const preparedOn = new Date().toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const executablePath = resolveExecutablePath();
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  if (onProg) onProg("Browser ready", 0, members.length);

  const outputPaths = [];
  try {
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (onProg) onProg(member.name, i + 1, members.length);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      const html = buildHtml(
        member,
        preparedOn,
        statementMonthLabel,
        statementYear,
        statementMonthIndex,
        years,
        detailRows,
        root,
        distributionInfo
      );
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 0 });
      const distAmount = distributionInfo
        ? distributionInfo.amounts[member.name] || 0
        : 0;
      const hasDistribution = distAmount > 0 && distributionInfo;
      const fileName = hasDistribution
        ? `Account Statement - ${sanitizeFilename(member.name)} - ${statementMonthLabel} with Distribution.pdf`
        : `${sanitizeFilename(member.name)} - ${statementMonthLabel}.pdf`;
      const outputPath = path.join(outputDir, fileName);
      await page.pdf({
        path: outputPath,
        format: "A4",
        printBackground: true,
        margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
      });
      await page.close();
      outputPaths.push(outputPath);
    }
  } finally {
    await browser.close();
  }

  return { count: members.length, outputDir, outputPaths };
}

module.exports = {
  inspectWorkbook,
  parseWorkbook,
  parseDistributionFile,
  generateStatements,
  parseStatementMonthFromSheetName,
};
