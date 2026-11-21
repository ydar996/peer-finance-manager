#!/usr/bin/env node
/**
 * Bank account import template pipeline: template build, bank catalog
 * canonicalization, validation, duplicate skip, account creation.
 * Run: node peer-finance-manager/scripts/test-bank-account-import.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-bankacct-import-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb } = require("../db/database");
const { applyCountryProfileDefaults } = require("../lib/country-profile");
const {
  buildBankAccountImportTemplateXlsxBuffer,
  buildBankAccountImportTemplateCsv,
  importBankAccountTemplate,
  TEMPLATE_HEADERS,
} = require("../lib/bank-account-import-service");
const { listBankAccounts } = require("../lib/bank-account-service");

const ORG = "bankacct-import-ng-coop";
openOrgDatabase(ORG);

runWithOrg(ORG, () => {
  applyCountryProfileDefaults("NG", { forceLocaleSettings: true });

  // 1. Template builds with Banks reference sheet listing the NG catalog.
  const buf = buildBankAccountImportTemplateXlsxBuffer();
  assert(Buffer.isBuffer(buf) && buf.length > 0);
  const wb = XLSX.read(buf, { type: "buffer" });
  assert(wb.SheetNames.includes("Bank Accounts"));
  assert(wb.SheetNames.includes("Banks"), "template must include a Banks reference sheet");
  const bankRows = XLSX.utils.sheet_to_json(wb.Sheets["Banks"], { header: 1 });
  const bankNames = bankRows.map((r) => r[0]);
  assert(bankNames.includes("Providus Bank"));
  assert(bankNames.includes("Guaranty Trust Bank (GTBank)"));
  const csv = buildBankAccountImportTemplateCsv();
  assert(csv.startsWith(`"Account ID"`));

  // 2. Import: valid rows, alias resolution, missing label error, duplicate skip.
  const upload = [
    TEMPLATE_HEADERS,
    ["BA001", "Providus Operations", "Providus Bank", "1308706267", "", "", "", "Yes"],
    ["BA002", "Providus Share Capital", "Providus", "1308819983", "", "", "", ""],
    ["BA005", "GTBank Operating", "gtbank", "", "", "", "", ""],
    ["", "", "Zenith Bank", "999", "", "", "", ""],
    ["BA001", "Providus Operations", "Providus Bank", "1308706267", "", "", "", ""],
  ];
  const wu = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wu, XLSX.utils.aoa_to_sheet([["inst"]]), "Instructions");
  XLSX.utils.book_append_sheet(wu, XLSX.utils.aoa_to_sheet(upload), "Bank Accounts");
  const filePath = path.join(tmpRoot, "acct-upload.xlsx");
  XLSX.writeFile(wu, filePath);

  const result = importBankAccountTemplate(filePath);
  assert.strictEqual(result.created, 3, JSON.stringify(result, null, 2));
  assert.strictEqual(result.failed, 1);
  assert.strictEqual(result.skipped, 1);
  assert.match(result.errors[0].errors[0], /Account Label is required/);

  const accounts = listBankAccounts();
  assert.strictEqual(accounts.length, 4, "3 imported + 1 seeded default");
  const ops = accounts.find((a) => a.accountLabel === "Providus Operations");
  assert.strictEqual(ops.accountCode, "BA001");
  assert.strictEqual(ops.accountNumber, "1308706267");
  assert.strictEqual(ops.currency, "NGN", "currency defaults to org currency");
  assert.strictEqual(ops.isPrimary, 1);

  // Alias resolution: "Providus" and "gtbank" canonicalize to catalog names.
  const share = accounts.find((a) => a.accountLabel === "Providus Share Capital");
  assert.strictEqual(share.institutionName, "Providus Bank");
  const gtb = accounts.find((a) => a.accountLabel === "GTBank Operating");
  assert.strictEqual(gtb.institutionName, "Guaranty Trust Bank (GTBank)");

  // 3. Re-import is idempotent: all rows skipped.
  const filePath2 = path.join(tmpRoot, "acct-upload2.xlsx");
  XLSX.writeFile(wu, filePath2);
  const result2 = importBankAccountTemplate(filePath2);
  assert.strictEqual(result2.created, 0);
  assert.strictEqual(result2.skipped, 4);
  assert.strictEqual(listBankAccounts().length, 4);

  // 4. CSV upload works.
  const csvPath = path.join(tmpRoot, "acct-upload.csv");
  fs.writeFileSync(csvPath, `"Account ID","Account Label","Institution","Account No"\n"BA003","Zenith Savings","Zenith","555111"`);
  const result3 = importBankAccountTemplate(csvPath);
  assert.strictEqual(result3.created, 1);
  const zen = listBankAccounts().find((a) => a.accountLabel === "Zenith Savings");
  assert.strictEqual(zen.institutionName, "Zenith Bank");
  assert.strictEqual(zen.accountNumber, "555111");
});
closeDb(ORG);

console.log("bank-account-import tests passed");
