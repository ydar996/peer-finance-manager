#!/usr/bin/env node
const path = require("path");
const { initPaths } = require("../lib/paths");
initPaths(path.join(__dirname, "../.."));
const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, getDb } = require("../db/database");
const { getCooperativeBooks } = require("../lib/cooperative-books");
const {
  getLedgerEndingBalance,
  loadLedgerRowsFromDb,
  buildExportRows,
  LEDGER_TYPES,
} = require("../lib/cooperative-bank-ledger-csv");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const { getLoanPortfolioFromBankLedger } = require("../lib/loan-ledger-service");
const { resolveCheckingBalanceForReport } = require("../lib/checking-balance-service");
const { getCooperativeStatusReportData } = require("../lib/cooperative-status-report");

const org = process.argv[2] || "assurance";
const asOf = process.argv[3] || "2026-06-30";

runWithOrg(org, () => {
  openOrgDatabase(org);
  const db = getDb();
  const books = getCooperativeBooks();
  const ledger = getLedgerEndingBalance();
  const exportRows = buildExportRows(loadLedgerRowsFromDb(db));

  const members = db.prepare("SELECT id, name FROM members ORDER BY name").all();
  const totalMember = members.reduce((s, m) => s + getMemberDepositAccountBalance(m.id), 0);

  const loans = getLoanPortfolioFromBankLedger();
  const loanOut = loans.reduce((s, r) => s + r.outstanding, 0);

  const formula =
    books.totalMemberDepositAccounts +
    books.cooperativeNetIncome -
    books.loansOutstanding -
    (books.cdBalance || 0) -
    (books.investments || 0);

  const placeholders = LEDGER_TYPES.map(() => "?").join(", ");
  const byType = db
    .prepare(
      `SELECT type, SUM(amount) AS total, COUNT(*) AS n
       FROM transactions
       WHERE source IN ('bank_import', 'manual') AND type IN (${placeholders})
       GROUP BY type ORDER BY type`
    )
    .all(...LEDGER_TYPES);

  const typeSum = byType.reduce((s, r) => s + r.total, 0);

  const checking = resolveCheckingBalanceForReport(asOf);
  const report = getCooperativeStatusReportData({ asOfDate: asOf });

  console.log("=== REPORT VS LEDGER ===");
  console.log("Report checking:", report.bankBalances.checkingBalance, "source:", checking.source);
  console.log("Ledger through period:", ledger?.balance);
  console.log("Gap:", (report.bankBalances.checkingBalance - (ledger?.balance || 0)).toFixed(2));
  console.log("Balance sheet balanced:", Math.abs(report.balanceSheet.totalAssets - report.balanceSheet.totalLiabilitiesEquity) < 0.02);
  console.log("Old formula would have shown:", formula.toFixed(2));

  console.log("\n=== FORMULA COMPONENTS ===");
  console.log("Member deposits total:", books.totalMemberDepositAccounts.toFixed(2));
  console.log("Retained earnings (net income):", books.cooperativeNetIncome.toFixed(2));
  console.log("Loans outstanding:", books.loansOutstanding.toFixed(2));
  console.log("CD:", (books.cdBalance || 0).toFixed(2));
  console.log("Investments:", (books.investments || 0).toFixed(2));

  console.log("\n=== LEDGER TYPE TOTALS (bank_import + manual) ===");
  for (const r of byType) {
    console.log(`  ${r.type}: ${Number(r.total).toFixed(2)} (${r.n} rows)`);
  }
  console.log("  SUM:", typeSum.toFixed(2));

  console.log("\n=== LOAN PORTFOLIO ===");
  for (const r of loans.filter((l) => l.outstanding > 0.01)) {
    console.log(`  ${r.borrower_name}: outstanding ${r.outstanding.toFixed(2)}`);
  }

  console.log("\n=== RECONCILIATION ===");
  console.log(
    "If bank = deposits - loans - cd - inv + cooperative_fund:",
    "cooperative_fund = bank + loans + cd + inv - deposits"
  );
  const cooperativeFund =
    (ledger?.balance || 0) + books.loansOutstanding + (books.cdBalance || 0) + (books.investments || 0) - books.totalMemberDepositAccounts;
  console.log("Implied cooperative fund (retained + misc):", cooperativeFund.toFixed(2));
  console.log("Reported retained earnings:", books.cooperativeNetIncome.toFixed(2));
  console.log("Difference:", (cooperativeFund - books.cooperativeNetIncome).toFixed(2));
});
