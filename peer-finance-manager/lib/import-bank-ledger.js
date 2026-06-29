const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const { loadMergedBankTransactions } = require("./parse-bank-sources");
const { registerBankImport } = require("./bank-import");
const {
  ensureSettingsTable,
  setCooperativeSetting,
  getCooperativeSetting,
} = require("./cooperative-settings");
const { LEDGER_TYPES } = require("./cooperative-bank-ledger-csv");

const MEMBER_LEDGER_TYPES = new Set([
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.LOAN_REPAYMENT,
  TRANSACTION_TYPES.LOAN_DISBURSEMENT,
]);

function mapLedgerType(ledgerType) {
  const map = {
    deposit: TRANSACTION_TYPES.DEPOSIT,
    withdrawal: TRANSACTION_TYPES.WITHDRAWAL,
    loan_repayment: TRANSACTION_TYPES.LOAN_REPAYMENT,
    loan_disbursement: TRANSACTION_TYPES.LOAN_DISBURSEMENT,
    expense: TRANSACTION_TYPES.EXPENSE,
    cd_purchase: TRANSACTION_TYPES.CD_PURCHASE,
    cd_liquidation: TRANSACTION_TYPES.CD_LIQUIDATION,
    investment: TRANSACTION_TYPES.INVESTMENT,
  };
  return map[ledgerType] || null;
}

function expenseCategory(description) {
  const d = String(description || "").toLowerCase();
  if (d.includes("monthly fee") || d.includes("bank fee")) return "Bank Fees";
  if (d.includes("food") || d.includes("catering") || d.includes("suya")) return "Meeting/Event";
  if (d.includes("form") || d.includes("subscription") || d.includes("clubhouse")) {
    return "Administrative";
  }
  return "Other";
}

function importBankLedger({
  xlsxPath,
  csvPath,
  xlsxOriginalName,
  csvOriginalName,
  cdBalance,
  replaceSpreadsheetDeposits = true,
}) {
  const db = getDb();
  ensureSettingsTable(db);

  const members = db.prepare(`SELECT id, name FROM members`).all();
  const memberNames = members.map((m) => m.name);
  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));

  if (!xlsxPath && !csvPath) {
    throw new Error("Upload your master ledger file (cooperative-bank-ledger-reference.csv).");
  }

  const bankTxs = loadMergedBankTransactions({
    xlsxPath: xlsxPath || null,
    csvPath: csvPath || null,
    memberNames,
    xlsxOriginalName: xlsxOriginalName || null,
    csvOriginalName: csvOriginalName || null,
  });
  const importId = registerBankImport(
    [xlsxPath, csvPath].filter(Boolean).map((p) => p.split(/[/\\]/).pop()).join(" + ")
  );

  const insertTx = db.prepare(
    `INSERT INTO transactions
      (member_id, type, amount, transaction_date, period_year, period_month,
       description, reference, bank_import_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bank_import')`
  );
  const insertExpense = db.prepare(
    `INSERT INTO expenses (description, amount, expense_date, category)
     VALUES (?, ?, ?, ?)`
  );

  let counts = {
    deposits: 0,
    withdrawals: 0,
    loanRepayments: 0,
    loanDisbursements: 0,
    expenses: 0,
    cdPurchases: 0,
    cdLiquidations: 0,
    investments: 0,
    skippedNoMember: 0,
  };

  const run = db.transaction(() => {
    if (replaceSpreadsheetDeposits) {
      db.prepare(
        `DELETE FROM transactions
         WHERE source = 'spreadsheet' AND type IN ('deposit', 'withdrawal')`
      ).run();
    }

    db.prepare(`DELETE FROM transactions WHERE source = 'bank_import'`).run();
    const manualPlaceholders = LEDGER_TYPES.map(() => "?").join(", ");
    db.prepare(
      `DELETE FROM transactions WHERE source = 'manual' AND type IN (${manualPlaceholders})`
    ).run(...LEDGER_TYPES);
    db.prepare(`DELETE FROM expenses`).run();
    db.prepare(`DELETE FROM transactions WHERE type = 'expense'`).run();

    for (const tx of bankTxs) {
      const type = mapLedgerType(tx.ledgerType);
      if (!type) continue;

      const [year, month] = (tx.date || "").split("-").map(Number);
      const reference = `${tx.source}:${tx.date}:${tx.amount}`;

      if (type === TRANSACTION_TYPES.EXPENSE) {
        const amount = Math.abs(tx.amount);
        const category = expenseCategory(tx.description);
        insertExpense.run(tx.description, amount, tx.date, category);
        insertTx.run(
          null,
          type,
          -amount,
          tx.date,
          year || null,
          month || null,
          `${category}: ${tx.description}`,
          reference,
          importId
        );
        counts.expenses += 1;
        continue;
      }

      if (
        type === TRANSACTION_TYPES.CD_PURCHASE ||
        type === TRANSACTION_TYPES.CD_LIQUIDATION ||
        type === TRANSACTION_TYPES.INVESTMENT
      ) {
        insertTx.run(
          null,
          type,
          tx.amount,
          tx.date,
          year || null,
          month || null,
          tx.description,
          reference,
          importId
        );
        if (type === TRANSACTION_TYPES.CD_PURCHASE) counts.cdPurchases += 1;
        if (type === TRANSACTION_TYPES.CD_LIQUIDATION) counts.cdLiquidations += 1;
        if (type === TRANSACTION_TYPES.INVESTMENT) counts.investments += 1;
        continue;
      }

      if (MEMBER_LEDGER_TYPES.has(type)) {
        const memberId = tx.member ? nameToId[tx.member] : null;
        if (!memberId) {
          counts.skippedNoMember += 1;
          continue;
        }
        let signedAmount = tx.amount;
        if (type === TRANSACTION_TYPES.WITHDRAWAL && signedAmount > 0) {
          signedAmount = -signedAmount;
        }
        if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT && signedAmount > 0) {
          signedAmount = -signedAmount;
        }
        insertTx.run(
          memberId,
          type,
          signedAmount,
          tx.date,
          year || null,
          month || null,
          tx.description,
          reference,
          importId
        );
        if (type === TRANSACTION_TYPES.DEPOSIT) counts.deposits += 1;
        if (type === TRANSACTION_TYPES.WITHDRAWAL) counts.withdrawals += 1;
        if (type === TRANSACTION_TYPES.LOAN_REPAYMENT) counts.loanRepayments += 1;
        if (type === TRANSACTION_TYPES.LOAN_DISBURSEMENT) counts.loanDisbursements += 1;
      }
    }

    if (cdBalance != null && cdBalance !== "") {
      setCooperativeSetting(db, "cd_balance", cdBalance);
      setCooperativeSetting(db, "cd_balance_as_of", new Date().toISOString().slice(0, 10));
    }
  });

  run();

  db.prepare(`UPDATE bank_imports SET status = 'applied' WHERE id = ?`).run(importId);

  return {
    importId,
    totalBankRows: bankTxs.length,
    ...counts,
    cdBalance: cdBalance != null ? Number(cdBalance) : null,
  };
}

module.exports = {
  importBankLedger,
  getCooperativeSetting,
  setCooperativeSetting,
};
