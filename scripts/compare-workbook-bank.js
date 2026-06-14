#!/usr/bin/env node
const path = require("path");
const XLSX = require("xlsx");
const {
  parseBankStatementCsv,
  NARRATIVE,
} = require("../lib/bank-statement-parser");

const ROOT = path.join(__dirname, "..");
const workbookPath =
  process.argv[2] || path.join(ROOT, "Assurance Status 4 2026.xlsx");
const bankCsv =
  process.argv[3] ||
  path.join(ROOT, "data", "bank-statement-2026.csv");
const sheetName = "April 2026";
const cutoff = { year: 2026, month: 4, day: 30 };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function onOrBeforeApril2026(date) {
  if (date.year < cutoff.year) return true;
  if (date.year > cutoff.year) return false;
  return date.month <= cutoff.month;
}

function parseWorkbookApril() {
  const wb = XLSX.readFile(workbookPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
  });
  const yearRow = rows[0] || [];
  const headerRow = rows[1] || [];

  const monthCols = headerRow
    .map((label, index) => {
      const year = Number(yearRow[index]);
      if (!year || typeof label !== "string" || !MONTHS.includes(label)) {
        return null;
      }
      return { label, year, index };
    })
    .filter(Boolean);

  const cols2026 = monthCols.filter((c) => c.year === 2026);
  const totalIdx = headerRow.indexOf("Total Deposits");
  const regIdx = headerRow.indexOf("Registration Income");
  const balIdx = headerRow.indexOf("Account Balance");
  const distIdx = headerRow.findIndex((h) =>
    /^\*?\s*Distribution/i.test(String(h || "").trim())
  );

  const members = {};
  for (const row of rows.slice(2)) {
    if (!row || !row[0] || typeof row[0] !== "string") continue;
    if (row[0].toLowerCase() === "total") continue;
    const name = row[0].trim();
    const monthly = {};
    for (const col of cols2026) {
      if (col.label === "January" && col.year === 2026) continue; // skip if only YTD from Feb
      const v = Number(row[col.index]);
      if (!v) continue;
      monthly[`${col.label} ${col.year}`] = v;
    }
    // Jan-Apr 2026 only for compare window
    const janApr = {};
    for (const m of ["January", "February", "March", "April"]) {
      const col = cols2026.find((c) => c.label === m);
      if (col) janApr[m] = Number(row[col.index]) || 0;
    }
    const sumJanApr = Object.values(janApr).reduce((s, v) => s + v, 0);

    members[name] = {
      totalDeposits: Number(row[totalIdx]) || 0,
      registration: Number(row[regIdx]) || 0,
      accountBalance: Number(row[balIdx]) || 0,
      distribution: distIdx >= 0 ? Number(row[distIdx]) || 0 : 0,
      janApr2026: janApr,
      sumJanApr2026: sumJanApr,
      monthly,
    };
  }
  return members;
}

function aggregateBankThroughApril(memberNames) {
  const txs = parseBankStatementCsv(bankCsv, memberNames);
  const byMemberMonth = {};
  const unmatched = [];
  const mislabeled = [];

  for (const tx of txs) {
    if (!onOrBeforeApril2026(tx.date)) continue;

    const monthKey = `${MONTHS[tx.date.month - 1]} ${tx.date.year}`;
    const isDeposit = tx.narrative === NARRATIVE.MEMBER_DEPOSIT;
    const isWithdrawal = tx.narrative === NARRATIVE.MEMBER_WITHDRAWAL;

    if (!isDeposit && !isWithdrawal) continue;

    const desc = tx.description.toLowerCase();
    if (
      isDeposit &&
      (/loan\s*repay/i.test(desc) ||
        (/loan/i.test(desc) && !/contribution/i.test(desc)))
    ) {
      mislabeled.push(tx);
    }

    if (!tx.member) {
      unmatched.push(tx);
      continue;
    }

    if (!byMemberMonth[tx.member]) byMemberMonth[tx.member] = {};
    if (!byMemberMonth[tx.member][monthKey]) {
      byMemberMonth[tx.member][monthKey] = { deposits: 0, withdrawals: 0 };
    }
    if (isDeposit) byMemberMonth[tx.member][monthKey].deposits += tx.amount;
    if (isWithdrawal) byMemberMonth[tx.member][monthKey].withdrawals += tx.amount;
  }

  const flat = {};
  for (const [member, months] of Object.entries(byMemberMonth)) {
    flat[member] = { months: {}, janApr2026: {}, sumJanApr2026: 0 };
    for (const [monthKey, vals] of Object.entries(months)) {
      const net = vals.deposits + vals.withdrawals;
      flat[member].months[monthKey] = {
        deposits: round2(vals.deposits),
        withdrawals: round2(vals.withdrawals),
        net: round2(net),
      };
      if (monthKey.endsWith(" 2026")) {
        const monthName = monthKey.replace(" 2026", "");
        if (["January", "February", "March", "April"].includes(monthName)) {
          flat[member].janApr2026[monthName] = round2(net);
          flat[member].sumJanApr2026 += net;
        }
      }
    }
    flat[member].sumJanApr2026 = round2(flat[member].sumJanApr2026);
  }

  return { flat, unmatched, mislabeled, txs };
}

function main() {
  const workbook = parseWorkbookApril();
  const memberNames = Object.keys(workbook).sort();
  const { flat: bank, unmatched, mislabeled } =
    aggregateBankThroughApril(memberNames);

  console.log("=== Workbook vs Bank (through April 2026 end) ===\n");
  console.log(`Workbook: ${workbookPath}`);
  console.log(`Bank CSV: ${bankCsv}\n`);

  const monthNames = ["February", "March", "April"];
  const diffs = [];

  for (const name of memberNames) {
    const wb = workbook[name];
    const bk = bank[name] || { janApr2026: {}, sumJanApr2026: 0 };

    for (const m of monthNames) {
      const wbVal = round2(wb.janApr2026[m] || 0);
      const bkVal = round2(bk.janApr2026[m] || 0);
      if (Math.abs(wbVal - bkVal) > 0.01) {
        diffs.push({ name, month: m, workbook: wbVal, bank: bkVal, delta: round2(wbVal - bkVal) });
      }
    }

    const wbSum = round2(
      (wb.janApr2026.February || 0) +
        (wb.janApr2026.March || 0) +
        (wb.janApr2026.April || 0)
    );
    const bkSum = round2(bk.sumJanApr2026 || 0);
    if (Math.abs(wbSum - bkSum) > 0.01) {
      diffs.push({
        name,
        month: "Feb–Apr total",
        workbook: wbSum,
        bank: bkSum,
        delta: round2(wbSum - bkSum),
      });
    }
  }

  if (diffs.length === 0) {
    console.log("✓ All member Feb–Apr 2026 monthly values match (workbook = bank narrative).");
  } else {
    console.log(`Found ${diffs.length} monthly mismatch(es):\n`);
    console.log(
      "Member".padEnd(24) +
        "Period".padEnd(14) +
        "Workbook".padStart(12) +
        "Bank".padStart(12) +
        "Delta".padStart(12)
    );
    console.log("-".repeat(74));
    for (const d of diffs) {
      console.log(
        d.name.padEnd(24) +
          d.month.padEnd(14) +
          String(d.workbook).padStart(12) +
          String(d.bank).padStart(12) +
          String(d.delta).padStart(12)
      );
    }
  }

  if (mislabeled.length) {
    console.log("\n=== Bank rows labeled Member Deposit but description suggests loan ===");
    for (const tx of mislabeled) {
      console.log(
        `  ${tx.date.iso}  ${tx.amount.toFixed(2)}  ${tx.member || "?"}  ${tx.description.slice(0, 70)}`
      );
    }
  }

  if (unmatched.length) {
    console.log("\n=== Unmatched bank member transactions (Feb–Apr 2026) ===");
    for (const tx of unmatched) {
      console.log(
        `  ${tx.date.iso}  ${tx.narrative}  ${tx.amount.toFixed(2)}  ${tx.description.slice(0, 70)}`
      );
    }
  }

  const wbMemberDeposits = round2(
    memberNames.reduce((s, n) => s + (workbook[n].sumJanApr2026 || 0), 0)
  );
  const bankMemberDeposits = round2(
    memberNames.reduce((s, n) => s + (bank[n]?.sumJanApr2026 || 0), 0)
  );

  console.log("\n=== Portfolio totals (Feb–Apr 2026 member net in workbook) ===");
  console.log(`  Workbook sum of member month cells:  ${wbMemberDeposits.toFixed(2)}`);
  console.log(`  Bank sum (Member Deposit/Withdrawal):  ${bankMemberDeposits.toFixed(2)}`);
  console.log(`  Delta:                                 ${round2(wbMemberDeposits - bankMemberDeposits).toFixed(2)}`);

  console.log("\n=== Members with activity in workbook Feb–Apr but none matched in bank ===");
  for (const name of memberNames) {
    const wbSum = round2(
      (workbook[name].janApr2026.February || 0) +
        (workbook[name].janApr2026.March || 0) +
        (workbook[name].janApr2026.April || 0)
    );
    const bkSum = bank[name]?.sumJanApr2026 || 0;
    if (Math.abs(wbSum) > 0.01 && Math.abs(bkSum) < 0.01) {
      console.log(`  ${name}: workbook ${wbSum}, bank 0`);
    }
  }

  console.log("\n=== Bank activity Feb–Apr with no workbook month value ===");
  for (const name of memberNames) {
    const bk = bank[name];
    if (!bk) continue;
    for (const m of monthNames) {
      const bkVal = bk.janApr2026[m] || 0;
      const wbVal = workbook[name].janApr2026[m] || 0;
      if (Math.abs(bkVal) > 0.01 && Math.abs(wbVal) < 0.01) {
        console.log(`  ${name} ${m}: bank ${bkVal}, workbook 0`);
      }
    }
  }
}

main();
