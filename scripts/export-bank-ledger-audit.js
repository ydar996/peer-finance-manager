#!/usr/bin/env node
/**
 * Export the canonical merged bank ledger (All deposits.xlsx + stmt CSV)
 * as a single deduplicated Excel workbook for audit.
 */
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

const coopRoot = path.join(__dirname, "..");
const { initPaths } = require("../peer-finance-manager/lib/paths");
const { loadMergedBankTransactions } = require("../peer-finance-manager/lib/parse-bank-sources");
const { getDb } = require("../peer-finance-manager/db/database");

initPaths(coopRoot);

const xlsxPath = path.join(coopRoot, "All deposits.xlsx");
const csvPath = path.join(coopRoot, "data", "bank-statement-2026.csv");
const outPath = path.join(coopRoot, "Bank Ledger Audit.xlsx");

const LEDGER_TO_NARRATIVE = {
  deposit: "Member Deposit",
  withdrawal: "Member Withdrawal",
  loan_repayment: "Loan Repayment",
  loan_disbursement: "Loan Disbursement",
  expense: "Expenses",
  cd_purchase: "Purchase of Certificate of Deposit",
  cd_liquidation: "Liquidation of Certificate of Deposit",
  investment: "Investment in Caribe Restaurant and Lounge",
};

function extractConf(description) {
  const m = String(description || "").match(/conf#\s*([a-z0-9]+)/i);
  return m ? m[1].toUpperCase() : "";
}

function isoToDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function loadMemberNames() {
  const db = getDb();
  return db.prepare(`SELECT name FROM members ORDER BY name`).all().map((r) => r.name);
}

function buildRows(transactions) {
  let running = 0;
  return transactions.map((tx, index) => {
    running += Number(tx.amount) || 0;
    const narrative = tx.transactionType || LEDGER_TO_NARRATIVE[tx.ledgerType] || tx.ledgerType;
    const depositor =
      tx.ledgerType === "deposit" ? tx.depositor || tx.member || "" : "";
    const member =
      tx.ledgerType === "deposit"
        ? ""
        : tx.member || "";

    return {
      "#": index + 1,
      Date: isoToDisplay(tx.date),
      Depositor: depositor,
      Description: tx.description || "",
      Amount: Number(tx.amount) || 0,
      "Running Balance": Math.round(running * 100) / 100,
      "Transaction Type": narrative,
      Member: member,
      "Conf #": extractConf(tx.description),
      Source: tx.source === "stmt_csv" ? "Bank CSV" : "All Deposits",
      "ISO Date": tx.date || "",
    };
  });
}

function buildSummary(transactions) {
  const byType = {};
  let credits = 0;
  let debits = 0;

  for (const tx of transactions) {
    const label = LEDGER_TO_NARRATIVE[tx.ledgerType] || tx.ledgerType;
    byType[label] = (byType[label] || 0) + 1;
    const amt = Number(tx.amount) || 0;
    if (amt >= 0) credits += amt;
    else debits += amt;
  }

  const lines = [
    ["Bank Ledger Audit Export"],
    ["Generated", new Date().toISOString()],
    [""],
    ["Sources"],
    ["All Deposits workbook", xlsxPath],
    ["Bank statement CSV", csvPath],
    ["Merge rule", "XLSX before 2026-02-02; CSV from cutoff; XLSX after cutoff; deduped"],
    [""],
    ["Totals"],
    ["Transaction count", transactions.length],
    ["Total credits", Math.round(credits * 100) / 100],
    ["Total debits", Math.round(debits * 100) / 100],
    ["Net change", Math.round((credits + debits) * 100) / 100],
    [""],
    ["Count by transaction type"],
    ["Type", "Count"],
  ];

  for (const [type, count] of Object.entries(byType).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push([type, count]);
  }

  return lines;
}

function writeWorkbook(rows, summaryLines) {
  const wb = XLSX.utils.book_new();

  const txSheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      "#",
      "Date",
      "Depositor",
      "Description",
      "Amount",
      "Running Balance",
      "Transaction Type",
      "Member",
      "Conf #",
      "Source",
      "ISO Date",
    ],
  });
  txSheet["!cols"] = [
    { wch: 5 },
    { wch: 11 },
    { wch: 22 },
    { wch: 72 },
    { wch: 12 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 11 },
  ];
  XLSX.utils.book_append_sheet(wb, txSheet, "Bank Transactions");

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryLines);
  summarySheet["!cols"] = [{ wch: 36 }, { wch: 56 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  XLSX.writeFile(wb, outPath);
}

function main() {
  if (!fs.existsSync(xlsxPath)) {
    console.error("Missing workbook:", xlsxPath);
    process.exit(1);
  }

  const memberNames = loadMemberNames();
  const transactions = loadMergedBankTransactions({ xlsxPath, csvPath, memberNames });
  const rows = buildRows(transactions);
  const summary = buildSummary(transactions);

  writeWorkbook(rows, summary);

  console.log("Bank ledger audit export complete:");
  console.log("  Output:", outPath);
  console.log("  Transactions:", transactions.length);
  console.log("  Sheets: Bank Transactions, Summary");
}

main();
