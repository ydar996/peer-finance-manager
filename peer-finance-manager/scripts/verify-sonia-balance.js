const { getDb, closeDb } = require("../db/database");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");

const db = getDb();
const member = db.prepare(`SELECT id, name FROM members WHERE name = ?`).get("Sonia Udom");
if (!member) {
  console.error("Sonia Udom not found");
  process.exit(1);
}

const balance = getMemberDepositAccountBalance(member.id);
const ok = Math.abs(balance) <= 0.01;

console.log(`Sonia Udom deposit balance: ${balance.toFixed(2)} (expected 0.00)`);
if (!ok) process.exit(1);
console.log("OK");
closeDb();
