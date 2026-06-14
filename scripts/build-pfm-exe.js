#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "peer-finance-manager", "dist");
const dataDir = path.join(distDir, "data");
const PKG_NODE_TARGET = "18.5.0";

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function rebuildSqliteForPkg() {
  console.log(`Rebuilding better-sqlite3 for Node ${PKG_NODE_TARGET} (pkg runtime)...`);
  execSync("npm rebuild better-sqlite3", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_target: PKG_NODE_TARGET,
      npm_config_arch: "x64",
      npm_config_disturl: "https://nodejs.org/dist",
      npm_config_runtime: "node",
      npm_config_build_from_source: "true",
    },
  });
}

function restoreSqliteForDev() {
  console.log("Restoring better-sqlite3 for local Node development...");
  try {
    execSync("npm rebuild better-sqlite3", { cwd: root, stdio: "inherit" });
  } catch (err) {
    console.warn("Warning: could not restore dev sqlite build:", err.message);
  }
}

function placeNativeBinary(builtNode, ...destDirs) {
  for (const dir of destDirs) {
    const releaseDir = path.join(dir, "build", "Release");
    fs.mkdirSync(releaseDir, { recursive: true });
    fs.copyFileSync(builtNode, path.join(releaseDir, "better_sqlite3.node"));
    fs.copyFileSync(builtNode, path.join(dir, "better_sqlite3.node"));
    console.log(`  placed native module in ${dir}`);
  }
}

function syncRuntimeBundle(fromDir, toDir) {
  const names = [
    "data",
    "db",
    "public",
    "lib",
    "build",
    "statements",
    "styles.css",
    "README.txt",
    "loan details and interest.xlsx",
    "Assurance Status 4 2026.xlsx",
    "Assurance Status 5 2026.xlsx",
  ];
  for (const name of names) {
    const src = path.join(fromDir, name);
    const dest = path.join(toDir, name);
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isDirectory()) copyDirRecursive(src, dest);
    else copyIfExists(src, dest);
  }
  const wpforms = fs.readdirSync(fromDir).find((f) => f.startsWith("wpforms-") && f.endsWith(".csv"));
  if (wpforms) copyIfExists(path.join(fromDir, wpforms), path.join(toDir, wpforms));
}

fs.mkdirSync(dataDir, { recursive: true });

const rootDataDb = path.join(root, "data", "peerfinance.db");
const srcDb = path.join(root, "peer-finance-manager", "data", "peerfinance.db");
const dbSource = fs.existsSync(rootDataDb)
  ? rootDataDb
  : fs.existsSync(srcDb)
    ? srcDb
    : null;
if (dbSource) {
  const bundledDb = path.join(dataDir, "peerfinance.db");
  const seedDb = path.join(dataDir, "peerfinance.seed.db");
  fs.copyFileSync(dbSource, bundledDb);
  fs.copyFileSync(dbSource, seedDb);
  console.log(`  bundled database from ${path.relative(root, dbSource)}`);
} else {
  console.warn("  warning: no peerfinance.db found to bundle");
}

copyIfExists(
  path.join(root, "Assurance Status 4 2026.xlsx"),
  path.join(distDir, "Assurance Status 4 2026.xlsx")
);
copyIfExists(
  path.join(root, "Assurance Status 5 2026.xlsx"),
  path.join(distDir, "Assurance Status 5 2026.xlsx")
);

const wpforms = fs.readdirSync(root).find((f) => f.startsWith("wpforms-") && f.endsWith(".csv"));
if (wpforms) {
  copyIfExists(path.join(root, wpforms), path.join(distDir, wpforms));
}

const profilesExport = path.join(root, "peer-finance-manager", "data", "exports", "member-profiles.json");
if (fs.existsSync(profilesExport)) {
  const exportDir = path.join(dataDir, "exports");
  fs.mkdirSync(exportDir, { recursive: true });
  fs.copyFileSync(profilesExport, path.join(exportDir, "member-profiles.json"));
}

const libDir = path.join(distDir, "lib");
fs.mkdirSync(libDir, { recursive: true });
copyDirRecursive(path.join(root, "peer-finance-manager", "lib"), libDir);
copyIfExists(path.join(root, "lib", "statement-generator.js"), path.join(libDir, "statement-generator.js"));
copyIfExists(path.join(root, "lib", "bank-statement-parser.js"), path.join(libDir, "bank-statement-parser.js"));
copyIfExists(path.join(root, "styles.css"), path.join(distDir, "styles.css"));
copyIfExists(
  path.join(root, "loan details and interest.xlsx"),
  path.join(distDir, "loan details and interest.xlsx")
);
fs.mkdirSync(path.join(distDir, "statements"), { recursive: true });
copyIfExists(
  path.join(root, "peer-finance-manager", "db", "schema.sql"),
  path.join(distDir, "db", "schema.sql")
);
copyDirRecursive(
  path.join(root, "peer-finance-manager", "public"),
  path.join(distDir, "public")
);
const indexPath = path.join(distDir, "public", "index.html");
if (fs.existsSync(indexPath)) {
  const buildTag = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(
    /<script src="app\.js(\?[^"]*)?"><\/script>/,
    `<script src="app.js?v=${buildTag}"></script>`
  );
  fs.writeFileSync(indexPath, html, "utf8");
}

rebuildSqliteForPkg();

const builtNode = path.join(
  root,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
if (!fs.existsSync(builtNode)) {
  throw new Error("better_sqlite3.node not found after rebuild");
}

const pkgArgs = [
  "pkg",
  path.join(root, "peer-finance-manager", "launcher.js"),
  "--targets",
  "node18-win-x64",
  "--output",
  path.join(distDir, "PeerFinanceManager.exe"),
  "--compress",
  "GZip",
];

console.log("Building PeerFinanceManager.exe...");
execSync(`npx ${pkgArgs.map((a) => `"${a}"`).join(" ")}`, {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PKG_CACHE_PATH: path.join(root, ".pkg-cache"),
  },
});

console.log("Placing native SQLite module beside executable...");
placeNativeBinary(builtNode, distDir, root);

restoreSqliteForDev();

const readme = `Assurance Cooperative Manager
=============================

Double-click PeerFinanceManager.exe to start the app.
Your browser will open to http://localhost:3457

If the window closes immediately, open data/startup.log for details.

One app for member accounts, imports, loans, and PDF statements.
Close the console window to stop the server.
`;

fs.writeFileSync(path.join(distDir, "README.txt"), readme, "utf8");

console.log("Syncing runtime bundle to project root...");
fs.copyFileSync(path.join(distDir, "PeerFinanceManager.exe"), path.join(root, "PeerFinanceManager.exe"));
syncRuntimeBundle(distDir, root);

console.log(`\nDone:`);
console.log(`  ${path.join(distDir, "PeerFinanceManager.exe")}`);
console.log(`  ${path.join(root, "PeerFinanceManager.exe")}`);
console.log(`  Native module: build/Release/better_sqlite3.node (next to each exe)`);
