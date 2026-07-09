#!/usr/bin/env node
/**
 * Full Ledger Refresh on production Render API.
 * Usage:
 *   node scripts/push-ledger-to-production.js [xlsxPath]
 */
const fs = require("fs");
const path = require("path");

const API_BASE =
  process.env.PFM_API_BASE || "https://peer-finance-manager.onrender.com";
const ADMIN_EMAIL =
  process.env.PFM_ADMIN_EMAIL || "yinka@eworkchop.com";
const ADMIN_PASSWORD = process.env.PFM_ADMIN_PASSWORD || "123456789";
const ORG_SLUG = "assurance";

const coopRoot = path.join(__dirname, "..", "..");
const xlsxPath =
  process.argv[2] ||
  path.join(coopRoot, "data", "cooperative-bank-ledger-reference.xlsx");

async function main() {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`Ledger file not found: ${xlsxPath}`);
  }

  console.log("API:", API_BASE);
  console.log("File:", xlsxPath);

  const healthRes = await fetch(`${API_BASE}/api/health`);
  const health = await healthRes.json().catch(() => ({}));
  console.log("Health:", healthRes.status, JSON.stringify(health));

  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      portal: "admin",
      organizationSlug: ORG_SLUG,
    }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(
      `Login failed (${loginRes.status}): ${loginBody.error || JSON.stringify(loginBody)}`
    );
  }
  const token = loginBody.token;
  console.log("Logged in as", loginBody.user?.email || ADMIN_EMAIL);

  const fileBuf = fs.readFileSync(xlsxPath);
  const fd = new FormData();
  fd.append(
    "workbook",
    new Blob([fileBuf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "cooperative-bank-ledger-reference.xlsx"
  );
  fd.append("acknowledgeManualLoss", "true");

  const importRes = await fetch(`${API_BASE}/api/bank-import/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const importBody = await importRes.json();
  if (!importRes.ok) {
    throw new Error(
      `Import failed (${importRes.status}): ${importBody.error || JSON.stringify(importBody)}`
    );
  }

  console.log("Import success:");
  console.log(JSON.stringify(importBody.result, null, 2));
  console.log("Ledger ending balance:", importBody.result?.ledgerEndingBalance);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
