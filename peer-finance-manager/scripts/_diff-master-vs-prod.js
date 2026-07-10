#!/usr/bin/env node
const path = require("path");
const XLSX = require("xlsx");
const { initPaths } = require("../lib/paths");
const { getLedgerEndingBalance, buildExportRows, loadLedgerRowsFromDb } = require("../lib/cooperative-bank-ledger-csv");
const { getDb } = require("../db/database");
const { runWithOrg } = require("../lib/org-context");
const { ASSURANCE_SLUG } = require("../lib/organization-service");

initPaths(path.join(__dirname, "..", ".."));

const masterPath = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "master-ledger",
  "cooperative-bank-ledger-master.xlsx"
);

function loadMaster() {
  const rows = XLSX.utils.sheet_to_json(
    XLSX.readFile(masterPath).Sheets["Cooperative Bank Ledger"]
  );
  let running = 0;
  return rows.map((r, i) => {
    running += Number(r.Amount) || 0;
    return {
      idx: i + 1,
      date: String(r["ISO Date"] || "").slice(0, 10),
      amount: Number(r.Amount),
      member: r.Member || "",
      desc: String(r.Description || "").slice(0, 80),
      masterRunning: Number(r["Running Balance"]) || running,
    };
  });
}

function rowKey(r) {
  return `${r.date}|${r.amount}|${(r.member || "").toLowerCase()}|${(r.desc || "").slice(0, 40).toLowerCase()}`;
}

runWithOrg(ASSURANCE_SLUG, () => {
  const master = loadMaster();
  const db = getDb();
  const dbRows = buildExportRows(loadLedgerRowsFromDb(db));
  const ledger = getLedgerEndingBalance();
  const asOfJun29 = getLedgerEndingBalance("2026-06-29");

  console.log("MASTER last:", master.at(-1));
  console.log("DB ledger ending:", ledger);
  console.log("DB as of 2026-06-29:", asOfJun29);

  const masterMap = new Map(master.map((r) => [rowKey(r), r]));
  const dbMap = new Map(
    dbRows.map((r) => [
      rowKey({
        date: r.dateIso,
        amount: r.amount,
        member: r.memberName,
        desc: r.description,
      }),
      r,
    ])
  );

  const onlyMaster = master.filter((r) => !dbMap.has(rowKey(r)));
  const onlyDb = dbRows.filter(
    (r) =>
      !masterMap.has(
        rowKey({
          date: r.dateIso,
          amount: r.amount,
          member: r.memberName,
          desc: r.description,
        })
      )
  );

  console.log("\nOnly in MASTER:", onlyMaster.length, "sum", onlyMaster.reduce((s, r) => s + r.amount, 0));
  onlyMaster.slice(0, 15).forEach((r) =>
    console.log("  M", r.date, r.amount, r.member, r.desc)
  );

  console.log("\nOnly in DB:", onlyDb.length, "sum", onlyDb.reduce((s, r) => s + r.amount, 0));
  onlyDb.slice(0, 15).forEach((r) =>
    console.log("  D", r.dateIso, r.amount, r.memberName, r.description?.slice(0, 60))
  );

  const masterJun29 = master.filter((r) => r.date <= "2026-06-29");
  let run = 0;
  masterJun29.forEach((r) => (run += r.amount));
  console.log("\nMaster sum through 6/29:", Math.round(run * 100) / 100);
});
