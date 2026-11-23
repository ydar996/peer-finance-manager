const {
  resolveLedgerMemberName,
  resolveProxyBeneficiaryFromDescription,
  normalizeName,
} = require("./member-name-match");
const { typeLabelForLedger } = require("./transaction-import-types");

const NON_MEMBER_PROXY_PHRASES =
  /^loan\s+payment$|^payment\s+\d+$|^adhesion\b|^monthly\s+pay/i;

function resolveZellePayerFromDescription(description, memberNames) {
  const text = String(description || "");
  const match = text.match(/\bZelle payment from\s+(.+?)\s+for\s+/i);
  if (!match) return null;
  return resolveLedgerMemberName(match[1].trim(), memberNames);
}

function isLikelyMonthlyContributionMisclassifiedAsLoan(tx) {
  if (tx.ledgerType !== "loan_repayment") return false;
  const text = String(tx.description || "");
  if (!/Zelle payment from/i.test(text)) return false;
  if (/\bfor\s+[A-Za-z].+\s+loan\b/i.test(text)) return false;
  if (/for\s+loan\s+payment/i.test(text) && Math.abs(Number(tx.amount)) < 500) {
    return true;
  }
  return false;
}

/**
 * Deposits credited to the Zelle payer when the description names another member
 * as beneficiary ("… from X for Y").
 */
function findProxyDepositMismatches(transactions, memberNames) {
  const issues = [];
  for (const tx of transactions) {
    if (tx.ledgerType !== "deposit") continue;
    const beneficiary = resolveProxyBeneficiaryFromDescription(tx.description, memberNames);
    if (!beneficiary) continue;
    const payer = resolveZellePayerFromDescription(tx.description, memberNames);
    if (!payer || normalizeName(payer) === normalizeName(beneficiary)) continue;
    const assigned = tx.member || null;
    if (!assigned) {
      issues.push({
        kind: "proxy_unassigned",
        date: tx.date,
        amount: tx.amount,
        payer,
        beneficiary,
        assignedMember: null,
        description: tx.description,
        message: `Proxy deposit for ${beneficiary} has no member assigned (payer ${payer}).`,
      });
      continue;
    }
    if (normalizeName(assigned) === normalizeName(payer)) {
      issues.push({
        kind: "proxy_wrong_member",
        date: tx.date,
        amount: tx.amount,
        payer,
        beneficiary,
        assignedMember: assigned,
        description: tx.description,
        message: `Credited to ${assigned} but description says payment for ${beneficiary}.`,
      });
    }
  }
  return issues;
}

function findContributionTypeMismatches(transactions) {
  const issues = [];
  for (const tx of transactions) {
    if (!isLikelyMonthlyContributionMisclassifiedAsLoan(tx)) continue;
    issues.push({
      kind: "contribution_as_loan",
      date: tx.date,
      amount: tx.amount,
      assignedMember: tx.member || null,
      ledgerType: tx.ledgerType,
      description: tx.description,
      message: `Classified as loan repayment but looks like a monthly contribution ($${Number(tx.amount).toFixed(2)}).`,
    });
  }
  return issues;
}

// Generic classification sanity: narration patterns that contradict the
// assigned ledger type. Applies to every Cooperative, both the per-account
// append preview and the full ledger refresh conflict audit.
const INTERNAL_MOVEMENT_PATTERN =
  /own account transfer|transfer between customers|internal transfer|between own accounts|inter[-\s]?account transfer/i;
const INVESTMENT_NARRATION_PATTERN =
  /time deposit|fixed deposit|certificate of deposit|premature settl|matured|maturity|treasur|trustee|money market|mutual fund|asset management|liquidat/i;
// Bank charges narrate the transfer they were levied on ("COMMISSION
// TRZL-TO ... TRUSTEES ..."), so they trip the patterns above while being
// legitimate expenses. Detect them first and require an Expenses type.
const BANK_CHARGE_PATTERN =
  /\b(commission|stamp duty|value added tax|\bvat\b|account maintenance|sms alert|sms charge|ledger fee|management fee|charges?)\b/i;
const MEMBER_MONEY_TYPES = new Set(["deposit", "share_capital", "membership_fee"]);
// membership_fee is a mirrored accounting leg that is intentionally negative;
// expense contra entries (refund credits) are legitimate, so neither is
// sign-checked. These types genuinely cannot carry the opposite sign.
const NEGATIVE_SIGN_TYPES = new Set(["deposit", "share_capital"]);
const DEBIT_ONLY_TYPES = new Set(["withdrawal", "loan_repayment", "loan_disbursement"]);
const INVESTMENT_TYPES = new Set(["investment", "cd_purchase", "cd_liquidation"]);

function pushMismatch(issues, tx, kind, message, suggestedType) {
  issues.push({
    kind,
    date: tx.date,
    amount: tx.amount,
    assignedMember: tx.member || null,
    ledgerType: tx.ledgerType,
    suggestedType: suggestedType || null,
    description: tx.description,
    message,
  });
}

function findClassificationMismatches(transactions) {
  const issues = [];
  for (const tx of transactions) {
    const type = tx.ledgerType;
    if (!type) continue;
    const text = String(tx.description || "");
    const amount = Number(tx.amount);
    const label = typeLabelForLedger(type);

    if (MEMBER_MONEY_TYPES.has(type) && !String(tx.member || "").trim()) {
      pushMismatch(
        issues,
        tx,
        "member_money_unassigned",
        `Classified as ${label} with no member assigned.`
      );
      continue;
    }
    if (BANK_CHARGE_PATTERN.test(text)) {
      if (type !== "expense") {
        pushMismatch(
          issues,
          tx,
          "charge_narration",
          `Classified as ${label} but the description looks like a bank charge or levy.`,
          "expense"
        );
      }
      continue;
    }
    if (INTERNAL_MOVEMENT_PATTERN.test(text) && !INVESTMENT_TYPES.has(type)) {
      pushMismatch(
        issues,
        tx,
        "internal_movement",
        `Classified as ${label} but the description looks like an internal transfer between accounts.`,
        "investment"
      );
      continue;
    }
    if (INVESTMENT_NARRATION_PATTERN.test(text) && !INVESTMENT_TYPES.has(type)) {
      pushMismatch(
        issues,
        tx,
        "investment_narration",
        `Classified as ${label} but the description looks like an investment or time deposit.`,
        "investment"
      );
      continue;
    }
    if (Number.isFinite(amount) && NEGATIVE_SIGN_TYPES.has(type) && amount < 0) {
      pushMismatch(
        issues,
        tx,
        "sign_mismatch",
        `Classified as ${label} but the amount is negative.`
      );
      continue;
    }
    if (Number.isFinite(amount) && DEBIT_ONLY_TYPES.has(type) && amount > 0) {
      pushMismatch(
        issues,
        tx,
        "sign_mismatch",
        `Classified as ${label} but the amount is positive.`
      );
    }
  }
  return issues;
}

function auditLedgerImport(transactions, memberNames) {
  const proxyMismatches = findProxyDepositMismatches(transactions, memberNames);
  const typeMismatches = findContributionTypeMismatches(transactions);
  const classificationMismatches = findClassificationMismatches(transactions);
  const warnings = [...proxyMismatches, ...typeMismatches, ...classificationMismatches];
  return {
    proxyMismatches,
    typeMismatches,
    classificationMismatches,
    warnings,
    hasWarnings: warnings.length > 0,
    warningCount: warnings.length,
  };
}

module.exports = {
  resolveZellePayerFromDescription,
  findProxyDepositMismatches,
  findContributionTypeMismatches,
  findClassificationMismatches,
  auditLedgerImport,
  NON_MEMBER_PROXY_PHRASES,
};
