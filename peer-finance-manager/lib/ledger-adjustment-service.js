const { getDb } = require("../db/database");
const { ledgerTransactionKey } = require("./import-fingerprint");
const { memberRequiredForType } = require("./transaction-import-types");
const { loadMergedBankTransactions } = require("./parse-bank-sources");
const {
  findReferenceLedgerPath,
  importBankLedgerFromTransactions,
} = require("./import-bank-ledger");
const { queueCooperativeBankLedgerCsvSync, getLedgerEndingBalance, loadBankTransactionsFromDb } = require(
  "./cooperative-bank-ledger-csv"
);
const { clearPortfolioInterestShareCache } = require("./loan-ledger-service");

const ADJUSTMENT_KIND = {
  RECLASSIFY: "reclassify",
  SPLIT: "split",
};

const RECLASSIFIABLE_LEDGER_TYPES = [
  "deposit",
  "withdrawal",
  "loan_repayment",
  "loan_disbursement",
  "distribution",
  "membership_fee",
  "expense",
  "cd_purchase",
  "cd_liquidation",
  "investment",
];

const SPLIT_MIN_LINES = 2;

function ensureLedgerAdjustmentSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ledger_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_key TEXT NOT NULL UNIQUE,
      transaction_date TEXT NOT NULL,
      original_amount REAL NOT NULL,
      description TEXT,
      adjustment_kind TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by_user_id INTEGER,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS ledger_adjustment_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adjustment_id INTEGER NOT NULL,
      line_order INTEGER NOT NULL,
      ledger_type TEXT NOT NULL,
      member_name TEXT,
      amount REAL NOT NULL,
      description_note TEXT,
      FOREIGN KEY (adjustment_id) REFERENCES ledger_adjustments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_adjustments_date
      ON ledger_adjustments(transaction_date);
  `);
}

function bankTxLedgerKey(tx) {
  return ledgerTransactionKey(tx.date, tx.amount, tx.description);
}

function dbTxLedgerKey(tx) {
  return ledgerTransactionKey(tx.transaction_date, tx.amount, tx.description);
}

function loadAdjustmentsMap(db) {
  ensureLedgerAdjustmentSchema(db);
  const adjustments = db
    .prepare(
      `SELECT id, ledger_key AS ledgerKey, adjustment_kind AS adjustmentKind
       FROM ledger_adjustments`
    )
    .all();
  const lineStmt = db.prepare(
    `SELECT line_order AS lineOrder, ledger_type AS ledgerType, member_name AS memberName,
            amount, description_note AS descriptionNote
     FROM ledger_adjustment_lines
     WHERE adjustment_id = ?
     ORDER BY line_order`
  );
  const map = new Map();
  for (const adj of adjustments) {
    map.set(adj.ledgerKey, {
      ...adj,
      lines: lineStmt.all(adj.id),
    });
  }
  return map;
}

function applyAdjustmentsToBankTransactions(bankTxs) {
  const db = getDb();
  const adjustments = loadAdjustmentsMap(db);
  if (!adjustments.size) return bankTxs;

  const result = [];
  for (const tx of bankTxs) {
    const key = bankTxLedgerKey(tx);
    const adj = adjustments.get(key);
    if (!adj?.lines?.length) {
      result.push(tx);
      continue;
    }

    if (adj.adjustmentKind === ADJUSTMENT_KIND.RECLASSIFY) {
      const line = adj.lines[0];
      result.push({
        ...tx,
        ledgerType: line.ledgerType,
        member: line.memberName || tx.member || null,
        adjustmentKey: key,
      });
      continue;
    }

    if (adj.adjustmentKind === ADJUSTMENT_KIND.SPLIT) {
      for (const line of adj.lines) {
        const note = line.descriptionNote ? String(line.descriptionNote).trim() : "";
        result.push({
          ...tx,
          amount: Number(line.amount),
          ledgerType: line.ledgerType,
          member: line.memberName || tx.member || null,
          description: note ? `${tx.description} (${note})` : tx.description,
          adjustmentKey: key,
          splitLineOrder: line.lineOrder,
        });
      }
      continue;
    }

    result.push(tx);
  }
  return result;
}

function resolveMemberName(db, memberId, memberName) {
  if (memberId) {
    const row = db.prepare(`SELECT name FROM members WHERE id = ?`).get(memberId);
    if (row?.name) return row.name;
  }
  const trimmed = String(memberName || "").trim();
  if (!trimmed) return null;
  const exact = db.prepare(`SELECT name FROM members WHERE name = ?`).get(trimmed);
  return exact?.name || trimmed;
}

function validateAdjustmentLines(db, originalAmount, lines, { requireSplit = false } = {}) {
  if (!lines?.length) throw new Error("At least one classification line is required.");
  if (requireSplit && lines.length < SPLIT_MIN_LINES) {
    throw new Error(`A split needs at least ${SPLIT_MIN_LINES} lines.`);
  }
  let sum = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Line ${i + 1}: amount must be greater than zero.`);
    }
    const ledgerType = String(line.ledgerType || "").trim();
    if (!RECLASSIFIABLE_LEDGER_TYPES.includes(ledgerType)) {
      throw new Error(`Line ${i + 1}: unsupported ledger type.`);
    }
    const memberName = resolveMemberName(db, line.memberId, line.memberName);
    const memberRequired =
      memberRequiredForType(ledgerType) || ledgerType === "membership_fee";
    if (memberRequired && !memberName) {
      throw new Error(`Line ${i + 1}: member is required for ${ledgerType}.`);
    }
    if (memberName) {
      const member = db.prepare(`SELECT id FROM members WHERE name = ?`).get(memberName);
      if (!member) {
        throw new Error(`Line ${i + 1}: member "${memberName}" was not found.`);
      }
    }
    sum += amount;
  }
  const original = Math.round(Math.abs(Number(originalAmount)) * 100) / 100;
  const total = Math.round(sum * 100) / 100;
  if (Math.abs(total - original) > 0.005) {
    throw new Error(
      `Split lines must total ${original.toFixed(2)} (got ${total.toFixed(2)}). Adjust the amounts before saving.`
    );
  }
}

function upsertAdjustment({
  ledgerKey,
  transactionDate,
  originalAmount,
  description,
  adjustmentKind,
  lines,
  userId,
  notes,
}) {
  const db = getDb();
  ensureLedgerAdjustmentSchema(db);

  const run = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id FROM ledger_adjustments WHERE ledger_key = ?`)
      .get(ledgerKey);
    if (existing) {
      db.prepare(`DELETE FROM ledger_adjustment_lines WHERE adjustment_id = ?`).run(existing.id);
      db.prepare(`DELETE FROM ledger_adjustments WHERE id = ?`).run(existing.id);
    }

    const insertAdj = db
      .prepare(
        `INSERT INTO ledger_adjustments
          (ledger_key, transaction_date, original_amount, description, adjustment_kind,
           created_by_user_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ledgerKey,
        transactionDate,
        originalAmount,
        description || null,
        adjustmentKind,
        userId || null,
        notes || null
      );
    const adjustmentId = insertAdj.lastInsertRowid;
    const insertLine = db.prepare(
      `INSERT INTO ledger_adjustment_lines
        (adjustment_id, line_order, ledger_type, member_name, amount, description_note)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    lines.forEach((line, index) => {
      insertLine.run(
        adjustmentId,
        index + 1,
        line.ledgerType,
        resolveMemberName(db, line.memberId, line.memberName),
        Number(line.amount),
        line.descriptionNote || null
      );
    });
    return adjustmentId;
  });

  return run();
}

function saveReclassifyAdjustment({
  transactionDate,
  amount,
  description,
  ledgerType,
  memberId,
  memberName,
  userId,
  notes,
}) {
  const db = getDb();
  const ledgerKey = ledgerTransactionKey(transactionDate, amount, description);
  const resolvedMember = resolveMemberName(db, memberId, memberName);
  if (memberRequiredForType(ledgerType) || ledgerType === "membership_fee") {
    if (!resolvedMember) throw new Error("Member is required for this transaction type.");
  }
  if (!RECLASSIFIABLE_LEDGER_TYPES.includes(ledgerType)) {
    throw new Error("Unsupported ledger type for reclassification.");
  }

  validateAdjustmentLines(db, amount, [
    { ledgerType, memberId, memberName: resolvedMember, amount: Math.abs(Number(amount)) },
  ]);

  upsertAdjustment({
    ledgerKey,
    transactionDate,
    originalAmount: amount,
    description,
    adjustmentKind: ADJUSTMENT_KIND.RECLASSIFY,
    lines: [
      {
        ledgerType,
        memberId,
        memberName: resolvedMember,
        amount: Math.abs(Number(amount)),
      },
    ],
    userId,
    notes,
  });

  return rebuildLedgerWithAdjustments({ userId });
}

function saveSplitAdjustment({
  transactionDate,
  amount,
  description,
  lines,
  userId,
  notes,
}) {
  const db = getDb();
  const ledgerKey = ledgerTransactionKey(transactionDate, amount, description);
  validateAdjustmentLines(db, amount, lines, { requireSplit: true });

  const normalizedLines = lines.map((line) => ({
    ledgerType: line.ledgerType,
    memberId: line.memberId,
    memberName: resolveMemberName(db, line.memberId, line.memberName),
    amount: Number(line.amount),
    descriptionNote: line.descriptionNote || null,
  }));

  upsertAdjustment({
    ledgerKey,
    transactionDate,
    originalAmount: amount,
    description,
    adjustmentKind: ADJUSTMENT_KIND.SPLIT,
    lines: normalizedLines,
    userId,
    notes,
  });

  const rebuild = rebuildLedgerWithAdjustments({ userId });
  return {
    ...rebuild,
    splitLineCount: normalizedLines.length,
    downloadLedgerRequired: true,
  };
}

function rebuildLedgerWithAdjustments({ referencePath, userId } = {}) {
  const db = getDb();
  const members = db.prepare(`SELECT id, name FROM members`).all();
  const memberNames = members.map((m) => m.name);
  const path = require("path");

  let bankTxs = loadBankTransactionsFromDb(db);
  let rebuildSource = "live-db";

  if (!bankTxs.length) {
    const refPath = referencePath || findReferenceLedgerPath();
    if (!refPath) {
      throw new Error(
        "No bank ledger rows in the database and no reference ledger file on the server. Run Full Ledger Refresh first."
      );
    }
    const isCsv = refPath.toLowerCase().endsWith(".csv");
    bankTxs = loadMergedBankTransactions({
      xlsxPath: isCsv ? null : refPath,
      csvPath: isCsv ? refPath : null,
      memberNames,
      xlsxOriginalName: path.basename(refPath),
      csvOriginalName: isCsv ? path.basename(refPath) : null,
    });
    rebuildSource = refPath;
  }

  bankTxs = applyAdjustmentsToBankTransactions(bankTxs);

  const before = getLedgerEndingBalance();
  const result = importBankLedgerFromTransactions({
    bankTxs,
    sourceLabel: `adjustment-rebuild:${rebuildSource}`,
    captureReconcileAnchor: false,
  });
  clearPortfolioInterestShareCache();
  queueCooperativeBankLedgerCsvSync("ledger_adjustment");
  const after = getLedgerEndingBalance();

  let bankReconcile = null;
  try {
    const { refreshBankReconcileAfterClassification, getBankReconcileStatus } = require("./bank-reconcile-service");
    bankReconcile =
      refreshBankReconcileAfterClassification({ label: "split/reclassify" }) ||
      getBankReconcileStatus();
  } catch (_) {}

  return {
    ...result,
    referencePath: rebuildSource,
    adjustmentRebuild: true,
    beforeBalance: before?.balance ?? null,
    afterBalance: after?.balance ?? null,
    downloadLedgerPrompt: true,
    downloadLedgerRequired: true,
    bankReconcile,
  };
}

function listLedgerAdjustments() {
  const db = getDb();
  ensureLedgerAdjustmentSchema(db);
  const rows = db
    .prepare(
      `SELECT id, ledger_key AS ledgerKey, transaction_date AS transactionDate,
              original_amount AS originalAmount, description, adjustment_kind AS adjustmentKind,
              created_at AS createdAt, notes
       FROM ledger_adjustments
       ORDER BY transaction_date DESC, id DESC`
    )
    .all();
  const lineStmt = db.prepare(
    `SELECT line_order AS lineOrder, ledger_type AS ledgerType, member_name AS memberName,
            amount, description_note AS descriptionNote
     FROM ledger_adjustment_lines
     WHERE adjustment_id = ?
     ORDER BY line_order`
  );
  return rows.map((row) => ({
    ...row,
    lines: lineStmt.all(row.id),
  }));
}

function getAdjustmentForTransaction(tx) {
  const key = dbTxLedgerKey(tx);
  const map = loadAdjustmentsMap(getDb());
  return map.get(key) || null;
}

module.exports = {
  ADJUSTMENT_KIND,
  RECLASSIFIABLE_LEDGER_TYPES,
  SPLIT_MIN_LINES,
  ensureLedgerAdjustmentSchema,
  bankTxLedgerKey,
  dbTxLedgerKey,
  applyAdjustmentsToBankTransactions,
  validateAdjustmentLines,
  saveReclassifyAdjustment,
  saveSplitAdjustment,
  rebuildLedgerWithAdjustments,
  listLedgerAdjustments,
  getAdjustmentForTransaction,
};
