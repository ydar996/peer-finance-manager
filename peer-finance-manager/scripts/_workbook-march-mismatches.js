const path = require("path");
const XLSX = require("xlsx");
const { parseWorkbook } = require("../../lib/statement-generator");

const wb = path.join(__dirname, "..", "..", "statements", "Assurance Status 1 2025.xlsx");
const data = parseWorkbook(wb, "March 2026");
const names = [
  "Clement Aribisala",
  "Noghayin Idele",
  "Oluwabiyi Omotuyole",
  "Yomi Salami",
];

for (const n of names) {
  const m = data.members.find((x) => x.name === n);
  if (!m) {
    console.log(n, "NOT IN WORKBOOK");
    continue;
  }
  console.log(`\n${n} (workbook March 2026):`);
  console.log("  totalDeposits:", m.totalDeposits);
  console.log("  registration:", m.registrationDeduction);
  console.log("  accountBalance:", m.accountBalance);
  console.log("  March deposit:", m.monthDeposits.March);
  console.log("  sheetDistribution:", m.sheetDistribution);
}
