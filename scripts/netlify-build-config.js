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
  "/productngn  /productngn.html  200",
  "/brochure  /brochure.html  200",
  "/c/*/about  /cooperative-public.html  200",
  "/c/*/bylaws  /cooperative-public.html  200",
  "/c/*/apply  /cooperative-public.html  200",
  "/  /member  302",
]
  .filter(Boolean)
  .join("\n");

fs.writeFileSync(path.join(publicDir, "_redirects"), `${redirects}\n`, "utf8");

const buildId = process.env.NETLIFY_DEPLOY_ID || String(Date.now());
const cacheBust = buildId.slice(0, 12);
for (const htmlName of ["index.html", "cooperative-public.html", "brochure.html", "product.html", "productngn.html"]) {
  const htmlPath = path.join(publicDir, htmlName);
  if (!fs.existsSync(htmlPath)) continue;
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html
    .replace(/href="\/?styles\.css(?:\?v=[^"]*)?"/g, `href="/styles.css?v=${cacheBust}"`)
    .replace(/href="\/?cooperative-public\.css(?:\?v=[^"]*)?"/g, `href="/cooperative-public.css?v=${cacheBust}"`)
    .replace(/href="\/?brochure\.css(?:\?v=[^"]*)?"/g, `href="/brochure.css?v=${cacheBust}"`)
    .replace(/href="\/?product\.css(?:\?v=[^"]*)?"/g, `href="/product.css?v=${cacheBust}"`)
    .replace(/src="\/?app\.js(?:\?v=[^"]*)?"/g, `src="/app.js?v=${cacheBust}"`)
    .replace(/src="\/?flexxforms-embed\.js(?:\?v=[^"]*)?"/g, `src="/flexxforms-embed.js?v=${cacheBust}"`);
  fs.writeFileSync(htmlPath, html, "utf8");
}

console.log("Wrote Netlify _redirects", apiBase ? `(API → ${apiBase})` : "(no API proxy yet)");
console.log(`Cache-busted static assets (v=${cacheBust})`);
