#!/usr/bin/env node
const path = require("path");
const XLSX = require("xlsx");
const { initPaths } = require("../lib/paths");
initPaths(path.join(__dirname, "../.."));
const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, getDb } = require("../db/database");

const xlsxPath = path.join(__dirname, "../../data/cooperative-bank-ledger-reference.xlsx");

function confKey(desc) {
  const m = String(desc || "").match(/conf#?\s*([a-z0-9]+)/i);
  return m ? m[1].toLowerCase() : "";
}

runWithOrg("assurance", () => {
  openOrgDatabase("assurance");
  const db = getDb();
  const dbRows = db
    .prepare(
      `SELECT transaction_date, type, amount, description
       FROM transactions WHERE source IN ('bank_import','manual')`
    )
    .all();

  const wb = XLSX.readFile(xlsxPath);
  const xlsxRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

  let dbSum = 0;
  for (const r of dbRows) dbSum = Math.round((dbSum + r.amount) * 100) / 100;

  let xlsxSum = 0;
  for (const r of xlsxRows) {
    const a = Number(r.Amount);
    if (Number.isFinite(a)) xlsxSum = Math.round((xlsxSum + a) * 100) / 100;
  }

  const dbKeys = new Set(
    dbRows.map((r) =>
      [r.transaction_date, Number(r.amount).toFixed(2), confKey(r.description)].join("|")
    )
  );

  const missing = xlsxRows.filter((r) => {
    const amt = Number(r.Amount);
    if (!Number.isFinite(amt)) return false;
    const iso = String(r["ISO Date"] || r.Date || "");
    let dateIso = iso;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) && r.Date) {
      const [m, d, y] = String(r.Date).split("/").map(Number);
      dateIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    const key = [dateIso, amt.toFixed(2), confKey(r.Description)].join("|");
    return !dbKeys.has(key);
  });

  console.log("DB rows:", dbRows.length, "sum:", dbSum);
  console.log("XLSX rows:", xlsxRows.length, "sum:", xlsxSum);
  console.log("Gap:", (xlsxSum - dbSum).toFixed(2));
  console.log("\nMissing from DB (" + missing.length + "):");
  for (const r of missing) {
    console.log(
      r.Date,
      Number(r.Amount).toFixed(2),
      r.Member,
      r.Narrative,
      String(r.Description || "").slice(0, 60)
    );
  }
});
