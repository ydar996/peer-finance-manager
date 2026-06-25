const { getDb } = require("../db/database");

function ensureExpenseReportLabelSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_report_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const columns = db.prepare(`PRAGMA table_info(expenses)`).all();
  if (!columns.some((column) => column.name === "report_label_id")) {
    db.exec(
      `ALTER TABLE expenses ADD COLUMN report_label_id INTEGER REFERENCES expense_report_labels(id)`
    );
  }
}

function normalizeLabelText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function listExpenseReportLabels() {
  const db = getDb();
  ensureExpenseReportLabelSchema(db);
  return db
    .prepare(`SELECT id, label FROM expense_report_labels ORDER BY label COLLATE NOCASE ASC`)
    .all()
    .map((row) => ({ id: row.id, label: row.label }));
}

function findOrCreateExpenseReportLabel(labelText) {
  const label = normalizeLabelText(labelText);
  if (!label) throw new Error("Report label is required");
  const db = getDb();
  ensureExpenseReportLabelSchema(db);
  const existing = db
    .prepare(`SELECT id, label FROM expense_report_labels WHERE label = ? COLLATE NOCASE`)
    .get(label);
  if (existing) return existing;
  const result = db.prepare(`INSERT INTO expense_report_labels (label) VALUES (?)`).run(label);
  return { id: result.lastInsertRowid, label };
}

function listExpenseReportLines() {
  const db = getDb();
  ensureExpenseReportLabelSchema(db);
  const rows = db
    .prepare(
      `SELECT e.id, e.description, e.amount, e.expense_date, e.category, e.report_label_id,
              l.label AS report_label
       FROM expenses e
       LEFT JOIN expense_report_labels l ON l.id = e.report_label_id
       ORDER BY e.expense_date ASC, e.id ASC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    amount: row.amount,
    expenseDate: row.expense_date,
    category: row.category,
    reportLabelId: row.report_label_id,
    reportLabel: row.report_label,
  }));
}

function updateExpenseReportLineLabels(assignments = []) {
  const db = getDb();
  ensureExpenseReportLabelSchema(db);
  if (!Array.isArray(assignments) || !assignments.length) {
    throw new Error("No expense label assignments provided");
  }

  const updateStmt = db.prepare(
    `UPDATE expenses SET report_label_id = ? WHERE id = ?`
  );

  const tx = db.transaction((items) => {
    for (const item of items) {
      const expenseId = Number(item.expenseId);
      if (!Number.isFinite(expenseId)) throw new Error("Invalid expense id");
      const expense = db.prepare(`SELECT id FROM expenses WHERE id = ?`).get(expenseId);
      if (!expense) throw new Error(`Expense ${expenseId} not found`);

      let labelId = null;
      if (item.label != null && String(item.label).trim()) {
        labelId = findOrCreateExpenseReportLabel(item.label).id;
      } else if (Object.prototype.hasOwnProperty.call(item, "reportLabelId")) {
        if (item.reportLabelId == null || item.reportLabelId === "") {
          labelId = null;
        } else {
          labelId = Number(item.reportLabelId);
          if (!Number.isFinite(labelId)) throw new Error("Invalid report label id");
        }
      } else {
        continue;
      }
      updateStmt.run(labelId, expenseId);
    }
  });

  tx(assignments);
  return {
    labels: listExpenseReportLabels(),
    lines: listExpenseReportLines(),
  };
}

function getExpensesForStatusReport() {
  const summary = getOperationalExpensesSummary();
  if (summary.allLabeled) {
    return summary.groups.map((group) => ({
      label: group.label,
      amount: group.amount,
      consolidated: true,
    }));
  }

  const result = summary.groups
    .filter((group) => group.consolidated)
    .map((group) => ({
      label: group.label,
      amount: group.amount,
      consolidated: true,
    }));

  for (const group of summary.groups) {
    if (group.consolidated) continue;
    result.push({
      label: group.label,
      amount: group.amount,
      consolidated: false,
    });
  }

  return result;
}

function getOperationalExpensesSummary() {
  const lines = listExpenseReportLines();
  const allLabeled = lines.length > 0 && lines.every((line) => line.reportLabel);
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const groupMap = new Map();

  for (const line of lines) {
    if (line.reportLabel) {
      if (!groupMap.has(line.reportLabel)) {
        groupMap.set(line.reportLabel, { label: line.reportLabel, lines: [] });
      }
      groupMap.get(line.reportLabel).lines.push(line);
    }
  }

  const groups = [...groupMap.values()]
    .map((group) => ({
      label: group.label,
      amount: group.lines.reduce((sum, line) => sum + line.amount, 0),
      consolidated: true,
      lines: group.lines.map((line) => ({
        expenseDate: line.expenseDate,
        description: line.description,
        amount: line.amount,
      })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  for (const line of lines) {
    if (line.reportLabel) continue;
    groups.push({
      label: line.description || line.category || "Expense",
      amount: line.amount,
      consolidated: false,
      lines: [
        {
          expenseDate: line.expenseDate,
          description: line.description,
          amount: line.amount,
        },
      ],
    });
  }

  return { total, allLabeled, groups };
}

module.exports = {
  ensureExpenseReportLabelSchema,
  listExpenseReportLabels,
  findOrCreateExpenseReportLabel,
  listExpenseReportLines,
  updateExpenseReportLineLabels,
  getExpensesForStatusReport,
  getOperationalExpensesSummary,
};
