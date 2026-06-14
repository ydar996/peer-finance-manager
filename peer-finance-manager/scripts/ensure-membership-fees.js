#!/usr/bin/env node
/**
 * Ensure each member with paid registration has a -$100 membership_fee transaction.
 */
const { getDb, closeDb } = require("../db/database");
const { MEMBERSHIP_FEE, TRANSACTION_TYPES } = require("../lib/constants");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");

const db = getDb();

const members = db
  .prepare(
    `SELECT m.id, m.name, m.joined_at, m.membership_fee_paid
     FROM members m
     WHERE EXISTS (
       SELECT 1 FROM transactions t
       WHERE t.member_id = m.id AND t.type = 'deposit'
     )`
  )
  .all();

const insertFee = db.prepare(
  `INSERT INTO transactions
    (member_id, type, amount, transaction_date, description, source)
   VALUES (?, ?, ?, ?, ?, 'spreadsheet')`
);

let added = 0;

for (const member of members) {
  const existing = db
    .prepare(
      `SELECT id FROM transactions
       WHERE member_id = ? AND type = ?`
    )
    .get(member.id, TRANSACTION_TYPES.MEMBERSHIP_FEE);

  if (existing) continue;
  if (!member.membership_fee_paid) continue;

  const firstDeposit = db
    .prepare(
      `SELECT transaction_date FROM transactions
       WHERE member_id = ? AND type = 'deposit'
       ORDER BY transaction_date, id LIMIT 1`
    )
    .get(member.id);

  const feeDate = firstDeposit?.transaction_date || member.joined_at || "2024-01-01";
  insertFee.run(
    member.id,
    TRANSACTION_TYPES.MEMBERSHIP_FEE,
    -MEMBERSHIP_FEE,
    feeDate,
    `One-time membership fee (${MEMBERSHIP_FEE})`
  );
  added += 1;
  console.log(`Added registration fee for ${member.name}`);
}

console.log(`\nAdded ${added} missing fee transaction(s).`);

const ejiro = db.prepare(`SELECT id FROM members WHERE name = ?`).get("Ejiro Awhotu");
if (ejiro) {
  const balance = getMemberDepositAccountBalance(ejiro.id);
  console.log(`Ejiro Awhotu balance: ${balance.toFixed(2)} (expected 991.00)`);
}

closeDb();
