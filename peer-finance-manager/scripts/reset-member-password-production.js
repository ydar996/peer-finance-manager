#!/usr/bin/env node
/**
 * Reset one active member's portal password on production (or any API).
 *
 * Usage:
 *   node peer-finance-manager/scripts/reset-member-password-production.js --org assurance --name "Gbanju"
 */
const API_BASE = process.env.PFM_API_BASE || "https://peer-finance-manager.onrender.com";
const ADMIN_EMAIL = process.env.PFM_ADMIN_EMAIL || "yinka@eworkchop.com";
const ADMIN_PASSWORD = process.env.PFM_ADMIN_PASSWORD || "123456789";

function parseArgs(argv) {
  const out = { org: "assurance", name: null, memberId: null, api: API_BASE };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--org" && argv[i + 1]) out.org = argv[++i];
    else if (arg === "--name" && argv[i + 1]) out.name = argv[++i];
    else if (arg === "--member-id" && argv[i + 1]) out.memberId = Number(argv[++i]);
    else if (arg === "--api" && argv[i + 1]) out.api = argv[++i];
  }
  if (!out.name && !out.memberId) {
    console.error(
      'Usage: node peer-finance-manager/scripts/reset-member-password-production.js --org assurance --name "Gbanju"'
    );
    process.exit(1);
  }
  return out;
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

async function main() {
  const { org, name, memberId, api } = parseArgs(process.argv);
  const token = await login(api, org);
  const res = await fetch(`${api}/api/users/reset-member-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      memberId: memberId || undefined,
      memberName: name || undefined,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Password reset failed");

  console.log("Member portal login reset:");
  console.log(`  Member:   ${body.memberName} (#${body.memberId})`);
  console.log(`  Username: ${body.username}`);
  console.log(`  Email:    ${body.email}`);
  console.log(`  Temp password: ${body.tempPassword}`);
  console.log("  (Must change password on next login)");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
