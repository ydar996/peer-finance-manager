#!/usr/bin/env node
/** Fix mis-attributed proxy deposit Member cells in the reference ledger xlsx. */
const path = require("path");
const XLSX = require("xlsx");

const coopRoot = path.join(__dirname, "..", "..");
const xlsxPath =
  process.argv[2] ||
  path.join(coopRoot, "data", "cooperative-bank-ledger-reference.xlsx");

const REASSIGNMENTS = [
  { match: /04TRT19IP/i, member: "Ejiro Awhotu", label: "Ejiro proxy payment" },
  { match: /05CWRF9R9/i, member: "Titilope Saliu", label: "Titilope proxy payment" },
];

const wb = XLSX.readFile(xlsxPath);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

let updated = 0;
for (const row of rows) {
  const desc = String(row.Description || "");
  for (const rule of REASSIGNMENTS) {
    if (rule.match.test(desc) && row.Member !== rule.member) {
      console.log(
        `Row ${row["#"] || "?"}: ${row.Member || "(blank)"} -> ${rule.member} (${rule.label})`
      );
      row.Member = rule.member;
      updated += 1;
    }
  }
}

if (!updated) {
  console.log("No rows needed updating.");
  process.exit(0);
}

const newWs = XLSX.utils.json_to_sheet(rows);
wb.Sheets[sheetName] = newWs;
XLSX.writeFile(wb, xlsxPath);
console.log(`Updated ${updated} row(s) in ${xlsxPath}`);
