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
  const books = await (
    await fetch(`${API}/api/books/detail/checking-balance`, { headers })
  ).json();
  const { books: summary } = await (await fetch(`${API}/api/books`, { headers })).json();
  console.log("Production checking-balance detail:");
  console.log(JSON.stringify(books, null, 2));
  console.log("\nCooperative Books summary:");
  console.log(
    "  ledgerCheckingBalance:",
    summary?.ledgerCheckingBalance,
    "through",
    summary?.ledgerCheckingAsOf
  );
  console.log(
    "  checkingBalance setting:",
    summary?.checkingBalance,
    "as of",
    summary?.checkingBalanceAsOf
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
