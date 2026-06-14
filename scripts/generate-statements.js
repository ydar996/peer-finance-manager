const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const puppeteer = require("puppeteer");

const workbookPath =
  process.argv[2] || path.join(__dirname, "..", "Assurance Status 1 2025.xlsx");
const outputDir = path.join(__dirname, "..", "statements", "2026-01");

const statementMonthLabel = "January 2026";
const months2025 = [
  "January (2025)",
  "February (2025)",
  "March (2025)",
  "April (2025)",
  "May (2025)",
  "June (2025)",
  "July (2025)",
  "August (2025)",
  "September (2025)",
  "October (2025)",
  "November (2025)",
  "December (2025)",
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

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function sanitizeFilename(value) {
  return value.replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim();
}

function parseWorkbook() {
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets["Account Statements 2024 F"];
  if (!sheet) {
    throw new Error("Sheet 'Account Statements 2024 F' not found.");
  }

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
      return { year, month, index };
    })
    .filter(Boolean);

  const totalDepositsIndex = headerRow.indexOf("Total Deposits");
  const registrationIndex = headerRow.indexOf("Registration Income");
  const balanceIndex = headerRow.indexOf("Account Balance");

  const memberRows = rows.slice(2).filter((row) => {
    if (!row || !row[0]) return false;
    if (typeof row[0] !== "string") return false;
    return row[0].toLowerCase() !== "total";
  });

  const sumUpToYear = (row, maxYear) =>
    monthColumns.reduce((total, column) => {
      if (column.year > maxYear) return total;
      return total + (Number(row[column.index]) || 0);
    }, 0);

  const getMonthValue = (row, year, monthName) => {
    const match = monthColumns.find(
      (column) => column.year === year && column.month === monthName
    );
    return match ? Number(row[match.index]) || 0 : 0;
  };

  const sumYearOnly = (row, exactYear) =>
    monthColumns.reduce((total, column) => {
      if (column.year !== exactYear) return total;
      return total + (Number(row[column.index]) || 0);
    }, 0);

  return memberRows.map((row) => {
    const name = row[0];
    const total2023 = sumYearOnly(row, 2023);
    const total2024 = sumYearOnly(row, 2024);
    const total2025 = sumYearOnly(row, 2025);
    const total2026 = sumYearOnly(row, 2026);
    const january2026Deposit = getMonthValue(row, 2026, "January");
    const totalDeposits =
      Number(row[totalDepositsIndex]) ||
      total2023 + total2024 + total2025 + total2026;
    const registrationDeduction = Number(row[registrationIndex]) || 0;
    const accountBalance =
      Number(row[balanceIndex]) || totalDeposits + registrationDeduction;

    return {
      name,
      months: months2025,
      total2023,
      total2024,
      total2025,
      total2026,
      january2026Deposit,
      totalDeposits,
      registrationDeduction,
      accountBalance,
    };
  });
}

function buildHtml(member, preparedOn) {
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const totalDepositsToDate =
    member.total2023 +
    member.total2024 +
    member.total2025 +
    member.total2026;
  const accountBalanceToDate =
    totalDepositsToDate + member.registrationDeduction;

  const monthRows = [
    ["Total Deposits 2023", formatMoney(member.total2023)],
    ["Total Deposits 2024", formatMoney(member.total2024)],
    ["Total Deposits 2025", formatMoney(member.total2025)],
    ["January 2026 Deposit", formatMoney(member.january2026Deposit)],
  ]
    .map(
      ([label, value]) => `
        <tr>
          <td>${label}</td>
          <td>${value}</td>
        </tr>`
    )
    .join("");

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
                <p class="label">Total Deposits 2023</p>
                <p class="amount">${formatMoney(member.total2023)}</p>
              </div>
              <div class="summary-card">
                <p class="label">Total Deposits 2024</p>
                <p class="amount">${formatMoney(member.total2024)}</p>
              </div>
              <div class="summary-card">
                <p class="label">Total Deposits 2025</p>
                <p class="amount">${formatMoney(member.total2025)}</p>
              </div>
              <div class="summary-card">
                <p class="label">Total Deposits 2026</p>
                <p class="amount">${formatMoney(member.total2026)}</p>
              </div>
              <div class="summary-card">
                <p class="label">Registration Deduction</p>
                <p class="amount">${formatMoney(member.registrationDeduction)}</p>
              </div>
              <div class="summary-card accent">
                <p class="label">Account Balance</p>
                <p class="amount">${formatMoney(accountBalanceToDate)}</p>
              </div>
              <div class="summary-card">
                <p class="label">Total Deposits to Date</p>
                <p class="amount">${formatMoney(totalDepositsToDate)}</p>
              </div>
            </div>
            <div class="table-wrap">
              <table class="statement-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  ${monthRows}
                </tbody>
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

async function generateStatements() {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found at ${workbookPath}`);
  }

  const members = parseWorkbook();
  if (!members.length) {
    throw new Error("No members found in the workbook.");
  }

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
  try {
    for (const member of members) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      const html = buildHtml(member, preparedOn);
      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: 0,
      });
      const fileName = `${sanitizeFilename(member.name)} - ${statementMonthLabel}.pdf`;
      const outputPath = path.join(outputDir, fileName);
      await page.pdf({
        path: outputPath,
        format: "A4",
        printBackground: true,
        margin: {
          top: "16mm",
          bottom: "16mm",
          left: "14mm",
          right: "14mm",
        },
      });
      await page.close();
      console.log(`Saved: ${outputPath}`);
    }
  } finally {
    await browser.close();
  }
}

function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const candidates = [
    "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`Using browser executable at ${candidate}`);
      return candidate;
    }
  }

  console.log("Using bundled Chromium from Puppeteer.");
  return undefined;
}

generateStatements().catch((error) => {
  console.error(error);
  process.exit(1);
});
