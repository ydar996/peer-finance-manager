#!/usr/bin/env node
/**
 * Fix duplicate bank charge rows in the master ledger and recalculate running balances.
 * Bank records show one -$16 monthly fee per date; duplicates were overstating debits by $32.
 */
const path = require("path");
const { parseReferenceLedgerXlsx } = require("../lib/parse-bank-sources");
const {
  finalizeExportRows,
  writeBankStatementCsv,
  writeWorkbook,
  sortedReferenceHeaderLines,
  TYPE_TO_NARRATIVE,
} = require("../lib/cooperative-bank-ledger-csv");
const { runWithOrg } = require("../lib/org-context");

const csvPath =
  process.argv[2] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.csv");
const xlsxPath =
  process.argv[3] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.xlsx");

const BANK_CHARGE_RE = /monthly fee|bank fee|service fee|maintenance fee/i;

function isoToUs(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function txsToExportRows(txs) {
  return txs.map((tx, index) => ({
    index: index + 1,
    dateIso: tx.date,
    dateUs: isoToUs(tx.date),
    memberName: tx.member || "",
    description: tx.description,
    amount: Number(tx.amount),
    runningBalance: 0,
    narrative: TYPE_TO_NARRATIVE[tx.ledgerType] || tx.transactionType || tx.ledgerType,
    ledgerType: tx.ledgerType,
    source: tx.source,
  }));
}

function bankChargeKey(row) {
  return `${row.dateIso}|${row.amount}|${String(row.description || "").toLowerCase().trim()}`;
}

function dedupeDuplicateBankCharges(rows) {
  const seen = new Set();
  const removed = [];
  const kept = [];

  for (const row of rows) {
    const isBankCharge =
      row.ledgerType === "expense" &&
      (BANK_CHARGE_RE.test(row.description) || row.amount === -16);
    if (!isBankCharge) {
      kept.push(row);
      continue;
    }
    const key = bankChargeKey(row);
    if (seen.has(key)) {
      removed.push(row);
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  return { kept, removed };
}

const before = txsToExportRows(parseReferenceLedgerXlsx(xlsxPath, []));
const { kept, removed } = dedupeDuplicateBankCharges(before);
const exportRows = finalizeExportRows(kept.map((row, idx) => ({ ...row, index: idx + 1 })));

const today = new Date().toISOString().slice(0, 10);
writeBankStatementCsv(
  exportRows,
  csvPath,
  sortedReferenceHeaderLines(
    `Bank charges incorporated — duplicate monthly fees removed on ${today},,,`
  )
);
runWithOrg("assurance", () => {
  writeWorkbook(exportRows, xlsxPath);
});

const ending = exportRows[exportRows.length - 1];
console.log("Removed duplicate bank charge rows:", removed.length);
removed.forEach((row) =>
  console.log(" ", row.dateUs, row.amount, row.description.slice(0, 60))
);
console.log("Rows before:", before.length, "after:", exportRows.length);
console.log("Ending balance:", ending.runningBalance, "as of", ending.dateUs);
