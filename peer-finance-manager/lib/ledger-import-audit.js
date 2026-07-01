const {
  resolveLedgerMemberName,
  resolveProxyBeneficiaryFromDescription,
  normalizeName,
} = require("./member-name-match");

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

function auditLedgerImport(transactions, memberNames) {
  const proxyMismatches = findProxyDepositMismatches(transactions, memberNames);
  const typeMismatches = findContributionTypeMismatches(transactions);
  const warnings = [...proxyMismatches, ...typeMismatches];
  return {
    proxyMismatches,
    typeMismatches,
    warnings,
    hasWarnings: warnings.length > 0,
    warningCount: warnings.length,
  };
}

module.exports = {
  resolveZellePayerFromDescription,
  findProxyDepositMismatches,
  findContributionTypeMismatches,
  auditLedgerImport,
  NON_MEMBER_PROXY_PHRASES,
};
