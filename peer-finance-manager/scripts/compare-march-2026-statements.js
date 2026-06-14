#!/usr/bin/env node
/**
 * Compare March 2026 sent statements (PDFs) against app ledger as of 2026-03-31.
 * Excludes Sonia Udom per user request.
 */
const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const { initPaths } = require("../lib/paths");

initPaths(path.join(__dirname, "..", ".."));
const { getDb, closeDb } = require("../db/database");

const STATEMENTS_DIR = path.join(__dirname, "..", "..", "statements", "2026-03");
const CUTOFF = "2026-03-31";

/** Statement PDF name matches members.name in DB (verified 2026-06). */
const STATEMENT_TO_DB = null;

function parseMoneyToken(token) {
  if (!token) return null;
  const neg = /\(.*\)/.test(token);
  const m = String(token).match(/[\d,]+\.\d{2}/);
  if (!m) return null;
  const val = Number(m[0].replace(/,/g, ""));
  return neg ? -val : val;
}

function extractFromPdfText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const pick = (patterns) => {
    const idx = lines.findIndex((l) =>
      patterns.some((p) => p.test(l))
    );
    if (idx < 0) return null;
    for (let i = idx; i <= idx + 2 && i < lines.length; i++) {
      const val = parseMoneyToken(lines[i]);
      if (val != null && !patterns.some((p) => p.test(lines[i]))) {
        return val;
      }
    }
    return parseMoneyToken(lines[idx]);
  };

  return {
    totalDeposits: pick([/total deposits to date/i]),
    registration: pick([/registration deduction/i]),
    accountBalance: pick([/account bal/i, /balance$/i]),
    marchDeposit: pick([/march 2026 deposit/i]),
    marchWithdrawal: pick([/march 2026 withdrawal/i]),
    distribution: pick([/distribution/i]),
  };
}

function memberNameFromFilename(filename) {
  const m = filename.match(
    /Account Statement - (.+?) - March 2026/i
  );
  if (m) return m[1].trim();
  const m2 = filename.match(/^(.+?) - March 2026\.pdf$/i);
  return m2 ? m2[1].trim() : null;
}

function getAppSnapshot(db, memberId) {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS deposits,
         COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END), 0) AS withdrawals,
         COALESCE(SUM(CASE WHEN type = 'distribution' THEN amount ELSE 0 END), 0) AS distributions,
         COALESCE(SUM(CASE WHEN type = 'membership_fee' THEN amount ELSE 0 END), 0) AS fees
       FROM transactions
       WHERE member_id = ? AND transaction_date <= ?`
    )
    .get(memberId, CUTOFF);

  const marchDeposit = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS t
       FROM transactions
       WHERE member_id = ? AND type = 'deposit'
         AND transaction_date >= '2026-03-01' AND transaction_date <= ?`
    )
    .get(memberId, CUTOFF).t;

  const marchWithdrawal = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS t
       FROM transactions
       WHERE member_id = ? AND type = 'withdrawal'
         AND transaction_date >= '2026-03-01' AND transaction_date <= ?`
    )
    .get(memberId, CUTOFF).t;

  const balance =
    row.deposits + row.withdrawals + row.distributions + row.fees;

  return {
    totalDeposits: row.deposits,
    withdrawals: row.withdrawals,
    distributions: row.distributions,
    fees: row.fees,
    accountBalance: balance,
    marchDeposit,
    marchWithdrawal,
  };
}

function near(a, b, tol = 0.02) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

async function main() {
  const db = getDb();
  const members = db.prepare("SELECT id, name FROM members").all();
  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));

  const files = fs
    .readdirSync(STATEMENTS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .filter((f) => !/sonia/i.test(f))
    .sort();

  console.log(`March 2026 statement comparison (as of ${CUTOFF}, excluding Sonia Udom)\n`);
  console.log(
    "Member".padEnd(28) +
      "Field".padEnd(22) +
      "Statement".padStart(12) +
      "App".padStart(12) +
      "  Match"
  );
  console.log("-".repeat(78));

  const mismatches = [];
  let compared = 0;

  for (const file of files) {
    const stmtName = memberNameFromFilename(file);
    if (!stmtName) {
      console.log("SKIP (unparsed filename):", file);
      continue;
    }

    const dbName = STATEMENT_TO_DB?.[stmtName] || stmtName;
    const memberId = nameToId[dbName];
    if (!memberId) {
      console.log("SKIP (no DB mapping):", stmtName);
      continue;
    }

    const buffer = fs.readFileSync(path.join(STATEMENTS_DIR, file));
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    await parser.destroy();
    const stmt = extractFromPdfText(textResult.text);
    const app = getAppSnapshot(db, memberId);

    const checks = [
      ["Total Deposits", stmt.totalDeposits, app.totalDeposits],
      ["Account Balance", stmt.accountBalance, app.accountBalance],
      ["March Deposit", stmt.marchDeposit, app.marchDeposit],
    ];
    if (stmt.marchWithdrawal != null && stmt.marchWithdrawal !== 0) {
      checks.push(["March Withdrawal", stmt.marchWithdrawal, app.marchWithdrawal]);
    }

    let memberOk = true;
    for (const [field, sVal, aVal] of checks) {
      const ok = near(sVal, aVal);
      if (!ok) {
        memberOk = false;
        mismatches.push({ stmtName, dbName, field, statement: sVal, app: aVal });
      }
      console.log(
        stmtName.padEnd(28) +
          field.padEnd(22) +
          (sVal != null ? sVal.toFixed(2) : "—").padStart(12) +
          (aVal != null ? aVal.toFixed(2) : "—").padStart(12) +
          (ok ? "  OK" : "  DIFF")
      );
    }
    if (memberOk) compared += 1;
    console.log("");
  }

  console.log("=".repeat(78));
  console.log(`Members compared: ${files.length}`);
  console.log(`Fully matching: ${compared}`);
  console.log(`Mismatches: ${mismatches.length}`);

  if (mismatches.length) {
    console.log("\nMismatch detail:");
    for (const m of mismatches) {
      const diff = (m.app ?? 0) - (m.statement ?? 0);
      console.log(
        `  ${m.stmtName} (${m.dbName}) — ${m.field}: statement ${m.statement?.toFixed(2) ?? "—"} vs app ${m.app?.toFixed(2) ?? "—"} (diff ${diff.toFixed(2)})`
      );
    }
  }

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
