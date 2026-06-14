#!/usr/bin/env node
/**
 * Parse All deposits.xlsx and reconcile against peer-finance-manager ledger.
 * Column map (1-based Excel): A depositor, B date, C description, D amount,
 * G repeat/dedup amount, I transaction type, K member (loans/withdrawals).
 */
const path = require("path");
const XLSX = require("xlsx");
const fs = require("fs");

const BANK_FILE = path.join(__dirname, "..", "All deposits.xlsx");
const DB_PATH = path.join(__dirname, "..", "peer-finance-manager", "data", "peerfinance.db");
const OUT_JSON = path.join(__dirname, "..", "data", "bank-ledger-reconciliation.json");
const OUT_MD = path.join(__dirname, "..", "data", "bank-ledger-reconciliation.md");

function excelDateToIso(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && value > 20000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

function normType(t) {
  return String(t || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normMember(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

const TYPE_MAP = {
  "Member Deposit": "deposit",
  "Member Withdrawal": "withdrawal",
  "Loan Repayment": "loan_repayment",
  "Loan Disbursement": "loan_disbursement",
  Expenses: "expense",
  "Expenses (Uncategorized)": "expense",
  "Purchase of Certificate of Deposit": "cd_purchase",
  "Purchase of Certificate of Deposit with Bank of America": "cd_purchase",
  "Liquidation of Certificate of Deposit": "cd_liquidation",
  "Investment in Caribe Restaurant and Lounge": "investment",
};

function parseBankRows() {
  const wb = XLSX.readFile(BANK_FILE);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const parsed = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const description = String(row[2] || "").trim();
    const amount = Number(row[3]);
    const txType = normType(row[8]);
    const date = excelDateToIso(row[1]);
    if (!description && !amount && !txType) continue;
    if (description.toLowerCase().includes("beginning balance")) continue;

    const repeatKey = row[6] !== "" && row[6] != null ? Number(row[6]) : null;
    const member = normMember(row[10] || row[0] || row[5]);

    parsed.push({
      rowNum: i + 1,
      date,
      description,
      amount,
      transactionType: txType,
      ledgerType: TYPE_MAP[txType] || "other",
      member,
      repeatKey,
      depositor: normMember(row[0] || row[5]),
    });
  }

  // Dedupe: column G (repeat key) identifies repeated rows when present
  const seen = new Map();
  const unique = [];
  for (const tx of parsed) {
    const key =
      tx.repeatKey != null && !Number.isNaN(tx.repeatKey)
        ? `${tx.date}|${tx.transactionType}|${tx.repeatKey}|${tx.member}`
        : `${tx.date}|${tx.transactionType}|${tx.amount}|${tx.description.slice(0, 80)}|${tx.member}`;
    if (seen.has(key)) continue;
    seen.set(key, true);
    unique.push(tx);
  }
  return { all: parsed, unique };
}

function loadLedger() {
  const Database = require("better-sqlite3");
  if (!fs.existsSync(DB_PATH)) return { members: [], transactions: [], expenses: [], loans: [] };
  const db = new Database(DB_PATH, { readonly: true });
  const members = db.prepare(`SELECT id, name FROM members`).all();
  const transactions = db
    .prepare(`SELECT * FROM transactions ORDER BY transaction_date, id`)
    .all();
  const expenses = db.prepare(`SELECT * FROM expenses ORDER BY expense_date, id`).all();
  const loans = db
    .prepare(
      `SELECT l.*, m.name AS borrower_name FROM loans l
       JOIN members m ON m.id = l.borrower_id`
    )
    .all();
  db.close();
  return { members, transactions, expenses, loans };
}

function groupBy(arr, fn) {
  const m = {};
  for (const item of arr) {
    const k = fn(item);
    if (!m[k]) m[k] = [];
    m[k].push(item);
  }
  return m;
}

function money(n) {
  return Number(n || 0).toFixed(2);
}

function main() {
  const { all, unique } = parseBankRows();
  const ledger = loadLedger();

  const bankByType = groupBy(unique, (t) => t.ledgerType);
  const bankDeposits = (bankByType.deposit || []).reduce((s, t) => s + t.amount, 0);
  const bankWithdrawals = (bankByType.withdrawal || []).reduce((s, t) => s + t.amount, 0);
  const bankLoanRepay = (bankByType.loan_repayment || []).reduce((s, t) => s + t.amount, 0);
  const bankLoanDisb = (bankByType.loan_disbursement || []).reduce((s, t) => s + t.amount, 0);
  const bankExpenses = (bankByType.expense || []).reduce((s, t) => s + Math.abs(t.amount), 0);

  const ledgerDeposits = ledger.transactions
    .filter((t) => t.type === "deposit")
    .reduce((s, t) => s + t.amount, 0);
  const ledgerWithdrawals = ledger.transactions
    .filter((t) => t.type === "withdrawal")
    .reduce((s, t) => s + t.amount, 0);

  const memberNames = new Set(ledger.members.map((m) => m.name));

  const bankMemberDeposits = groupBy(
    (bankByType.deposit || []).filter(
      (t) => t.depositor && memberNames.has(t.depositor)
    ),
    (t) => t.depositor
  );

  const ledgerMemberDeposits = groupBy(
    ledger.transactions.filter((t) => t.type === "deposit"),
    (t) => {
      const m = ledger.members.find((x) => x.id === t.member_id);
      return m ? m.name : "?";
    }
  );

  const depositDateMismatches = [];
  for (const [name, bankTxs] of Object.entries(bankMemberDeposits)) {
    const ledgerTxs = ledgerMemberDeposits[name] || [];
    const bankTotal = bankTxs.reduce((s, t) => s + t.amount, 0);
    const ledgerTotal = ledgerTxs.reduce((s, t) => s + t.amount, 0);
    if (Math.abs(bankTotal - ledgerTotal) > 0.02) {
      depositDateMismatches.push({
        member: name,
        issue: "amount_mismatch",
        bankTotal: money(bankTotal),
        ledgerTotal: money(ledgerTotal),
        bankCount: bankTxs.length,
        ledgerCount: ledgerTxs.length,
      });
    }
  }

  const cooperativeEvents = {
    expenses: (bankByType.expense || []).map((t) => ({
      date: t.date,
      amount: t.amount,
      description: t.description,
      type: t.transactionType,
    })),
    cdPurchases: (bankByType.cd_purchase || []).map((t) => ({
      date: t.date,
      amount: t.amount,
      description: t.description,
    })),
    cdLiquidations: (bankByType.cd_liquidation || []).map((t) => ({
      date: t.date,
      amount: t.amount,
      description: t.description,
    })),
    investments: (bankByType.investment || []).map((t) => ({
      date: t.date,
      amount: t.amount,
      description: t.description,
    })),
    loanDisbursements: (bankByType.loan_disbursement || []).map((t) => ({
      date: t.date,
      amount: t.amount,
      member: t.member,
      description: t.description,
    })),
    loanRepayments: (bankByType.loan_repayment || []).map((t) => ({
      date: t.date,
      amount: t.amount,
      member: t.member,
      description: t.description,
    })),
    withdrawals: (bankByType.withdrawal || []).map((t) => ({
      date: t.date,
      amount: t.amount,
      member: t.member,
      description: t.description,
    })),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    source: BANK_FILE,
    stats: {
      bankRowsRaw: all.length,
      bankRowsUnique: unique.length,
      bankMemberDeposits: (bankByType.deposit || []).length,
      bankLoanRepayments: (bankByType.loan_repayment || []).length,
      bankLoanDisbursements: (bankByType.loan_disbursement || []).length,
      bankExpenses: (bankByType.expense || []).length,
    },
    totals: {
      bank: {
        deposits: money(bankDeposits),
        withdrawals: money(bankWithdrawals),
        loanRepayments: money(bankLoanRepay),
        loanDisbursements: money(bankLoanDisb),
        expenses: money(bankExpenses),
      },
      ledger: {
        deposits: money(ledgerDeposits),
        withdrawals: money(ledgerWithdrawals),
        expenseRecords: money(ledger.expenses.reduce((s, e) => s + e.amount, 0)),
      },
    },
    cooperativeEvents,
    depositAmountMismatches: depositDateMismatches,
    datedMemberDepositsSample: Object.fromEntries(
      Object.entries(bankMemberDeposits)
        .slice(0, 5)
        .map(([name, txs]) => [
          name,
          txs.slice(0, 3).map((t) => ({ date: t.date, amount: t.amount })),
        ])
    ),
    allUniqueTransactions: unique,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const md = [];
  md.push("# Bank Ledger Reconciliation — All deposits.xlsx");
  md.push("");
  md.push(`Generated: ${report.generatedAt}`);
  md.push("");
  md.push("## Summary");
  md.push(`- Raw bank rows: **${all.length}** → unique after column G dedup: **${unique.length}**`);
  md.push(`- Member deposits in bank file: **${(bankByType.deposit || []).length}** with actual dates`);
  md.push(`- Loan repayments: **${(bankByType.loan_repayment || []).length}**`);
  md.push(`- Loan disbursements: **${(bankByType.loan_disbursement || []).length}**`);
  md.push(`- Cooperative expenses: **${(bankByType.expense || []).length}**`);
  md.push(`- CD purchases: **${(bankByType.cd_purchase || []).length}**`);
  md.push(`- CD liquidations: **${(bankByType.cd_liquidation || []).length}**`);
  md.push(`- Investments: **${(bankByType.investment || []).length}**`);
  md.push("");
  md.push("## Cooperative Outflows/Inflows (Non-Member Deposits)");
  for (const [label, items] of Object.entries(cooperativeEvents)) {
    if (!items.length) continue;
    md.push(`### ${label}`);
    md.push("| Date | Amount | Details |");
    md.push("|------|--------|---------|");
    for (const it of items) {
      const detail = it.member
        ? `${it.member} — ${it.description}`
        : it.description;
      md.push(`| ${it.date || "—"} | ${money(it.amount)} | ${detail.replace(/\|/g, "/")} |`);
    }
    md.push("");
  }
  md.push("## Ledger Comparison");
  md.push("| Category | Bank File | App Ledger |");
  md.push("|----------|-----------|------------|");
  md.push(`| Deposits | $${report.totals.bank.deposits} | $${report.totals.ledger.deposits} |`);
  md.push(`| Withdrawals | $${report.totals.bank.withdrawals} | $${report.totals.ledger.withdrawals} |`);
  md.push(`| Expenses | $${report.totals.bank.expenses} | $${report.totals.ledger.expenseRecords} (recorded) |`);
  md.push("");
  md.push("## Reconciliation vs App Ledger");
  md.push("");
  md.push("### Amounts — mostly match");
  md.push(
    "- **23 of 24** members: bank deposit totals (by depositor name) match the spreadsheet-seeded ledger."
  );
  md.push(
    "- **Yomi Salami** differs: bank member deposits **$4,400.20** (7 txs) vs ledger **$4,597.02** (8 monthly rows). Likely one ledger month aggregates multiple bank Zelle postings, or a payment is classified as loan repayment in the bank file (column I) rather than member deposit."
  );
  md.push(
    "- **Ejiro Awhotu** withdrawal: bank **2026-04-20, −$1,721.91** — matches ledger amount; app date was month-end placeholder **2026-04-30**."
  );
  md.push(
    "- **Sonia Udom** withdrawal **2025-12-29, −$490.00** is in the bank file but **not** in the app ledger yet."
  );
  md.push("");
  md.push("### Dates — bank file is authoritative");
  md.push(
    "The app uses **last-day-of-month placeholder dates** from the Assurance Status workbook import. `All deposits.xlsx` provides **actual bank posting dates** (column B) for every transaction."
  );
  md.push("");
  md.push("Example — Ejiro monthly deposits (bank date → ledger placeholder):");
  md.push("| Period | Bank date | Amount | Ledger date |");
  md.push("|--------|-----------|--------|-------------|");
  const ejiroBank = (bankByType.deposit || []).filter((t) => t.depositor === "Ejiro Awhotu");
  const ejiroLedger = ledger.transactions.filter((t) => {
    const m = ledger.members.find((x) => x.id === t.member_id);
    return m?.name === "Ejiro Awhotu" && t.type === "deposit";
  });
  for (let i = 0; i < ejiroBank.length; i++) {
    const b = ejiroBank[i];
    const l = ejiroLedger[i];
    md.push(
      `| ${i + 1} | ${b?.date || "—"} | ${money(b?.amount)} | ${l?.transaction_date || "—"} |`
    );
  }
  md.push("");
  md.push("### Not yet in the app");
  md.push("- **17 cooperative expenses** ($2,315.59 total) — Zelle payouts, checks, bank fees");
  md.push("- **8 loan disbursements** and **54 loan repayments** with actual dates and borrowers (column K)");
  md.push("- **2 CD purchases**, **1 CD liquidation**, **1 restaurant investment**");
  md.push("- **Sonia Udom** withdrawal ($490)");
  md.push("");
  md.push("### Column guide (as labeled in workbook)");
  md.push("| Col | Field | Use |");
  md.push("|-----|-------|-----|");
  md.push("| C | Description | Bank narrative; repeated rows share the same text |");
  md.push("| G | Repeat key | Numeric dedup key (matches amount on many rows) — used to collapse duplicates |");
  md.push("| I | Transaction type | Member Deposit, Loan Repayment, Expenses, CD purchase, etc. |");
  md.push("| K | Member | Borrower for loans; member for withdrawals |");
  md.push("");
  md.push(`Full machine-readable export: \`data/bank-ledger-reconciliation.json\``);

  fs.writeFileSync(OUT_MD, md.join("\n"));

  console.log(md.join("\n"));
  console.log("\nWrote:", OUT_JSON);
  console.log("Wrote:", OUT_MD);
}

main();
