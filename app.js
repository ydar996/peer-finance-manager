const statementMonthOptions = ["January (2026)"];

const formatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
});

const state = {
  members: [],
  selectedMemberName: "",
  selectedMonthIndex: 0,
};

function logStatus(message, data) {
  if (data !== undefined) {
    console.log(`[Statement App] ${message}`, data);
    return;
  }
  console.log(`[Statement App] ${message}`);
}

const fileInput = document.getElementById("fileInput");
const memberSelect = document.getElementById("memberSelect");
const monthSelect = document.getElementById("monthSelect");
const printBtn = document.getElementById("printBtn");
const memberNameEl = document.getElementById("memberName");
const statementMonthEl = document.getElementById("statementMonth");
const preparedOnEl = document.getElementById("preparedOn");
const total2023El = document.getElementById("total2023");
const total2024El = document.getElementById("total2024");
const total2025El = document.getElementById("total2025");
const total2026El = document.getElementById("total2026");
const totalDepositsEl = document.getElementById("totalDeposits");
const registrationDeductionEl = document.getElementById("registrationDeduction");
const accountBalanceEl = document.getElementById("accountBalance");
const monthsTableBody = document.getElementById("monthsTableBody");

function formatMoney(value) {
  const number = Number(value) || 0;
  const formatted = formatter.format(Math.abs(number));
  return number < 0 ? `(${formatted})` : formatted;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function buildMonthOptions() {
  monthSelect.innerHTML = "";
  statementMonthOptions.forEach((label, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = label.replace(" (2025)", " 2025");
    monthSelect.appendChild(option);
  });
  monthSelect.value = String(state.selectedMonthIndex);
}

function renderStatement() {
  performance.mark("render-start");
  const member = state.members.find(
    (item) => item.name === state.selectedMemberName
  );

  if (!member) {
    memberNameEl.textContent = "—";
    statementMonthEl.textContent = "—";
    preparedOnEl.textContent = "—";
    total2023El.textContent = "—";
    total2024El.textContent = "—";
    total2025El.textContent = "—";
    total2026El.textContent = "—";
    totalDepositsEl.textContent = "—";
    registrationDeductionEl.textContent = "—";
    accountBalanceEl.textContent = "—";
    monthsTableBody.innerHTML =
      '<tr><td colspan="2" class="empty">Load a workbook to view data.</td></tr>';
    printBtn.disabled = true;
    performance.mark("render-end");
    performance.measure("render", "render-start", "render-end");
    return;
  }

  const january2026Deposit = member.january2026Deposit;
  const totalDepositsToDate =
    member.total2023 + member.total2024 + member.total2025 + member.total2026;
  const accountBalanceToDate = totalDepositsToDate + member.registrationDeduction;

  memberNameEl.textContent = member.name;
  statementMonthEl.textContent = "January 2026";
  preparedOnEl.textContent = new Date().toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  total2023El.textContent = formatMoney(member.total2023);
  total2024El.textContent = formatMoney(member.total2024);
  total2025El.textContent = formatMoney(member.total2025);
  total2026El.textContent = formatMoney(member.total2026);
  totalDepositsEl.textContent = formatMoney(totalDepositsToDate);
  registrationDeductionEl.textContent = formatMoney(member.registrationDeduction);
  accountBalanceEl.textContent = formatMoney(accountBalanceToDate);

  monthsTableBody.innerHTML = "";
  const rows = [
    ["Total Deposits 2023", member.total2023],
    ["Total Deposits 2024", member.total2024],
    ["Total Deposits 2025", member.total2025],
    ["January 2026 Deposit", january2026Deposit],
  ];
  rows.forEach(([label, value]) => {
    const row = document.createElement("tr");
    const labelCell = document.createElement("td");
    const valueCell = document.createElement("td");
    labelCell.textContent = label;
    valueCell.textContent = formatMoney(value);
    row.appendChild(labelCell);
    row.appendChild(valueCell);
    monthsTableBody.appendChild(row);
  });

  printBtn.disabled = false;
  performance.mark("render-end");
  performance.measure("render", "render-start", "render-end");
}

function parseWorkbook(workbook) {
  performance.mark("parse-start");
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

  const sumYearOnly = (row, exactYear) =>
    monthColumns.reduce((total, column) => {
      if (column.year !== exactYear) return total;
      return total + (Number(row[column.index]) || 0);
    }, 0);

  const getMonthValue = (row, year, monthName) => {
    const match = monthColumns.find(
      (column) => column.year === year && column.month === monthName
    );
    return match ? Number(row[match.index]) || 0 : 0;
  };

  const members = memberRows.map((row) => {
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

  performance.mark("parse-end");
  performance.measure("parse", "parse-start", "parse-end");
  logStatus("Parsed members", members.length);
  return members;
}

function handleFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (typeof XLSX === "undefined") {
    logStatus("XLSX library is missing on file upload.");
    alert(
      "XLSX library is not loaded. Please check the console for loader errors."
    );
    return;
  }

  logStatus("File selected", { name: file.name, size: file.size });
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      performance.mark("read-start");
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      performance.mark("read-end");
      performance.measure("read", "read-start", "read-end");
      logStatus("Workbook loaded", workbook.SheetNames);
      state.members = parseWorkbook(workbook);
      if (!state.members.length) {
        throw new Error("No members found in the worksheet.");
      }
      state.selectedMemberName = state.members[0].name;
      memberSelect.disabled = false;
      monthSelect.disabled = false;
      populateMemberSelect();
      renderStatement();
    } catch (error) {
      logStatus("Workbook parse failed", error);
      alert(error.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function populateMemberSelect() {
  memberSelect.innerHTML = "";
  state.members.forEach((member) => {
    const option = document.createElement("option");
    option.value = member.name;
    option.textContent = member.name;
    memberSelect.appendChild(option);
  });
  memberSelect.value = state.selectedMemberName;
}

fileInput.addEventListener("change", handleFileChange);
memberSelect.addEventListener("change", (event) => {
  state.selectedMemberName = event.target.value;
  renderStatement();
});
monthSelect.addEventListener("change", (event) => {
  state.selectedMonthIndex = Number(event.target.value);
  renderStatement();
});
printBtn.addEventListener("click", () => window.print());

buildMonthOptions();
renderStatement();
logStatus("App initialized", {
  hasXlsx: typeof XLSX !== "undefined",
  userAgent: navigator.userAgent,
});
