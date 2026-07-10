#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { initPaths } = require("../lib/paths");
initPaths(path.join(__dirname, "../.."));
const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, getDb } = require("../db/database");
const { getLedgerEndingBalance, buildExportRows, loadLedgerRowsFromDb } = require("../lib/cooperative-bank-ledger-csv");

const csvPath =
  process.argv[2] ||
  path.join(__dirname, "../../data/cooperative-bank-ledger-reference.csv");

function parseCsvLedger(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Date,Description,Amount")) {
      start = i + 1;
      break;
    }
  }
  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = [];
    let cur = "";
    let inQ = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    const amount = Number(String(parts[2] || "").replace(/,/g, ""));
    if (!parts[0] || !Number.isFinite(amount)) continue;
    rows.push({
      dateUs: parts[0],
      description: parts[1] || "",
      amount,
      running: Number(String(parts[3] || "").replace(/,/g, "")),
      member: parts[4] || "",
      narrative: parts[5] || "",
    });
  }
  return rows;
}

function usToIso(us) {
  const [m, d, y] = String(us).split("/").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function key(row) {
  return [
    row.dateUs || row.dateIso,
    Number(row.amount).toFixed(2),
    String(row.description || "").slice(0, 50),
    row.member || row.memberName || "",
  ].join("|");
}

runWithOrg("assurance", () => {
  openOrgDatabase("assurance");
  const db = getDb();
  const csvRows = parseCsvLedger(csvPath);
  const dbRaw = loadLedgerRowsFromDb(db);
  const dbRows = buildExportRows(dbRaw);

  const csvKeys = new Set(csvRows.map(key));
  const dbKeys = new Set(dbRows.map(key));

  const missingFromDb = csvRows.filter((r) => !dbKeys.has(key(r)));
  const extraInDb = dbRows.filter((r) => !csvKeys.has(key(r)));

  const csvEnd = csvRows.at(-1);
  const dbEnd = dbRows.at(-1);
  const ledger = getLedgerEndingBalance();

  console.log("CSV ending:", csvEnd?.running, "on", csvEnd?.dateUs);
  console.log("DB ending:", dbEnd?.runningBalance, "on", dbEnd?.dateUs);
  console.log("getLedgerEndingBalance:", ledger?.balance, ledger?.asOf);
  console.log("Gap:", ((csvEnd?.running || 0) - (ledger?.balance || 0)).toFixed(2));
  console.log("\nMissing from DB (" + missingFromDb.length + "):");
  for (const r of missingFromDb) {
    console.log(`  ${r.dateUs}  ${r.amount.toFixed(2)}  ${r.member}  ${r.description.slice(0, 50)}`);
  }
  console.log("\nExtra in DB (" + extraInDb.length + "):");
  for (const r of extraInDb.slice(0, 20)) {
    console.log(`  ${r.dateUs}  ${r.amount.toFixed(2)}  ${r.memberName}  ${r.description.slice(0, 50)}`);
  }
});
