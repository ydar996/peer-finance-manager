#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const apiBase = (process.env.RENDER_API_URL || process.env.PFM_API_URL || "").replace(/\/$/, "");
const publicDir = path.join(__dirname, "..", "peer-finance-manager", "public");

if (!apiBase) {
  console.warn("RENDER_API_URL not set — Netlify will serve UI only until you add the API proxy URL.");
}

const redirects = [
  apiBase ? `/api/*  ${apiBase}/api/:splat  200` : null,
  "/member  /index.html  200",
  "/staff  /index.html  200",
  "/admin  /index.html  200",
  "/register  /index.html  200",
  "/platform  /index.html  200",
  "/product  /product.html  200",
  "/c/*/about  /cooperative-public.html  200",
  "/c/*/bylaws  /cooperative-public.html  200",
  "/  /member  302",
]
  .filter(Boolean)
  .join("\n");

fs.writeFileSync(path.join(publicDir, "_redirects"), `${redirects}\n`, "utf8");
console.log("Wrote Netlify _redirects", apiBase ? `(API → ${apiBase})` : "(no API proxy yet)");
