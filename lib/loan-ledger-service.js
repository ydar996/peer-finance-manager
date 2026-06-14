const { getDb } = require("../db/database");
const {
  getLoanDetailsReference,
  matchLotToReference,
  applyPrincipalCorrection,
  applyWorkbookInterestToLot,
} = require("./loan-details-reference");

function applyPaymentToLot(lot, amount, tx, note) {
  lot.collected += amount;
  lot.repayments.push({
    transactionId: tx?.id ?? null,
    date: tx?.transaction_date ?? lot.disbursementDate,
    amount,
    description: tx?.description || note || "",
  });
}

/**
 * Build separate loan lots per member.
 * Repayments apply to the newest disbursed loan that is still open as of payment date.
 */
function buildLoanLotsFromTransactions(transactions) {
  const lots = [];
  let paymentBuffer = 0;

  for (const tx of transactions) {
    if (tx.type === "loan_disbursement") {
      const lot = {
        loanNumber: lots.length + 1,
        disbursementDate: tx.transaction_date,
        disbursementId: tx.id,
        principal: Math.abs(tx.amount),
        collected: 0,
        repayments: [],
        disbursementDescription: tx.description || "",
        status: "active",
      };
      lots.push(lot);
      if (lots.length > 1) {
        const prior = lots[lots.length - 2];
        const shortfall = prior.principal - prior.collected;
        if (shortfall > 0.005 && shortfall < 500) {
          prior.collected = prior.principal;
        }
      }
      continue;
    }

    if (tx.type !== "loan_repayment") continue;

    let remaining = tx.amount;
    while (remaining > 0.005) {
      const openLot = [...lots]
        .reverse()
        .find(
          (l) =>
            l.disbursementDate <= tx.transaction_date &&
            l.collected < l.principal - 0.005
        );
      if (!openLot) {
        paymentBuffer += remaining;
        break;
      }
      const need = openLot.principal - openLot.collected;
      const applied = Math.min(remaining, need);
      applyPaymentToLot(openLot, applied, tx);
      remaining -= applied;
    }
  }

  return { lots, overpaymentCredit: paymentBuffer };
}

let cachedPortfolioInterestShare = null;

function getPortfolioInterestShare() {
  if (cachedPortfolioInterestShare != null) return cachedPortfolioInterestShare;

  const members = getMembersWithLoanActivity();
  const allLots = members.flatMap((member) => {
    const txs = getMemberLoanTransactions(member.member_id);
    return buildLoanLotsFromTransactions(txs).lots;
  });

  cachedPortfolioInterestShare = portfolioInterestShareFromPaidLots(allLots);
  return cachedPortfolioInterestShare;
}

function clearPortfolioInterestShareCache() {
  cachedPortfolioInterestShare = null;
}

function memberInterestShareFromPaidLots(lots) {
  const paidLots = lots.filter(
    (lot) => lot.collected >= lot.principal - 0.005 && lot.collected > 0.005
  );
  if (!paidLots.length) return null;

  const collected = paidLots.reduce((sum, lot) => sum + lot.collected, 0);
  const interest = paidLots.reduce(
    (sum, lot) => sum + Math.max(0, lot.collected - lot.principal),
    0
  );
  if (collected <= 0.005) return null;
  return interest / collected;
}

function portfolioInterestShareFromPaidLots(allLots) {
  const paidLots = allLots.filter(
    (lot) => lot.collected >= lot.principal - 0.005 && lot.collected > 0.005
  );
  if (!paidLots.length) return 0;

  const collected = paidLots.reduce((sum, lot) => sum + lot.collected, 0);
  const interest = paidLots.reduce(
    (sum, lot) => sum + Math.max(0, lot.collected - lot.principal),
    0
  );
  if (collected <= 0.005) return 0;
  return interest / collected;
}

function assignLoanInterestAndBalances(lots, fallbackShare = 0, memberName = "") {
  const { loans: references } = getLoanDetailsReference();

  for (const lot of lots) {
    const reference = matchLotToReference(lot, memberName, references);

    if (reference) {
      applyWorkbookInterestToLot(lot, reference, memberName);
      continue;
    }

    applyPrincipalCorrection(lot, memberName);

    const memberShare = memberInterestShareFromPaidLots(lots);
    const interestShare = memberShare ?? fallbackShare;
    const isPaid = lot.collected >= lot.principal - 0.005;
    if (isPaid) {
      lot.interestIncome = Math.max(0, lot.collected - lot.principal);
    } else if (lot.collected > 0.005 && interestShare > 0) {
      lot.interestIncome = lot.collected * interestShare;
    } else {
      lot.interestIncome = 0;
    }

    lot.principalRepaid = Math.min(
      lot.principal,
      Math.max(0, lot.collected - lot.interestIncome)
    );
    lot.outstanding = Math.max(0, lot.principal - lot.principalRepaid);
    lot.status = lot.outstanding <= 0.005 ? "paid" : "active";
  }
}

function consolidateRepayments(repayments) {
  const merged = new Map();
  for (const row of repayments || []) {
    const key =
      row.transactionId != null
        ? `tx:${row.transactionId}`
        : `manual:${row.date}|${row.description || ""}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row });
      continue;
    }
    existing.amount = Math.round((existing.amount + row.amount) * 100) / 100;
  }
  return [...merged.values()];
}

function enrichLoanLot(memberId, borrower, lot) {
  return {
    memberId,
    borrower,
    loanNumber: lot.loanNumber,
    disbursementDate: lot.disbursementDate,
    disbursementId: lot.disbursementId,
    principal: lot.principal,
    bankDisbursementAmount: lot.bankDisbursementAmount ?? null,
    principalNote: lot.principalNote ?? null,
    agreedPrincipal: lot.agreedPrincipal ?? null,
    collected: lot.collected,
    principalRepaid: lot.principalRepaid,
    outstanding: lot.outstanding,
    interestIncome: lot.interestIncome || 0,
    scheduledTotalInterest: lot.scheduledTotalInterest ?? null,
    scheduledMonthlyPayment: lot.scheduledMonthlyPayment ?? null,
    scheduledTotalPayable: lot.scheduledTotalPayable ?? null,
    scheduleTitle: lot.scheduleTitle ?? null,
    schedule: lot.schedule ?? null,
    status: lot.status,
    disbursementDescription: lot.disbursementDescription,
    repayments: consolidateRepayments(lot.repayments),
    ledgerKey: `${memberId}-${lot.loanNumber}`,
  };
}

function getMemberLoanTransactions(memberId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, transaction_date, type, amount, description
       FROM transactions
       WHERE member_id = ? AND type IN ('loan_disbursement', 'loan_repayment')
       ORDER BY transaction_date, id`
    )
    .all(memberId);
}

function getMembersWithLoanActivity() {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT m.id AS member_id, m.name, mp.display_name
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       JOIN transactions t ON t.member_id = m.id
       WHERE t.type IN ('loan_disbursement', 'loan_repayment')
       ORDER BY m.name`
    )
    .all();
}

function getMemberLoanLedgerSummary(memberId, { portfolioShare } = {}) {
  const db = getDb();
  const member = db
    .prepare(
      `SELECT m.id, m.name, mp.display_name
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE m.id = ?`
    )
    .get(memberId);
  if (!member) {
    return {
      lots: [],
      outstanding: 0,
      overpaymentCredit: 0,
      activeLoanCount: 0,
      paidLoanCount: 0,
    };
  }

  const txs = getMemberLoanTransactions(memberId);
  if (!txs.length) {
    return {
      lots: [],
      outstanding: 0,
      overpaymentCredit: 0,
      activeLoanCount: 0,
      paidLoanCount: 0,
    };
  }

  const borrower = member.display_name || member.name;
  const { lots, overpaymentCredit } = buildLoanLotsFromTransactions(txs);
  assignLoanInterestAndBalances(
    lots,
    portfolioShare != null ? portfolioShare : getPortfolioInterestShare(),
    borrower
  );
  const enriched = lots.map((lot) => enrichLoanLot(memberId, borrower, lot));
  return {
    lots: enriched,
    outstanding: enriched.reduce((sum, lot) => sum + lot.outstanding, 0),
    overpaymentCredit,
    activeLoanCount: enriched.filter((lot) => lot.status === "active").length,
    paidLoanCount: enriched.filter((lot) => lot.status === "paid").length,
    interestIncome: enriched.reduce((sum, lot) => sum + lot.interestIncome, 0),
  };
}

function getMemberLoanLots(memberId) {
  return getMemberLoanLedgerSummary(memberId).lots;
}

function getAllBankLoanLots({ status } = {}) {
  const members = getMembersWithLoanActivity();
  const lotsByMember = members.map((member) => {
    const txs = getMemberLoanTransactions(member.member_id);
    const { lots, overpaymentCredit } = buildLoanLotsFromTransactions(txs);
    return { member, lots, overpaymentCredit };
  });

  const allLotsFlat = lotsByMember.flatMap((entry) => entry.lots);
  const fallbackShare = portfolioInterestShareFromPaidLots(allLotsFlat);
  cachedPortfolioInterestShare = fallbackShare;

  for (const entry of lotsByMember) {
    const borrower = entry.member.display_name || entry.member.name;
    assignLoanInterestAndBalances(entry.lots, fallbackShare, borrower);
  }

  let lots = [];
  for (const entry of lotsByMember) {
    const borrower = entry.member.display_name || entry.member.name;
    lots = lots.concat(
      entry.lots.map((lot) =>
        enrichLoanLot(entry.member.member_id, borrower, lot)
      )
    );
  }

  if (status === "active") {
    lots = lots.filter((l) => l.status === "active");
  } else if (status === "paid") {
    lots = lots.filter((l) => l.status === "paid");
  }
  return lots.sort((a, b) => {
    const byBorrower = a.borrower.localeCompare(b.borrower);
    if (byBorrower !== 0) return byBorrower;
    return a.loanNumber - b.loanNumber;
  });
}

function getLoanPortfolioFromBankLedger() {
  const lots = getAllBankLoanLots();
  return lots.map((lot) => ({
    loanKey: lot.ledgerKey,
    borrowerId: lot.memberId,
    borrower: lot.borrower,
    loanNumber: lot.loanNumber,
    disbursementDate: lot.disbursementDate,
    disbursed: lot.principal,
    collected: lot.collected,
    interestIncome: lot.interestIncome,
    scheduledTotalInterest: lot.scheduledTotalInterest ?? null,
    outstanding: lot.outstanding,
    status: lot.status,
    repayments: lot.repayments,
    disbursementDescription: lot.disbursementDescription,
  }));
}

function getTotalLoanInterestIncome() {
  return getAllBankLoanLots().reduce((sum, lot) => sum + (lot.interestIncome || 0), 0);
}

function getExpectedFutureLoanInterest() {
  return getAllBankLoanLots()
    .filter((lot) => lot.status === "active")
    .reduce((sum, lot) => {
      const scheduled = lot.scheduledTotalInterest;
      if (scheduled == null || scheduled <= 0) return sum;
      const earned = lot.interestIncome || 0;
      return sum + Math.max(0, scheduled - earned);
    }, 0);
}

function getBankLoanLot(memberId, loanNumber) {
  const summary = getMemberLoanLedgerSummary(Number(memberId), {
    portfolioShare: getPortfolioInterestShare(),
  });
  return (
    summary.lots.find((l) => l.loanNumber === Number(loanNumber)) || null
  );
}

function getMemberBankLoanOutstanding(memberId) {
  const lots = getAllBankLoanLots();
  return lots
    .filter((lot) => lot.memberId === Number(memberId))
    .reduce((sum, lot) => sum + lot.outstanding, 0);
}

function hasBankLoanLedger() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(1) AS c FROM transactions
       WHERE type IN ('loan_disbursement', 'loan_repayment')`
    )
    .get();
  return row.c > 0;
}

module.exports = {
  buildLoanLotsFromTransactions,
  assignLoanInterestAndBalances,
  getMemberLoanLedgerSummary,
  getMemberLoanLots,
  getAllBankLoanLots,
  getLoanPortfolioFromBankLedger,
  getBankLoanLot,
  getMemberBankLoanOutstanding,
  getTotalLoanInterestIncome,
  getExpectedFutureLoanInterest,
  hasBankLoanLedger,
};
