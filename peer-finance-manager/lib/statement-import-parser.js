const { getBankAccount } = require("./bank-account-service");
const { parseStatementFileWithFormat } = require("./import-format-service");
const { resolveLedgerMemberName } = require("./member-name-match");
const { memberRequiredForType, isAppendSupportedType } = require("./transaction-import-types");

function parseUploadedStatement({
  filePath,
  originalName,
  memberNames,
  bankAccountId,
} = {}) {
  if (!filePath) {
    throw new Error("Upload a statement or import template file.");
  }

  const account = bankAccountId ? getBankAccount(bankAccountId) : null;
  const statementFormat = account?.statementFormat || "auto";
  const columnMapping = account?.columnMapping || {};

  const parsed = parseStatementFileWithFormat({
    filePath,
    originalName,
    memberNames,
    statementFormat,
    columnMapping,
  });

  return {
    rows: parsed.rows,
    statementSummary: parsed.summary,
    resolvedFormat: parsed.resolvedFormat,
  };
}

function validateParsedRow(row, memberNames) {
  const issues = [];
  if (!row.date) issues.push("Date is missing or invalid.");
  if (!row.description) issues.push("Description is required.");
  if (row.amount == null || !Number.isFinite(Number(row.amount))) {
    issues.push("Amount is missing or invalid.");
  }
  if (row.typeSource === "missing" || (row.format === "template" && row.typeSource !== "explicit")) {
    issues.push("Type is required on every template row.");
  }
  if (!row.ledgerType || !isAppendSupportedType(row.ledgerType)) {
    issues.push("Type could not be resolved. Set Type explicitly.");
  }
  if (row.ledgerType && memberRequiredForType(row.ledgerType)) {
    const member = row.member
      ? resolveLedgerMemberName(row.member, memberNames) || row.member
      : null;
    if (!member) {
      issues.push("Member is required for this transaction type.");
    } else {
      row.member = member;
    }
  }
  return issues;
}

module.exports = {
  parseUploadedStatement,
  validateParsedRow,
};
