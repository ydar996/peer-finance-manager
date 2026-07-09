#!/usr/bin/env node
/**
 * Restore Assurance production ledger from golden master, then optionally append a stmt CSV.
 *
 * Usage:
 *   node scripts/restore-assurance-ledger-production.js
 *   node scripts/restore-assurance-ledger-production.js "C:\Users\yinka\Downloads\stmt (8).csv"
 */
const fs = require("fs");
const path = require("path");

const API_BASE = process.env.PFM_API_BASE || "https://peer-finance-manager.onrender.com";
const ADMIN_EMAIL = process.env.PFM_ADMIN_EMAIL || "yinka@eworkchop.com";
const ADMIN_PASSWORD = process.env.PFM_ADMIN_PASSWORD || "123456789";
const ORG_SLUG = "assurance";

const coopRoot = path.join(__dirname, "..", "..");
const masterPath = path.join(
  coopRoot,
  "data",
  "master-ledger",
  "cooperative-bank-ledger-master.xlsx"
);
const stmtPath = process.argv[2] || null;

const EXPECTED_ROWS = 453;
const EXPECTED_ENDING = 15471.49;

async function login() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      portal: "admin",
      organizationSlug: ORG_SLUG,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Login failed");
  return body.token;
}

async function fullLedgerRefresh(token, xlsxPath) {
  const fileBuf = fs.readFileSync(xlsxPath);
  const fd = new FormData();
  fd.append(
    "statement",
    new Blob([fileBuf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "cooperative-bank-ledger-reference.xlsx"
  );
  fd.append("acknowledgeManualLoss", "true");
  const res = await fetch(`${API_BASE}/api/bank-import/run`, {
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

async function appendStatement(token, csvPath) {
  const fileBuf = fs.readFileSync(csvPath);
  const fd = new FormData();
  fd.append(
    "statement",
    new Blob([fileBuf], { type: "text/csv" }),
    path.basename(csvPath)
  );
  const res = await fetch(`${API_BASE}/api/bank-import/append/apply`, {
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

async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

async function fetchBooks(token) {
  const res = await fetch(`${API_BASE}/api/books`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.books;
}

async function main() {
  if (!fs.existsSync(masterPath)) {
    throw new Error(`Golden master not found: ${masterPath}`);
  }

  console.log("Step 1: Full Ledger Refresh from golden master");
  console.log("  File:", masterPath);

  const token = await login();
  const refresh = await fullLedgerRefresh(token, masterPath);
  const r = refresh.result || {};
  console.log("  Rows:", r.totalBankRows);
  console.log("  Ending:", r.ledgerEndingBalance, "through", r.ledgerEndingAsOf);

  if (r.totalBankRows !== EXPECTED_ROWS) {
    console.warn(`  WARNING: expected ${EXPECTED_ROWS} rows`);
  }
  if (Math.abs((r.ledgerEndingBalance || 0) - EXPECTED_ENDING) > 0.02) {
    console.warn(`  WARNING: expected ending ${EXPECTED_ENDING}`);
  }

  if (stmtPath) {
    if (!fs.existsSync(stmtPath)) {
      throw new Error(`Statement file not found: ${stmtPath}`);
    }
    console.log("\nStep 2: Append statement");
    console.log("  File:", stmtPath);
    const append = await appendStatement(token, stmtPath);
    const inserted = append.result?.inserted ?? append.inserted ?? 0;
    console.log("  Inserted:", inserted);
    if (append.result?.summary) {
      console.log("  Summary:", JSON.stringify(append.result.summary, null, 2));
    }
  }

  const health = await fetchHealth();
  const books = await fetchBooks(token);
  console.log("\nVerify production:");
  console.log("  bankImportRows:", health.ledger?.bankImportRows);
  console.log("  ledgerCheckingBalance:", books?.ledgerCheckingBalance);
  console.log("  ledgerCheckingAsOf:", books?.ledgerCheckingAsOf);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
