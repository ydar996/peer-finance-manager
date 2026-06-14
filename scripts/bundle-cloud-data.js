#!/usr/bin/env node
/**
 * Packages your local cooperative data for upload to Render's persistent disk.
 * Close PeerFinanceManager.exe first so databases can be copied cleanly.
 *
 * Run: npm run bundle:cloud-data
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const stagingDir = path.join(root, ".cloud-data-staging");
const outZip = path.join(root, "cloud-data-bundle.zip");

function rmDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyTree(src, dest, options = {}) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(srcPath, destPath, options);
      continue;
    }
    if (entry.name.endsWith(".db")) {
      backupSqlite(srcPath, destPath);
      continue;
    }
    if (/\.db-(wal|shm)$/i.test(entry.name)) {
      continue;
    }
    fs.copyFileSync(srcPath, destPath);
  }
}

function backupSqlite(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) return;
  let src;
  try {
    const Database = require("better-sqlite3");
    src = new Database(srcPath, { readonly: true, fileMustExist: true });
    src.backup(destPath);
    console.log("Backed up", path.relative(root, srcPath));
  } catch (err) {
    console.warn(`Backup failed for ${srcPath}, copying file: ${err.message}`);
    fs.copyFileSync(srcPath, destPath);
  } finally {
    try {
      if (src) src.close();
    } catch (_) {}
  }
}

if (!fs.existsSync(dataDir)) {
  console.error("No data/ folder found. Nothing to bundle.");
  process.exit(1);
}

console.log("Staging data (SQLite databases are copied safely even if the app is open)...");
rmDir(stagingDir);
copyTree(dataDir, stagingDir);

if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

const isWin = process.platform === "win32";
if (isWin) {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${outZip}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(`cd "${stagingDir}" && zip -r "${outZip}" .`, { stdio: "inherit" });
}

rmDir(stagingDir);
console.log(`\nCreated: ${outZip}`);
console.log("Upload this to Render (see DEPLOY-TODAY.md step 5).");
process.exit(0);
