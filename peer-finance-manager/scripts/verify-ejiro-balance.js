const { getDb } = require("../db/database");
const { getMemberDepositAccountBalance } = require("../lib/balance-service");
const { closeDb } = require("../db/database");

const EXPECTED = 991;
const TOLERANCE = 0.01;

const db = getDb();
const member = db.prepare(`SELECT id, name FROM members WHERE name = ?`).get("Ejiro Awhotu");
if (!member) {
  console.error("Ejiro Awhotu not found in ledger");
  process.exit(1);
}

const balance = getMemberDepositAccountBalance(member.id);
const ok = Math.abs(balance - EXPECTED) <= TOLERANCE;

console.log(`Ejiro Awhotu deposit balance: ${balance.toFixed(2)} (expected ${EXPECTED.toFixed(2)})`);
if (!ok) {
  console.error("FAIL — withdrawal closing-balance rule not applied");
  process.exit(1);
}
console.log("OK");
closeDb();
