#!/usr/bin/env node
const API = process.env.PFM_API_BASE || "https://peer-finance-manager.onrender.com";
const ADMIN_EMAIL = process.env.PFM_ADMIN_EMAIL || "yinka@eworkchop.com";
const ADMIN_PASSWORD = process.env.PFM_ADMIN_PASSWORD || "123456789";

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
  if (!res.ok) throw new Error("download failed");
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  console.log("Total data lines:", lines.length - 1);

  const july = lines.slice(1).filter((l) => l.includes("2026-07-"));
  console.log("\nJuly 2026 rows on production:", july.length);
  for (const line of july) console.log(line);

  const afterJun29 = lines.slice(1).filter((l) => {
    const m = l.match(/,(\d{4}-\d{2}-\d{2}),/);
    return m && m[1] > "2026-06-29";
  });
  console.log("\nAll rows after 2026-06-29:", afterJun29.length);
  let sum = 0;
  for (const line of afterJun29) {
    const parts = line.split(",");
    const amt = Number(parts[5]);
    if (Number.isFinite(amt)) sum += amt;
    console.log(parts[2], amt, parts[3], (parts[4] || "").slice(0, 50), "run", parts[6]);
  }
  console.log("\nSum of amounts after 6/29:", Math.round(sum * 100) / 100);
  console.log("Expected July credits from stmt (8): 770.06");
  console.log("Expected ending: 16241.55");
  console.log("15471.49 + sum =", Math.round((15471.49 + sum) * 100) / 100);

  const last = lines[lines.length - 1];
  console.log("\nLast ledger row:", last);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
