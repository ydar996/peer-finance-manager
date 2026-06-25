/**
 * Stable short public loan IDs for reports (no borrower identity).
 * Assigned by disbursement date, then member id, then per-member loan number.
 */

function loanLedgerKey(borrowerId, loanNumber) {
  return `${borrowerId}-${loanNumber}`;
}

function buildLoanPublicIdMap(loans) {
  const sorted = [...loans].sort((a, b) => {
    const dateA = a.disbursementDate || "";
    const dateB = b.disbursementDate || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const memberA = Number(a.borrowerId) || 0;
    const memberB = Number(b.borrowerId) || 0;
    if (memberA !== memberB) return memberA - memberB;
    return (a.loanNumber || 0) - (b.loanNumber || 0);
  });

  const map = new Map();
  sorted.forEach((loan, index) => {
    const key = loanLedgerKey(loan.borrowerId, loan.loanNumber);
    map.set(key, `L${String(index + 1).padStart(2, "0")}`);
  });
  return map;
}

function getLoanPublicId(map, borrowerId, loanNumber) {
  return map.get(loanLedgerKey(borrowerId, loanNumber)) || `L${String(loanNumber).padStart(2, "0")}`;
}

module.exports = {
  loanLedgerKey,
  buildLoanPublicIdMap,
  getLoanPublicId,
};
