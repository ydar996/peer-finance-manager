#!/usr/bin/env node
const path = require("path");
const { initPaths } = require("../lib/paths");
initPaths(path.join(__dirname, ".."));
const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase } = require("../db/database");
const { syncMissingBankLedgerRows } = require("../lib/import-bank-ledger");
const { getLedgerEndingBalance } = require("../lib/cooperative-bank-ledger-csv");
const { getCooperativeStatusReportData } = require("../lib/cooperative-status-report");

const org = process.argv[2] || "assurance";

runWithOrg(org, () => {
  openOrgDatabase(org);
  const result = syncMissingBankLedgerRows();
  const ledger = getLedgerEndingBalance();
  const report = getCooperativeStatusReportData({ asOfDate: "2026-06-30" });
  console.log(JSON.stringify({ result, ledger, reportChecking: report.bankBalances.checkingBalance }, null, 2));
});
