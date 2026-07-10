#!/usr/bin/env node
/**
 * Remove a pending membership applicant from production (deletes application + profile).
 *
 * Usage:
 *   node scripts/remove-pending-applicant-production.js --org assurance --name "Testy"
 */
const API_BASE = process.env.PFM_API_BASE || "https://peer-finance-manager.onrender.com";
const ADMIN_EMAIL = process.env.PFM_ADMIN_EMAIL || "yinka@eworkchop.com";
const ADMIN_PASSWORD = process.env.PFM_ADMIN_PASSWORD || "123456789";

function parseArgs(argv) {
  const out = { org: null, name: null, api: API_BASE };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--org" && argv[i + 1]) out.org = argv[++i];
    else if (arg === "--name" && argv[i + 1]) out.name = argv[++i];
    else if (arg === "--api" && argv[i + 1]) out.api = argv[++i];
  }
  if (!out.org || !out.name) {
    console.error("Usage: node scripts/remove-pending-applicant-production.js --org <slug> --name <substring>");
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
  const { org, name, api } = parseArgs(process.argv);
  const needle = name.toLowerCase();
  const token = await login(api, org);

  const listRes = await fetch(`${api}/api/flexxforms/applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listBody = await listRes.json();
  if (!listRes.ok) throw new Error(listBody.error || "Failed to list applications");

  const matches = (listBody.applications || []).filter((app) =>
    String(app.applicantName || "").toLowerCase().includes(needle)
  );
  if (!matches.length) {
    console.log(`No membership applications matching "${name}" on ${org}.`);
    return;
  }

  for (const app of matches) {
    const delRes = await fetch(`${api}/api/flexxforms/applications/${app.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const delBody = await delRes.json();
    if (!delRes.ok) throw new Error(delBody.error || `Delete failed for application ${app.id}`);
    console.log(
      `Removed application ${app.id} (${app.applicantName}): memberRemoved=${delBody.memberRemoved}`
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
