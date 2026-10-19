#!/usr/bin/env node
/**
 * New-member bank attach: unique Zelle name, first-deposit fee, skipped preview.
 * Run: npm run test:member-bank-attach
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-member-bank-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const { createMember } = require("../lib/member-service");
const { TRANSACTION_TYPES, MEMBERSHIP_FEE } = require("../lib/constants");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const {
  previewBankStatementAppend,
  applyBankStatementAppend,
} = require("../lib/bank-import-append");
const { ensureDefaultBankAccount } = require("../lib/bank-account-service");

const ORG = "member-bank-attach-coop";

function writeStatement(filePath, { beginning, ending, rows }) {
  const lines = [
    "Account,",
    `Beginning balance,${beginning}`,
    `Ending balance,${ending}`,
    "",
    "Date,Description,Amount",
    ...rows.map((row) => `${row.date},"${row.description}",${row.amount}`),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function run() {
  await runWithOrg(ORG, async () => {
    openOrgDatabase(ORG);
    const db = getDb();
    ensureDefaultBankAccount();
    const created = createMember({
      firstName: "Olayemi",
      lastName: "Daramola",
      recordMembershipFee: false,
      cooperativeAccountStatus: "active",
    });
    assert.ok(created.memberId);

    const stmtPath = path.join(tmpRoot, "stmt.csv");
    writeStatement(stmtPath, {
      beginning: 0,
      ending: 150,
      rows: [
        {
          date: "2026-10-05",
          description:
            "Zelle payment from OLAYEMI IDOWU for Membership fee and first contribution; Conf",
          amount: 150,
        },
      ],
    });

    const preview = previewBankStatementAppend({
      filePath: stmtPath,
      originalName: "stmt.csv",
    });
    const olayemiRow = preview.rows.find((row) => /OLAYEMI IDOWU/i.test(row.description));
    assert.ok(olayemiRow, "Zelle row is in the preview");
    assert.equal(olayemiRow.bucket, "ready");
    assert.equal(olayemiRow.member, "Olayemi Daramola");
    assert.equal(olayemiRow.ledgerType, "deposit");

    const applied = applyBankStatementAppend({
      filePath: stmtPath,
      originalName: "stmt.csv",
    });
    assert.ok(applied.inserted >= 1);
    const feeTx = db
      .prepare(`SELECT amount FROM transactions WHERE member_id = ? AND type = ?`)
      .get(created.memberId, TRANSACTION_TYPES.MEMBERSHIP_FEE);
    assert.ok(feeTx, "Bank import deducts the membership fee from the first deposit");
    assert.equal(Number(feeTx.amount), -MEMBERSHIP_FEE);
    assert.equal(getMemberDepositAccountBalance(created.memberId), 50);

    const replay = previewBankStatementAppend({
      filePath: stmtPath,
      originalName: "stmt.csv",
    });
    const skipped = replay.rows.find((row) => /OLAYEMI IDOWU/i.test(row.description));
    assert.equal(skipped.bucket, "skipped");
    assert.equal(skipped.member, "Olayemi Daramola");
    assert.equal((skipped.issues || []).length, 0, "Skipped duplicates do not ask for a member");

    console.log("member bank attach tests: ok");
  });
}

run()
  .then(() => {
    closeDb();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    closeDb();
    process.exit(1);
  });
