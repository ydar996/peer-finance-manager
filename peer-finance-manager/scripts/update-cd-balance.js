#!/usr/bin/env node
const path = require("path");
const { initPaths } = require("../lib/paths");
const { runWithOrg } = require("../lib/org-context");
const { ASSURANCE_SLUG } = require("../lib/organization-service");
const { updateCdBalance, CD_TERM_DEFAULTS } = require("../lib/cd-balance-service");
const { closeDb } = require("../db/database");

initPaths(path.join(__dirname, "..", ".."));

runWithOrg(ASSURANCE_SLUG, () => {
  try {
    const result = updateCdBalance({
      balance: 7211.82,
      asOfDate: "2026-06-18",
      note: "BoA Fixed Term CD — balance includes interest earned this term",
      termSettings: CD_TERM_DEFAULTS,
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
