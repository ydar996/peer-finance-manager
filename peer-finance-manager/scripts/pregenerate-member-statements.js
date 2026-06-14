#!/usr/bin/env node
const { runWithOrg } = require("../lib/org-context");
const { pregenerateMemberDepositStatements } = require("../lib/pregenerate-member-statements");
const { closeDb } = require("../db/database");

runWithOrg("assurance", async () => {
  const result = await pregenerateMemberDepositStatements({ force: false });
  console.log(result);
})
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb("assurance"));
