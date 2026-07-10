#!/usr/bin/env node
/**
 * Full Ledger Refresh on a production org, then optionally append a bank statement.
 *
 * Usage:
 *   node scripts/restore-ledger-production.js --org <slug> --ledger <path.xlsx|csv> [--stmt <path.csv|xlsx>]
 *   node scripts/restore-ledger-production.js --org assurance --ledger ..\\data\\cooperative-bank-ledger-reference.xlsx
 *
 * Environment:
 *   PFM_API_BASE, PFM_ADMIN_EMAIL, PFM_ADMIN_PASSWORD
 */
const fs = require("fs");
const path = require("path");

const API_BASE = process.env.PFM_API_BASE || "https://peer-finance-manager.onrender.com";
const ADMIN_EMAIL = process.env.PFM_ADMIN_EMAIL || "yinka@eworkchop.com";
const ADMIN_PASSWORD = process.env.PFM_ADMIN_PASSWORD || "123456789";

function usage() {
  console.error(`Usage:
  node scripts/restore-ledger-production.js --org <slug> --ledger <file> [--stmt <file>]

Options:
  --org <slug>       Organization slug (required)
  --ledger <path>    Master ledger for Full Ledger Refresh (.xlsx or .csv)
  --stmt <path>      Optional monthly statement to append after refresh
  --api <url>        API base (default: PFM_API_BASE or Render production)
`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { org: null, ledger: null, stmt: null, api: API_BASE };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--org" && argv[i + 1]) {
      out.org = argv[++i];
    } else if (arg === "--ledger" && argv[i + 1]) {
      out.ledger = path.resolve(argv[++i]);
    } else if (arg === "--stmt" && argv[i + 1]) {
      out.stmt = path.resolve(argv[++i]);
    } else if (arg === "--api" && argv[i + 1]) {
      out.api = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!out.org || !out.ledger) usage();
  return out;
}

function ledgerMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (ext === ".csv") return "text/csv";
  throw new Error(`Unsupported ledger file type: ${ext}`);
}

function stmtMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") return "text/csv";
  if (ext === ".xlsx" || ext === ".xls") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  throw new Error(`Unsupported statement file type: ${ext}`);
}

async function login(apiBase, orgSlug) {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      portal: "admin",
      organizationSlug: orgSlug,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Login failed");
  return body.token;
}

async function fullLedgerRefresh(apiBase, token, ledgerPath) {
  const fileBuf = fs.readFileSync(ledgerPath);
  const fd = new FormData();
  fd.append(
    "statement",
    new Blob([fileBuf], { type: ledgerMime(ledgerPath) }),
    path.basename(ledgerPath)
  );
  fd.append("acknowledgeManualLoss", "true");
  const res = await fetch(`${apiBase}/api/bank-import/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Full Ledger Refresh failed (${res.status})`);
  }
  return body;
}

async function appendStatement(apiBase, token, stmtPath) {
  const fileBuf = fs.readFileSync(stmtPath);
  const fd = new FormData();
  fd.append(
    "statement",
    new Blob([fileBuf], { type: stmtMime(stmtPath) }),
    path.basename(stmtPath)
  );
  const res = await fetch(`${apiBase}/api/bank-import/append/apply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Append failed (${res.status})`);
  }
  return body;
}

async function fetchBooks(apiBase, token) {
  const res = await fetch(`${apiBase}/api/books`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.books;
}

async function main() {
  const { org, ledger, stmt, api } = parseArgs(process.argv);
  if (!fs.existsSync(ledger)) {
    throw new Error(`Ledger file not found: ${ledger}`);
  }

  console.log("Organization:", org);
  console.log("API:", api);
  console.log("\nStep 1: Full Ledger Refresh");
  console.log("  File:", ledger);

  const token = await login(api, org);
  const refresh = await fullLedgerRefresh(api, token, ledger);
  const r = refresh.result || {};
  console.log("  Rows:", r.totalBankRows);
  console.log("  Ending:", r.ledgerEndingBalance, "through", r.ledgerEndingAsOf);

  if (stmt) {
    if (!fs.existsSync(stmt)) {
      throw new Error(`Statement file not found: ${stmt}`);
    }
    console.log("\nStep 2: Append statement");
    console.log("  File:", stmt);
    const append = await appendStatement(api, token, stmt);
    const inserted = append.result?.inserted ?? append.inserted ?? 0;
    console.log("  Inserted:", inserted);
    const bc = append.result?.summary?.balanceCheck;
    if (bc) {
      console.log(
        "  Balance check:",
        `opening ${bc.openingAligned ? "aligned" : "MISMATCH"}`,
        bc.statementEnding != null ? `statement ending ${bc.statementEnding}` : "",
        bc.projectedLedger != null ? `projected ${bc.projectedLedger}` : ""
      );
    }
  }

  const books = await fetchBooks(api, token);
  console.log("\nVerify on production:");
  console.log("  ledgerCheckingBalance:", books?.ledgerCheckingBalance);
  console.log("  ledgerCheckingAsOf:", books?.ledgerCheckingAsOf);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
