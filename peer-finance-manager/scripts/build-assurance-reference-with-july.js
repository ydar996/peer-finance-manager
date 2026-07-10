#!/usr/bin/env node
/**
 * Build Assurance reference ledger = golden master through 6/29 + July 2026 rows.
 * Saheed 7/8 $500 is Loan Repayment (not auto-classified from stmt text).
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { initPaths } = require("../lib/paths");
const { runWithOrg } = require("../lib/org-context");
const { ASSURANCE_SLUG } = require("../lib/organization-service");
const {
  finalizeExportRows,
  writeWorkbook,
  TYPE_TO_NARRATIVE,
} = require("../lib/cooperative-bank-ledger-csv");

initPaths(path.join(__dirname, "..", ".."));

const coopRoot = path.join(__dirname, "..", "..");
const masterPath = path.join(
  coopRoot,
  "data",
  "master-ledger",
  "cooperative-bank-ledger-master.xlsx"
);
const outPath =
  process.argv[2] ||
  path.join(coopRoot, "data", "cooperative-bank-ledger-reference.xlsx");

const JULY_ROWS = [
  {
    dateIso: "2026-07-03",
    memberName: "Olawale George",
    description: "Zelle payment from OLAWALE GEORGE Conf# 0K7BEWQ61",
    amount: 100,
    ledgerType: "deposit",
  },
  {
    dateIso: "2026-07-06",
    memberName: "Gbanju Aruwayo-Obe",
    description:
      'Zelle payment from GBANJU ARUWAYOOBE for "Monthly contribution"; Conf# 0K7F0I6QH',
    amount: 70.06,
    ledgerType: "deposit",
  },
  {
    dateIso: "2026-07-08",
    memberName: "Yomi Salami",
    description: "Zelle payment from SAHEED SALAMI Conf# 0K7H4MOJF",
    amount: 500,
    ledgerType: "loan_repayment",
  },
  {
    dateIso: "2026-07-08",
    memberName: "Oluwatosin Omotuyole",
    description:
      'Zelle payment from OLUWATOSIN OMOTUYOLE for "Contribution to Assurance coop"; Conf# 0K7H5F37H',
    amount: 100,
    ledgerType: "deposit",
  },
];

function isoToUs(iso) {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function loadMasterRows() {
  const wb = XLSX.readFile(masterPath);
  const sheet = wb.Sheets["Cooperative Bank Ledger"];
  if (!sheet) throw new Error("Cooperative Bank Ledger sheet missing in master");
  const raw = XLSX.utils.sheet_to_json(sheet);
  return raw.map((row, i) => ({
    index: i + 1,
    dateIso: String(row["ISO Date"] || "").slice(0, 10),
    dateUs: row.Date || isoToUs(String(row["ISO Date"] || "").slice(0, 10)),
    memberName: row.Member || "",
    description: String(row.Description || ""),
    amount: Number(row.Amount),
    runningBalance: 0,
    narrative: row.Narrative || TYPE_TO_NARRATIVE[row["Ledger Type"]] || row["Ledger Type"],
    ledgerType: row["Ledger Type"],
    source: row.Source || "bank_import",
  }));
}

runWithOrg(ASSURANCE_SLUG, () => {
  if (!fs.existsSync(masterPath)) {
    throw new Error(`Master not found: ${masterPath}`);
  }
  const base = loadMasterRows();
  const july = JULY_ROWS.map((row, i) => ({
    index: base.length + i + 1,
    dateIso: row.dateIso,
    dateUs: isoToUs(row.dateIso),
    memberName: row.memberName,
    description: row.description,
    amount: row.amount,
    runningBalance: 0,
    narrative: TYPE_TO_NARRATIVE[row.ledgerType] || row.ledgerType,
    ledgerType: row.ledgerType,
    source: "bank_import",
  }));
  const exportRows = finalizeExportRows([...base, ...july]);
  writeWorkbook(exportRows, outPath);
  const last = exportRows[exportRows.length - 1];
  console.log("Wrote", outPath);
  console.log("Rows:", exportRows.length);
  console.log("Ending:", last.runningBalance, "through", last.dateIso);
  const saheed = exportRows.find((r) =>
    r.dateIso === "2026-07-08" && /SAHEED SALAMI/i.test(r.description)
  );
  console.log(
    "Saheed 7/8:",
    saheed?.ledgerType,
    saheed?.narrative,
    "member",
    saheed?.memberName
  );
});
