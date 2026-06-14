const XLSX = require("xlsx");
const { importLoanSchedule } = require("./loan-service");

function parseScheduleFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  return rows.map((row, idx) => {
    const dueDate =
      row.due_date ||
      row.dueDate ||
      row["Due Date"] ||
      row.Date;
    const totalDue = Number(
      row.total_due ?? row.totalDue ?? row["Total Due"] ?? row.Amount ?? row.amount
    );
    if (!dueDate || !totalDue) return null;
    return {
      installmentNumber: Number(row.installment ?? row.installment_number ?? idx + 1),
      dueDate: normalizeDate(dueDate),
      principalDue: Number(row.principal_due ?? row.principal ?? 0),
      interestDue: Number(row.interest_due ?? row.interest ?? 0),
      totalDue,
      paidAmount: Number(row.paid_amount ?? row.paid ?? 0),
      paidDate: row.paid_date ? normalizeDate(row.paid_date) : null,
    };
  }).filter(Boolean);
}

function normalizeDate(value) {
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  throw new Error(`Invalid date: ${value}`);
}

function importScheduleFromFile(loanId, filePath) {
  const rows = parseScheduleFile(filePath);
  if (!rows.length) throw new Error("No schedule rows found");
  importLoanSchedule(loanId, rows);
  return rows.length;
}

module.exports = { parseScheduleFile, importScheduleFromFile };
