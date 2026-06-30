#!/usr/bin/env node
/** Regenerate cooperative-bank-ledger-reference.csv from the xlsx. */
const path = require("path");
const { parseReferenceLedgerXlsx } = require("../lib/parse-bank-sources");
const {
  finalizeExportRows,
  writeBankStatementCsv,
  sortedReferenceHeaderLines,
  TYPE_TO_NARRATIVE,
} = require("../lib/cooperative-bank-ledger-csv");
const { runWithOrg } = require("../lib/org-context");
const { getDb } = require("../db/database");

const xlsxPath =
  process.argv[2] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.xlsx");
const csvPath =
  process.argv[3] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.csv");

function isoToUs(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

let memberNames = [];
runWithOrg("assurance", () => {
  memberNames = getDb()
    .prepare(`SELECT name FROM members ORDER BY name`)
    .all()
    .map((row) => row.name);
});

const txs = parseReferenceLedgerXlsx(xlsxPath, memberNames);
const exportRows = finalizeExportRows(
  txs.map((tx, index) => ({
    index: index + 1,
    dateIso: tx.date,
    dateUs: isoToUs(tx.date),
    memberName: tx.member || "",
    description: tx.description,
    amount: tx.amount,
    runningBalance: 0,
    narrative: TYPE_TO_NARRATIVE[tx.ledgerType] || tx.transactionType || tx.ledgerType,
    ledgerType: tx.ledgerType,
    source: tx.source,
  }))
);

const today = new Date().toISOString().slice(0, 10);
writeBankStatementCsv(
  exportRows,
  csvPath,
  sortedReferenceHeaderLines(`Synced from xlsx on ${today},,,`)
);

const missing = exportRows.filter(
  (row) =>
    (row.ledgerType === "loan_disbursement" || row.ledgerType === "loan_repayment") &&
    !String(row.memberName || "").trim()
);
console.log("Wrote:", csvPath);
console.log("Rows:", exportRows.length);
console.log("Loan rows missing Member:", missing.length);
if (missing.length) {
  missing.forEach((row) =>
    console.log(" ", row.index, row.dateIso, row.ledgerType, row.description.slice(0, 60))
  );
  process.exit(1);
}
