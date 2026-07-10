const XLSX = require("xlsx");

const p = "C:/Users/yinka/Documents/AssurCoop/data/cooperative-bank-ledger-reference.xlsx";
const wb = XLSX.readFile(p);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Cooperative Bank Ledger"], { defval: "" });

const dup = rows.filter(
  (r) =>
    Math.abs(Number(r.Amount) - 317.6) < 0.01 &&
    (r["ISO Date"] === "2025-01-27" || r["ISO Date"] === "2025-02-18")
);

console.log("=== DUPLICATE $317.60 ROWS (delete unassigned) ===");
dup.forEach((r) =>
  console.log({
    hash: r["#"],
    date: r["ISO Date"],
    usDate: r.Date,
    amount: r.Amount,
    member: r.Member || "(empty)",
    ledgerType: r["Ledger Type"],
    narrative: r.Narrative,
    description: String(r.Description).slice(0, 75),
  })
);
