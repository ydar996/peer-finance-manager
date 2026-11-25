#!/usr/bin/env node
const path = require("path");
const { initPaths } = require("../lib/paths");
const { runWithOrg } = require("../lib/org-context");
const { ASSURANCE_SLUG } = require("../lib/organization-service");
const { updateCdBalance } = require("../lib/cd-balance-service");
const { closeDb } = require("../db/database");

initPaths(path.join(__dirname, "..", ".."));

runWithOrg(ASSURANCE_SLUG, () => {
  try {
    const result = updateCdBalance({
      balance: 7211.82,
      asOfDate: "2026-06-18",
      note: "BoA Fixed Term CD — balance includes interest earned this term",
      termSettings: {
        cd_term_start_balance: "7176.28",
        cd_renewal_date: "2026-04-15",
        cd_maturity_date: "2026-07-14",
        cd_annual_rate: "0.0296",
        cd_apy: "0.03",
        cd_term_days: "90",
        cd_opened_date: "2025-07-19",
      },
    });
    console.log("CD balance updated:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  } finally {
    closeDb();
  }
});
