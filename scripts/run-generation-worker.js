#!/usr/bin/env node
/**
 * Runs statement generation in a separate process.
 * Writes progress to a JSON file for the server to read.
 * Usage: node scripts/run-generation-worker.js <progressFile> <workbookPath> <sheetName> <baseDir> [distributionFilename]
 * distributionFilename: optional, use "-" for none
 */
const fs = require("fs");
const path = require("path");
const { generateStatements, parseWorkbook } = require("../lib/statement-generator");

const [progressFile, workbookPath, sheetName, baseDir, distributionFilename] = process.argv.slice(2);
if (!progressFile || !workbookPath || !sheetName || !baseDir) {
  process.exit(1);
}

const distributionFilePath =
  distributionFilename && distributionFilename !== "-"
    ? path.join(baseDir, distributionFilename)
    : null;

function writeProgress(data) {
  fs.writeFileSync(progressFile, JSON.stringify(data), "utf8");
}

let total = 0;
try {
  const parsed = parseWorkbook(workbookPath, sheetName);
  total = parsed.members.length;
} catch (_) {}

writeProgress({ current: 0, total, member: "Launching browser...", done: false });

generateStatements({
  workbookPath,
  sheetName,
  baseDir,
  distributionFilePath,
  onProgress: (memberName, current, total) => {
    writeProgress({ current, total, member: memberName, done: false });
  },
})
  .then((result) => {
    writeProgress({
      done: true,
      success: true,
      count: result.count,
      outputDir: result.outputDir,
    });
  })
  .catch((err) => {
    writeProgress({
      done: true,
      success: false,
      error: err.message,
    });
    process.exit(1);
  });
