const { getDb } = require("../db/database");
const { EXPENSE_CATEGORIES } = require("./constants");

function ensureExpenseReportLabelSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_report_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const labelColumns = db.prepare(`PRAGMA table_info(expense_report_labels)`).all();
  if (!labelColumns.some((column) => column.name === "parent_id")) {
    db.exec(
      `ALTER TABLE expense_report_labels ADD COLUMN parent_id INTEGER REFERENCES expense_report_labels(id)`
    );
  }
  const columns = db.prepare(`PRAGMA table_info(expenses)`).all();
  if (!columns.some((column) => column.name === "report_label_id")) {
    db.exec(
      `ALTER TABLE expenses ADD COLUMN report_label_id INTEGER REFERENCES expense_report_labels(id)`
    );
  }
  ensureDefaultExpenseReportLabels(db);
}

/** Seed built-in expense categories as selectable report labels (idempotent). */
function ensureDefaultExpenseReportLabels(db) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO expense_report_labels (label) VALUES (?)`
  );
  for (const label of EXPENSE_CATEGORIES) {
    const text = normalizeLabelText(label);
    if (text) insert.run(text);
  }
}

function normalizeLabelText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function listExpenseReportLabels() {
  const db = getDb();
  ensureExpenseReportLabelSchema(db);
  return db
    .prepare(
      `SELECT l.id, l.label, l.parent_id, p.label AS parent_label
       FROM expense_report_labels l
       LEFT JOIN expense_report_labels p ON p.id = l.parent_id
       ORDER BY COALESCE(p.label, l.label) COLLATE NOCASE ASC,
                l.parent_id IS NOT NULL ASC,
                l.label COLLATE NOCASE ASC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      label: row.label,
      parentId: row.parent_id ?? null,
      parentLabel: row.parent_label || null,
    }));
}

function findOrCreateExpenseReportLabel(labelText, parentId = null) {
  const label = normalizeLabelText(labelText);
  if (!label) throw new Error("Report label is required");
  const db = getDb();
  ensureExpenseReportLabelSchema(db);
  let parent = null;
  if (parentId != null && parentId !== "") {
    parent = db
      .prepare(`SELECT id, label FROM expense_report_labels WHERE id = ?`)
      .get(Number(parentId));
    if (!parent) throw new Error("Parent report label not found");
  }
  const existing = db
    .prepare(`SELECT id, label, parent_id FROM expense_report_labels WHERE label = ? COLLATE NOCASE`)
    .get(label);
  if (existing) {
    if (parent && existing.parent_id == null) {
      db.prepare(`UPDATE expense_report_labels SET parent_id = ? WHERE id = ?`).run(
        parent.id,
        existing.id
      );
    }
    return { id: existing.id, label: existing.label, parentId: parent?.id ?? existing.parent_id ?? null };
  }
  const result = db
    .prepare(`INSERT INTO expense_report_labels (label, parent_id) VALUES (?, ?)`)
    .run(label, parent?.id ?? null);
  return { id: Number(result.lastInsertRowid), label, parentId: parent?.id ?? null };
}

function effectiveReportLabel(line) {
  if (line.reportLabel) return line.reportLabel;
  const category = normalizeLabelText(line.category);
  return category || null;
}

function listExpenseReportLines() {
  const db = getDb();
  ensureExpenseReportLabelSchema(db);
  const labelsByName = new Map(
    listExpenseReportLabels().map((entry) => [entry.label.toLowerCase(), entry])
  );
  const rows = db
    .prepare(
      `SELECT e.id, e.description, e.amount, e.expense_date, e.category, e.report_label_id,
              l.label AS report_label, pl.label AS parent_label
       FROM expenses e
       LEFT JOIN expense_report_labels l ON l.id = e.report_label_id
       LEFT JOIN expense_report_labels pl ON pl.id = l.parent_id
       ORDER BY e.expense_date ASC, e.id ASC`
    )
    .all();
  return rows.map((row) => {
    const reportLabel = row.report_label || null;
    const category = row.category || null;
    let reportLabelId = row.report_label_id;
    if (reportLabelId == null && category) {
      const match = labelsByName.get(normalizeLabelText(category).toLowerCase());
      if (match) reportLabelId = match.id;
    }
    return {
      id: row.id,
      description: row.description,
      amount: row.amount,
      expenseDate: row.expense_date,
      category,
      reportLabelId,
      reportLabel,
      // Child labels (e.g. "Stamp Duty" under "Bank Fees") roll up to their
      // parent for consolidated report totals.
      effectiveLabel: row.parent_label || reportLabel || normalizeLabelText(category) || null,
    };
  });
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
  const allLabeled = lines.length > 0 && lines.every((line) => line.effectiveLabel);
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const groupMap = new Map();

  for (const line of lines) {
    const label = line.effectiveLabel;
    if (!label) continue;
    if (!groupMap.has(label)) {
      groupMap.set(label, { label, lines: [] });
    }
    groupMap.get(label).lines.push(line);
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
    if (line.effectiveLabel) continue;
    groups.push({
      label: line.description || "Expense",
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
  ensureDefaultExpenseReportLabels,
  listExpenseReportLabels,
  findOrCreateExpenseReportLabel,
  listExpenseReportLines,
  updateExpenseReportLineLabels,
  getExpensesForStatusReport,
  getOperationalExpensesSummary,
  effectiveReportLabel,
};
