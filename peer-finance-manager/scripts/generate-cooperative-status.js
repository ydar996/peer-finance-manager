#!/usr/bin/env node
/**
 * Generate the monthly cooperative status PDF for the active organization.
 * Usage: node peer-finance-manager/scripts/generate-cooperative-status.js [--year YYYY] [--month MM]
 */
const { runWithOrg } = require("../lib/org-context");
const { closeDb } = require("../db/database");
const {
  generateMonthlyStatusReport,
  getMonthlyStatusReportStatus,
} = require("../lib/monthly-status-report-service");

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--year" && argv[i + 1]) options.year = Number(argv[++i]);
    if (argv[i] === "--month" && argv[i + 1]) options.month = Number(argv[++i]);
    if (argv[i] === "--org" && argv[i + 1]) options.org = argv[++i];
  }
  return options;
}

const cli = parseArgs(process.argv.slice(2));
const orgSlug = cli.org || "assurance";

runWithOrg(orgSlug, async () => {
  const preview = getMonthlyStatusReportStatus({
    year: cli.year,
    month: cli.month,
  });
  console.log("Organization:", orgSlug);
  console.log("Report as at:", preview.period.labelUs, `(${preview.period.periodLabel})`);
  console.log("Cash at Hand:", preview.status?.period ? "see PDF" : "");

  const result = await generateMonthlyStatusReport({
    year: cli.year,
    month: cli.month,
  });
  console.log("Saved:", result.outputPath);
  console.log("Published:", result.published ? "yes" : "no");
})
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => closeDb(orgSlug));
