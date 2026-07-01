#!/usr/bin/env node
/** Regression checks for proxy deposit member resolution. */
const assert = require("assert");
const {
  resolveProxyBeneficiaryFromDescription,
  resolveDepositMemberFromDescription,
} = require("../lib/member-name-match");
const {
  resolveZellePayerFromDescription,
  findProxyDepositMismatches,
  findContributionTypeMismatches,
} = require("../lib/ledger-import-audit");

const members = [
  "Yinka Daramola",
  "Ejiro Awhotu",
  "Titilope Saliu",
  "Oluwabiyi Omotuyole",
];

const ejiroDesc =
  "Zelle payment from AWOYINKA DARAMOLA for Ejiro Awhotu; Conf# 04TRT19IP";
const titilopeDesc =
  "Zelle payment from AWOYINKA DARAMOLA for Titilope Saliu; Conf# 05CWRF9R9";
const loanPaymentDesc =
  "Zelle payment from OLUWABIYI OMOTUYOLE for loan payment; Conf# czb4gp2";

assert.strictEqual(
  resolveProxyBeneficiaryFromDescription(ejiroDesc, members),
  "Ejiro Awhotu"
);
assert.strictEqual(
  resolveProxyBeneficiaryFromDescription(titilopeDesc, members),
  "Titilope Saliu"
);
assert.strictEqual(resolveProxyBeneficiaryFromDescription(loanPaymentDesc, members), null);
assert.strictEqual(resolveDepositMemberFromDescription(ejiroDesc, members), "Ejiro Awhotu");
assert.strictEqual(resolveZellePayerFromDescription(ejiroDesc, members), "Yinka Daramola");

const proxyIssues = findProxyDepositMismatches(
  [
    {
      ledgerType: "deposit",
      date: "2025-03-04",
      amount: 300.15,
      member: "Yinka Daramola",
      description: ejiroDesc,
    },
  ],
  members
);
assert.strictEqual(proxyIssues.length, 1);
assert.strictEqual(proxyIssues[0].beneficiary, "Ejiro Awhotu");

const typeIssues = findContributionTypeMismatches([
  {
    ledgerType: "loan_repayment",
    date: "2026-03-23",
    amount: 100.13,
    member: "Oluwabiyi Omotuyole",
    description: loanPaymentDesc,
  },
]);
assert.strictEqual(typeIssues.length, 1);

console.log("ledger-import-audit: OK");
