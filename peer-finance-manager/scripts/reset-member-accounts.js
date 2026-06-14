#!/usr/bin/env node
const { getDb, closeDb } = require("../db/database");
const { provisionAllMemberAccounts } = require("../lib/auth-service");

const db = getDb();
db.prepare(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'member')`).run();
db.prepare(`DELETE FROM users WHERE role = 'member'`).run();
const result = provisionAllMemberAccounts();
console.log(`Created: ${result.created.length}`);
console.log(`Export: ${result.exportPath}`);
closeDb();
