const path = require("path");
const XLSX = require("xlsx");

const wb = path.join(__dirname, "..", "..", "statements", "Assurance Status 1 2025.xlsx");
const sheet = XLSX.utils.sheet_to_json(
  XLSX.readFile(wb).Sheets["March 2026"],
  { header: 1, defval: null }
);
const yearRow = sheet[0];
const headerRow = sheet[1];
const row = sheet.find((r) => r && r[0] === "Yomi Salami");
if (!row) {
  console.log("not found");
  process.exit(0);
}
headerRow.forEach((h, i) => {
  if (!h || h === "Member Name") return;
  const v = row[i];
  if (v != null && v !== 0 && v !== "") console.log(yearRow[i], h, "=>", v);
});
