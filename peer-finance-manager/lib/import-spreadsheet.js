const XLSX = require("xlsx");
const { getDb } = require("../db/database");
const { ensureMemberNumber } = require("./member-number-service");
const { MONTH_NAMES, TRANSACTION_TYPES, MEMBERSHIP_FEE } = require("./constants");
const { lastDayOfMonth, monthIndexFromName } = require("./dates");

function parseMonthColumns(yearRow, headerRow) {
  return headerRow
    .map((month, index) => {
      const year = Number(yearRow[index]);
      if (!year || typeof month !== "string" || month === "Month") return null;
      if (!MONTH_NAMES.includes(month)) return null;
      return { year, month, monthIndex: MONTH_NAMES.indexOf(month), index };
    })
    .filter(Boolean);
}

function findDistributionColumn(headerRow, yearRow) {
  return headerRow
    .map((h, index) => {
      const s = String(h || "").trim();
      if (!/distribution/i.test(s)) return null;
      const year = Number(yearRow[index]);
      const match = s.match(
        /Distribution\s*-\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i
      );
      if (!match) return null;
      const monthIndex = monthIndexFromName(match[1]);
      return {
        index,
        label: s,
        year: year || null,
        monthIndex,
      };
    })
    .find(Boolean);
}

function parseSpreadsheet(workbookPath, sheetName) {
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const yearRow = rows[0] || [];
  const headerRow = rows[1] || [];
  if (headerRow[0] !== "Member Name") {
    throw new Error("Unable to locate member header row");
  }

  const monthColumns = parseMonthColumns(yearRow, headerRow);
  const distributionCol = findDistributionColumn(headerRow, yearRow);
  const regIndex = headerRow.indexOf("Registration Income");

  const memberRows = rows.slice(2).filter((row) => {
    if (!row || !row[0] || typeof row[0] !== "string") return false;
    return row[0].toLowerCase() !== "total";
  });

  const members = memberRows.map((row) => {
    const deposits = [];
    for (const col of monthColumns) {
      const raw = Number(row[col.index]) || 0;
      if (raw === 0) continue;
      deposits.push({
        year: col.year,
        month: col.month,
        monthIndex: col.monthIndex,
        amount: raw,
      });
    }
    deposits.sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);

    let distribution = null;
    if (distributionCol) {
      const amount = Number(row[distributionCol.index]) || 0;
      if (amount > 0) {
        distribution = {
          amount,
          label: distributionCol.label,
          year: distributionCol.year,
          monthIndex: distributionCol.monthIndex,
        };
      }
    }

    const registration = Number(row[regIndex]) || 0;

    return {
      name: String(row[0]).trim(),
      registration,
      deposits,
      distribution,
    };
  });

  return { members, monthColumns, distributionCol, sheetName };
}

function importFromSpreadsheet(workbookPath, sheetName, options = {}) {
  const { replaceExisting = false } = options;
  const db = getDb();
  const parsed = parseSpreadsheet(workbookPath, sheetName);

  const importMembers = db.transaction(() => {
    if (replaceExisting) {
      db.exec("DELETE FROM transactions");
      db.exec("DELETE FROM distributions");
      db.exec("DELETE FROM loan_installments");
      db.exec("DELETE FROM loans");
      db.exec("DELETE FROM members");
    }

    const insertMember = db.prepare(
      `INSERT OR IGNORE INTO members (name) VALUES (?)`
    );
    const getMember = db.prepare(`SELECT * FROM members WHERE name = ?`);
    const updateMember = db.prepare(
      `UPDATE members SET joined_at = ?, membership_fee_paid = ? WHERE id = ?`
    );
    const insertTx = db.prepare(
      `INSERT INTO transactions
        (member_id, type, amount, transaction_date, period_year, period_month, description, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'spreadsheet')`
    );
    const hasTx = db.prepare(
      `SELECT id FROM transactions
       WHERE member_id = ? AND type = ? AND period_year = ? AND period_month = ? AND source = 'spreadsheet'`
    );
    const insertDist = db.prepare(
      `INSERT INTO distributions (label, period_year, period_month, credited_at)
       VALUES (?, ?, ?, ?)`
    );

    let txCount = 0;
    let distBatchId = null;

    if (parsed.distributionCol && replaceExisting) {
      const d = parsed.distributionCol;
      const creditedAt = lastDayOfMonth(d.year || new Date().getFullYear(), d.monthIndex);
      const label = parsed.distributionCol.label.replace(/^\*+\s*/, "").trim();
      const result = insertDist.run(label, d.year, d.monthIndex + 1, creditedAt);
      distBatchId = result.lastInsertRowid;
    }

    for (const m of parsed.members) {
      insertMember.run(m.name);
      const member = getMember.get(m.name);
      ensureMemberNumber(db, member.id);

      let firstDepositDate = member.joined_at;
      for (const dep of m.deposits) {
        const txDate = lastDayOfMonth(dep.year, dep.monthIndex);
        if (!firstDepositDate || txDate < firstDepositDate) firstDepositDate = txDate;

        const type =
          dep.amount > 0
            ? TRANSACTION_TYPES.DEPOSIT
            : TRANSACTION_TYPES.WITHDRAWAL;
        const existing = hasTx.get(
          member.id,
          type,
          dep.year,
          dep.monthIndex + 1
        );
        if (!existing) {
          insertTx.run(
            member.id,
            type,
            dep.amount,
            txDate,
            dep.year,
            dep.monthIndex + 1,
            `${dep.month} ${dep.year} ${dep.amount > 0 ? "deposit" : "withdrawal"}`
          );
          txCount++;
        }
      }

      const feePaid = m.registration !== 0 ? 1 : 0;
      if (m.registration !== 0) {
        const feeExisting = db
          .prepare(
            `SELECT id FROM transactions WHERE member_id = ? AND type = ?`
          )
          .get(member.id, TRANSACTION_TYPES.MEMBERSHIP_FEE);
        if (!feeExisting) {
          const feeDate = firstDepositDate || lastDayOfMonth(2023, 0);
          insertTx.run(
            member.id,
            TRANSACTION_TYPES.MEMBERSHIP_FEE,
            m.registration,
            feeDate,
            null,
            null,
            `One-time membership fee (${MEMBERSHIP_FEE})`
          );
          txCount++;
        }
      }

      if (m.distribution && m.distribution.amount > 0) {
        const d = m.distribution;
        const distYear = d.year || 2026;
        const distDate = lastDayOfMonth(distYear, d.monthIndex);
        const distExisting = hasTx.get(
          member.id,
          TRANSACTION_TYPES.DISTRIBUTION,
          d.year,
          d.monthIndex + 1
        );
        if (!distExisting) {
          insertTx.run(
            member.id,
            TRANSACTION_TYPES.DISTRIBUTION,
            d.amount,
            distDate,
            d.year,
            d.monthIndex + 1,
            d.label.replace(/^\*+\s*/, "").trim()
          );
          txCount++;
        }
      }

      updateMember.run(firstDepositDate, feePaid, member.id);
    }

    return { memberCount: parsed.members.length, transactionCount: txCount };
  });

  return importMembers();
}

module.exports = { parseSpreadsheet, importFromSpreadsheet };
