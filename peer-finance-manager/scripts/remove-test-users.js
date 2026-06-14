const Database = require("better-sqlite3");
const path = require("path");

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      path.join(__dirname, "..", "..", "data", "peerfinance.db"),
      path.join(__dirname, "..", "dist", "data", "peerfinance.db"),
    ];

for (const dbPath of targets) {
  let db;
  try {
    db = new Database(dbPath);
  } catch (err) {
    console.log(`${dbPath}: unavailable (${err.message})`);
    continue;
  }

  let ids = [];
  try {
    ids = db
      .prepare("SELECT id FROM users WHERE email LIKE '%.test@eworkchop.com'")
      .all()
      .map((r) => r.id);
  } catch (err) {
    if (String(err.message).includes("no such table")) {
      console.log(`${dbPath}: auth tables not present yet`);
      db.close();
      continue;
    }
    throw err;
  }

  if (!ids.length) {
    console.log(`${dbPath}: no test users`);
  } else {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM sessions WHERE user_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids);
    console.log(`${dbPath}: removed ${ids.length} test user(s)`);
  }

  db.close();
}
