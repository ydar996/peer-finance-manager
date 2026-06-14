const path = require("path");
const Database = require("better-sqlite3");

function check(label, dbPath) {
  if (!require("fs").existsSync(dbPath)) {
    console.log(label, "MISSING");
    return;
  }
  const db = new Database(dbPath, { readonly: true });
  const bank = db.prepare(`SELECT COUNT(1) c FROM transactions WHERE source='bank_import'`).get().c;
  const loans = db.prepare(`SELECT COUNT(1) c FROM transactions WHERE type='loan_disbursement'`).get().c;
  const inv = db.prepare(`SELECT COUNT(1) c FROM transactions WHERE type='investment'`).get().c;
  const cd = db.prepare(`SELECT COUNT(1) c FROM transactions WHERE type='cd_purchase'`).get().c;
  const setting = db.prepare(`SELECT value FROM cooperative_settings WHERE key='cd_balance'`).get();
  console.log(label, { bank, loans, inv, cd, cdBalance: setting?.value });
  db.close();
}

check("pfm", path.join(__dirname, "..", "data", "peerfinance.db"));
check("root", path.join(__dirname, "..", "..", "data", "peerfinance.db"));
