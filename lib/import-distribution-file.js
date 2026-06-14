const path = require("path");
const { getDb } = require("../db/database");
const { getCoopRoot } = require("./paths");
const { addTransaction } = require("./balance-service");
const { TRANSACTION_TYPES } = require("./constants");
const { resolveLedgerMemberName } = require("./member-name-match");
const { recordMemberDepositEntry } = require("./manual-entry-service");

function loadParseDistributionFile() {
  return require(path.join(getCoopRoot(), "lib", "statement-generator"))
    .parseDistributionFile;
}

function parsePeriodFromDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { periodYear: null, periodMonth: null };
  return { periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 };
}

function recordMemberDistribution({
  memberId,
  amount,
  transactionDate,
  label,
  reference,
}) {
  const description = String(label || "").trim();
  if (!description) throw new Error("Distribution label is required");
  return recordMemberDepositEntry({
    memberId,
    type: TRANSACTION_TYPES.DISTRIBUTION,
    amount,
    transactionDate,
    description,
    reference,
  });
}

function importDistributionFromFile({ filePath, creditedDate, label }) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) throw new Error("Distribution label is required");
  if (!creditedDate) throw new Error("Credited date is required");
  if (!filePath) throw new Error("Distribution file is required");

  const parseDistributionFile = loadParseDistributionFile();
  const amounts = parseDistributionFile(filePath);
  const entries = Object.entries(amounts).filter(([, amount]) => Number(amount) > 0);
  if (!entries.length) {
    throw new Error(
      "No distribution amounts found. Expected columns: Member Name and Amount/Distribution/Interest."
    );
  }

  const db = getDb();
  const members = db.prepare(`SELECT id, name FROM members`).all();
  const ledgerNames = members.map((m) => m.name);
  const nameToId = Object.fromEntries(members.map((m) => [m.name, m.id]));
  const { periodYear, periodMonth } = parsePeriodFromDate(creditedDate);

  const run = db.transaction(() => {
    const batch = db
      .prepare(
        `INSERT INTO distributions (label, period_year, period_month, credited_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(cleanLabel, periodYear, periodMonth, creditedDate);

    let credited = 0;
    const unmatched = [];
    const creditedMembers = [];

    for (const [sheetName, rawAmount] of entries) {
      const ledgerName = resolveLedgerMemberName(sheetName, ledgerNames);
      if (!ledgerName) {
        unmatched.push(sheetName);
        continue;
      }
      const memberId = nameToId[ledgerName];
      const amount = Number(rawAmount);
      addTransaction({
        memberId,
        type: TRANSACTION_TYPES.DISTRIBUTION,
        amount,
        transactionDate: creditedDate,
        periodYear,
        periodMonth,
        description: cleanLabel,
        reference: `distribution-import:${batch.lastInsertRowid}:${ledgerName}`,
        source: "manual",
      });
      credited += 1;
      creditedMembers.push({ member: ledgerName, amount });
    }

    if (!credited) {
      throw new Error(
        `No members matched the ledger. Unmatched names: ${unmatched.join(", ")}`
      );
    }

    return {
      distributionBatchId: batch.lastInsertRowid,
      credited,
      unmatched,
      members: creditedMembers,
    };
  });

  return run();
}

function listRecentDistributions(limit = 50) {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.transaction_date, t.amount, t.description,
              m.name AS member_name, mp.display_name
       FROM transactions t
       JOIN members m ON m.id = t.member_id
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE t.type = ?
       ORDER BY t.transaction_date DESC, t.id DESC
       LIMIT ?`
    )
    .all(TRANSACTION_TYPES.DISTRIBUTION, limit);
}

module.exports = {
  recordMemberDistribution,
  importDistributionFromFile,
  listRecentDistributions,
};
