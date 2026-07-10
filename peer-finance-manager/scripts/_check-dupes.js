const XLSX = require("xlsx");
const rows = XLSX.utils
  .sheet_to_json(
    XLSX.readFile("C:/Users/yinka/Documents/AssurCoop/data/cooperative-bank-ledger-reference.xlsx")
      .Sheets["Cooperative Bank Ledger"],
    { defval: "" }
  )
  .filter((r) => r["ISO Date"]);

const targets = rows.filter(
  (r) =>
    (String(r["ISO Date"]).startsWith("2025-01-27") ||
      String(r["ISO Date"]).startsWith("2025-02-18") ||
      String(r["ISO Date"]).startsWith("2025-03-17")) &&
    Math.abs(Number(r.Amount) - 317.6) < 0.01
);

console.log("317.60 rows on key dates:");
targets.forEach((r) =>
  console.log(JSON.stringify({
    date: r["ISO Date"],
    amount: r.Amount,
    member: r.Member,
    ledgerType: r["Ledger Type"],
    narrative: r.Narrative,
    desc: String(r.Description).slice(0, 90),
  }))
);
