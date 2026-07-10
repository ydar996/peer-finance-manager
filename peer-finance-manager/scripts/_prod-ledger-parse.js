#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const API = process.env.PFM_API_BASE || "https://peer-finance-manager.onrender.com";
const ADMIN_EMAIL = process.env.PFM_ADMIN_EMAIL || "yinka@eworkchop.com";
const ADMIN_PASSWORD = process.env.PFM_ADMIN_PASSWORD || "123456789";

function parseReferenceCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    if (line.startsWith("#,") || line.startsWith("Generated on")) continue;
    const parts = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    if (parts.length < 8) continue;
    const dateIso = parts[2];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
    rows.push({
      num: parts[0],
      dateIso,
      member: parts[3],
      description: parts[4],
      amount: Number(parts[5]),
      running: Number(String(parts[6]).replace(/,/g, "")),
      narrative: parts[7],
      ledgerType: parts[8],
      source: parts[9],
    });
  }
  return rows;
}

async function main() {
  const lr = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      portal: "admin",
      organizationSlug: "assurance",
    }),
  });
  const login = await lr.json();
  if (!lr.ok) throw new Error(login.error);
  const headers = { Authorization: `Bearer ${login.token}` };

  const res = await fetch(`${API}/api/bank-ledger/reference/download`, { headers });
  const text = await res.text();
  const rows = parseReferenceCsv(text);
  console.log("Parsed production rows:", rows.length);
  const jun29 = rows.filter((r) => r.dateIso <= "2026-06-29");
  const july = rows.filter((r) => r.dateIso >= "2026-07-01");
  const last = rows[rows.length - 1];
  const lastJun = jun29[jun29.length - 1];
  console.log("Through 6/29:", jun29.length, "rows, ending", lastJun?.running, "on", lastJun?.dateIso);
  console.log("July:", july.length, "rows, sum", july.reduce((s, r) => s + r.amount, 0));
  july.forEach((r) =>
    console.log(`  ${r.dateIso} ${r.amount} ${r.member} ${r.ledgerType} run ${r.running}`)
  );
  console.log("Last row:", last.dateIso, last.running, last.member, last.amount);
  console.log("Expected stmt ending 16241.55, gap", Math.round((16241.55 - last.running) * 100) / 100);

  const { books } = await (await fetch(`${API}/api/books`, { headers })).json();
  console.log("API ledgerCheckingBalance:", books.ledgerCheckingBalance);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
