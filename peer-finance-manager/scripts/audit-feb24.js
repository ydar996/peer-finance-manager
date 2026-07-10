const path = require("path");
const coopRoot = path.resolve(__dirname, "../..");
process.chdir(coopRoot);
require("../lib/paths").initPaths(coopRoot);
const { runWithOrg } = require("../lib/org-context");
const { getDb } = require("../db/database");

runWithOrg("assurance", () => {
  const db = getDb();
  for (const name of ["embassey", "gbanju"]) {
    const members = db
      .prepare(`SELECT id, name FROM members WHERE lower(name) LIKE ?`)
      .all(`%${name}%`);
    for (const m of members) {
      const feb24 = db
        .prepare(
          `SELECT transaction_date, type, amount, description FROM transactions
           WHERE member_id = ? AND transaction_date = '2026-02-24'`
        )
        .all(m.id);
      console.log(m.name, "2026-02-24:", feb24);
    }
  }
});
