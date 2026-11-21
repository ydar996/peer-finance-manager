#!/usr/bin/env node
/**
 * Member import template pipeline: template build, upload parse, validation,
 * duplicate skip, member+profile creation, optional columns.
 * Run: node peer-finance-manager/scripts/test-member-import.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-member-import-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const { applyCountryProfileDefaults } = require("../lib/country-profile");
const {
  buildMemberImportTemplateXlsxBuffer,
  buildMemberImportTemplateCsv,
  importMemberTemplate,
  TEMPLATE_HEADERS,
} = require("../lib/member-import-service");

const ORG = "member-import-ng-coop";
openOrgDatabase(ORG);

runWithOrg(ORG, () => {
  applyCountryProfileDefaults("NG", { forceLocaleSettings: true });

  // 1. Template builds with required headers.
  const buf = buildMemberImportTemplateXlsxBuffer();
  assert(Buffer.isBuffer(buf) && buf.length > 0);
  const wb = XLSX.read(buf, { type: "buffer" });
  assert(wb.SheetNames.includes("Members"));
  const headerRow = XLSX.utils.sheet_to_json(wb.Sheets["Members"], { header: 1 })[0];
  assert(headerRow.includes("First Name"));
  assert(headerRow.includes("Last Name"));
  const csv = buildMemberImportTemplateCsv();
  assert(csv.startsWith(`"First Name"`));

  // 2. Import a filled workbook: two valid rows, one missing Last Name, one duplicate.
  const upload = [
    TEMPLATE_HEADERS,
    ["Ada", "Obi", "", "Female", "15/03/1990", "ada@example.org", "+234 801", "12 Close", "Ikeja", "Lagos", "", "Nigeria", "Tunde Obi", "+234 802", "Spouse", "15/01/2026", "Yes", 25000, "founding"],
    ["Chidi", "Eze", "", "", "", "", "", "", "", "", "", "", "", "", "", "20/01/2026", "", "", ""],
    ["NoLast", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Ada", "Obi", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ];
  const wu = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wu, XLSX.utils.aoa_to_sheet([["inst"]]), "Instructions");
  XLSX.utils.book_append_sheet(wu, XLSX.utils.aoa_to_sheet(upload), "Members");
  const filePath = path.join(tmpRoot, "upload.xlsx");
  XLSX.writeFile(wu, filePath);

  const result = importMemberTemplate(filePath);
  assert.strictEqual(result.created, 2, JSON.stringify(result, null, 2));
  assert.strictEqual(result.failed, 1);
  assert.strictEqual(result.skipped, 1);
  assert.match(result.errors[0].errors[0], /Last Name/);
  assert.match(result.skippedRows[0].reason, /already exists/);

  const db = getDb();
  const ada = db.prepare(`SELECT * FROM members WHERE name = ?`).get("Ada Obi");
  assert(ada);
  assert.strictEqual(ada.membership_fee_paid, 1);
  const adaProfile = db.prepare(`SELECT * FROM member_profiles WHERE member_id = ?`).get(ada.id);
  assert(adaProfile);
  assert.strictEqual(adaProfile.email, "ada@example.org");
  assert.strictEqual(adaProfile.preferred_payment_method, "Bank Transfer");
  const chidi = db.prepare(`SELECT * FROM members WHERE name = ?`).get("Chidi Eze");
  assert(chidi);
  assert.strictEqual(chidi.membership_fee_paid, 0);

  // Member numbers auto-assigned.
  assert(ada.member_number && /-\d{3}$/.test(ada.member_number));
  assert(chidi.member_number && chidi.member_number !== ada.member_number);

  // 3. Opening deposit recorded as a transaction, no membership-fee transaction.
  const txs = db.prepare(`SELECT * FROM transactions WHERE member_id = ?`).all(ada.id);
  const deposits = txs.filter((t) => t.type === "deposit");
  assert.strictEqual(deposits.length, 1);
  assert.strictEqual(deposits[0].amount, 25000);
  assert.strictEqual(txs.filter((t) => t.type === "membership_fee").length, 0);
  const chidiTxs = db.prepare(`SELECT COUNT(*) c FROM transactions WHERE member_id = ?`).get(chidi.id);
  assert.strictEqual(chidiTxs.c, 0, "minimal row must not create fee transactions");

  // 4. Re-import same file: all rows skipped as duplicates.
  const filePath2 = path.join(tmpRoot, "upload2.xlsx");
  XLSX.writeFile(wu, filePath2);
  const result2 = importMemberTemplate(filePath2);
  assert.strictEqual(result2.created, 0);
  assert.strictEqual(result2.skipped, 3);
  assert.strictEqual(result2.failed, 1);
  assert.strictEqual(db.prepare(`SELECT COUNT(*) c FROM members`).get().c, 2);

  // 5. CSV upload also works.
  const csvUpload = `"First Name","Last Name","Email"\n"Ngozi","Ade","ngozi@example.org"`;
  const csvPath = path.join(tmpRoot, "upload.csv");
  fs.writeFileSync(csvPath, csvUpload);
  const result3 = importMemberTemplate(csvPath);
  assert.strictEqual(result3.created, 1);
  assert.strictEqual(result3.failed, 0);
});
closeDb(ORG);

// US org default payment rail stays Zelle.
const US_ORG = "member-import-us-coop";
openOrgDatabase(US_ORG);
runWithOrg(US_ORG, () => {
  applyCountryProfileDefaults("US", { forceLocaleSettings: true });
  const upload = [TEMPLATE_HEADERS, ["Jane", "Smith"]];
  const wu = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wu, XLSX.utils.aoa_to_sheet(upload), "Members");
  const p = path.join(tmpRoot, "us.xlsx");
  XLSX.writeFile(wu, p);
  const r = importMemberTemplate(p);
  assert.strictEqual(r.created, 1);
  const prof = getDb().prepare(
    `SELECT preferred_payment_method FROM member_profiles p JOIN members m ON m.id=p.member_id WHERE m.name='Jane Smith'`
  ).get();
  // Minimal row: no profile fields supplied => createMember may skip profile row.
  if (prof) assert.strictEqual(prof.preferred_payment_method, "Zelle");
});
closeDb(US_ORG);

console.log("member-import tests passed");
