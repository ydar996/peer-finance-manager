#!/usr/bin/env node
/**
 * Share Capital accounts: admin toggle, manual entries, member balances/profile,
 * statement-import plumbing (keyword classify + ledger-type insert), disabled state.
 * Run: node peer-finance-manager/scripts/test-share-capital.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-share-capital-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, getDb } = require("../db/database");
const { applyCountryProfileDefaults } = require("../lib/country-profile");
const { createMember } = require("../lib/member-service");
const {
  isShareCapitalEnabled,
  setShareCapitalEnabled,
  getMemberShareCapitalBalance,
  getTotalShareCapital,
  recordMemberShareCapitalEntry,
} = require("../lib/share-capital-service");
const {
  getMembershipPolicy,
  setMembershipPolicy,
} = require("../lib/membership-policy-service");
const { getMemberProfile } = require("../lib/member-profile-service");
const { getMemberAccountSummary } = require("../lib/cooperative-books");
const { classifyDescriptionWithRules } = require("../lib/import-rules-service");
const { importBankLedgerFromTransactions } = require("../lib/import-bank-ledger");

const ORG = "share-capital-ng-coop";
openOrgDatabase(ORG);

runWithOrg(ORG, () => {
  applyCountryProfileDefaults("NG", { forceLocaleSettings: true });

  // 1. Disabled by default: flag off, manual entries rejected.
  assert.strictEqual(isShareCapitalEnabled(), false);
  assert.strictEqual(getMembershipPolicy().shareCapitalEnabled, false);
  const { memberId: adaId } = createMember({ name: "Ada Obi", recordMembershipFee: false });
  const member = { id: adaId };
  assert.throws(
    () =>
      recordMemberShareCapitalEntry({
        memberId: member.id,
        direction: "purchase",
        amount: 50000,
        transactionDate: "2026-11-01",
      }),
    /not enabled/
  );

  // 2. Toggle on through the policy surface (what the admin PATCH sends).
  setMembershipPolicy({ shareCapitalEnabled: true });
  assert.strictEqual(isShareCapitalEnabled(), true);
  assert.strictEqual(getMembershipPolicy().shareCapitalEnabled, true);

  // 3. Manual purchase + redemption with sign conventions.
  recordMemberShareCapitalEntry({
    memberId: member.id,
    direction: "purchase",
    amount: 50000,
    transactionDate: "2026-11-01",
    description: "100 ordinary shares",
  });
  assert.strictEqual(getMemberShareCapitalBalance(member.id), 50000);
  recordMemberShareCapitalEntry({
    memberId: member.id,
    direction: "redemption",
    amount: 20000,
    transactionDate: "2026-11-05",
  });
  assert.strictEqual(getMemberShareCapitalBalance(member.id), 30000);
  assert.strictEqual(getTotalShareCapital(), 30000);

  // 4. Member profile + account summary carry the account.
  const summary = getMemberAccountSummary(member.id);
  assert.strictEqual(summary.shareCapitalBalance, 30000);
  const profile = getMemberProfile(member.id);
  assert.strictEqual(profile.share_capital_enabled, true);
  assert.strictEqual(profile.share_capital_balance, 30000);
  assert.strictEqual(profile.share_capital_transactions.length, 2);
  assert.strictEqual(profile.share_capital_transactions[0].type, "share_capital_redemption");
  assert.strictEqual(profile.share_capital_transactions[0].balance_after, 30000);
  assert.strictEqual(profile.share_capital_transactions[1].balance_after, 50000);

  // 5. Narration keyword classification routes share-capital rows.
  assert.strictEqual(
    classifyDescriptionWithRules("TRF TO TTFC SHARE CAPITAL ACCT - member sub"),
    "share_capital"
  );
  assert.strictEqual(
    classifyDescriptionWithRules("Share subscription payment"),
    "share_capital"
  );
  assert.strictEqual(
    classifyDescriptionWithRules("monthly contribution savings"),
    "deposit"
  );

  // 6. Full-ledger import posts share rows to the member account.
  // Full refresh rebuilds the ledger: earlier manual share rows are replaced,
  // so the post-import balance equals the imported rows only.
  const result = importBankLedgerFromTransactions({
    bankTxs: [
      {
        date: "2026-11-10",
        amount: 75000,
        description: "INWARD TRANSFER - Share Capital purchase",
        ledgerType: "share_capital",
        member: "Ada Obi",
        source: "test",
      },
    ],
    sourceLabel: "share-capital-test",
    replaceSpreadsheetDeposits: false,
    captureReconcileAnchor: false,
  });
  assert.strictEqual(result.shareCapital, 1, JSON.stringify(result));
  assert.strictEqual(getMemberShareCapitalBalance(member.id), 75000);

  // 7. Redemption import rows store a negative amount (rebuild includes the purchase).
  importBankLedgerFromTransactions({
    bankTxs: [
      {
        date: "2026-11-10",
        amount: 75000,
        description: "INWARD TRANSFER - Share Capital purchase",
        ledgerType: "share_capital",
        member: "Ada Obi",
        source: "test",
      },
      {
        date: "2026-11-12",
        amount: 5000,
        description: "Share redemption paid out",
        ledgerType: "share_capital_redemption",
        member: "Ada Obi",
        source: "test",
      },
    ],
    sourceLabel: "share-capital-redeem-test",
    replaceSpreadsheetDeposits: false,
    captureReconcileAnchor: false,
  });
  const redeemTx = getDb()
    .prepare(`SELECT amount FROM transactions WHERE type = 'share_capital_redemption' ORDER BY id DESC LIMIT 1`)
    .get();
  assert.strictEqual(redeemTx.amount, -5000);
  assert.strictEqual(getMemberShareCapitalBalance(member.id), 75000 - 5000);

  // 8. Disabled orgs report zero balances, no profile share data effects.
  setShareCapitalEnabled(false);
  assert.strictEqual(getMemberAccountSummary(member.id).shareCapitalBalance, 0);
  assert.strictEqual(getMemberProfile(member.id).share_capital_enabled, false);
  // History rows remain on file even when the feature is off.
  assert.strictEqual(getMemberProfile(member.id).share_capital_transactions.length, 2);
  setShareCapitalEnabled(true);

  console.log("Share capital tests passed.");
});
