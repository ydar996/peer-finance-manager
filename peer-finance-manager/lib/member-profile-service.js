const { getDb } = require("../db/database");
const { getMemberAccountSummary } = require("./cooperative-books");
const { attachDepositRunningBalances } = require("./balance-service");
const { getMemberLoanLots, hasBankLoanLedger } = require("./loan-ledger-service");
const { TRANSACTION_TYPES } = require("./constants");

function listMembersWithProfiles() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.id, m.name, m.joined_at, m.membership_fee_paid,
              mp.id AS profile_id,
              mp.display_name, mp.date_of_birth, mp.email, mp.phone, mp.photo_path,
              mp.preferred_payment_method, mp.zelle_bank_name,
              mp.cooperative_account_status, mp.city, mp.state
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       ORDER BY m.name`
    )
    .all();

  return rows.map((m) => {
    const accounts = getMemberAccountSummary(m.id);
    const txCount = db
      .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE member_id = ?`)
      .get(m.id).c;
    return {
      ...m,
      deposit_balance: accounts.depositAccountBalance,
      loan_balance: accounts.loanAccountBalance,
      active_loans: accounts.activeLoans,
      balance: accounts.depositAccountBalance,
      transaction_count: txCount,
    };
  });
}

function getMemberProfile(memberId) {
  const db = getDb();
  const profile = db
    .prepare(
      `SELECT mp.*, m.name AS ledger_account_name,
              m.joined_at, m.membership_fee_paid
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE m.id = ?`
    )
    .get(memberId);

  if (!profile) return null;

  const accounts = getMemberAccountSummary(memberId);
  const depositTransactions = attachDepositRunningBalances(
    memberId,
    db
      .prepare(
        `SELECT * FROM transactions
         WHERE member_id = ? AND type IN ('deposit','withdrawal','distribution','membership_fee')
         ORDER BY transaction_date DESC, id DESC`
      )
      .all(memberId)
  );
  const loanTransactions = db
    .prepare(
      `SELECT * FROM transactions
       WHERE member_id = ? AND type IN ('loan_repayment','loan_disbursement','loan_overpayment','late_fee')
       ORDER BY transaction_date DESC, id DESC`
    )
    .all(memberId);

  const loanLots = accounts.loanLots?.length
    ? accounts.loanLots
    : hasBankLoanLedger()
      ? getMemberLoanLots(memberId)
      : [];

  return {
    ...profile,
    member_id: memberId,
    deposit_account_balance: accounts.depositAccountBalance,
    loan_account_balance: accounts.loanAccountBalance,
    loan_overpayment_credit: accounts.loanOverpaymentCredit || 0,
    active_loans: accounts.activeLoans,
    paid_loans: accounts.paidLoans || 0,
    loans: accounts.loans,
    loan_lots: loanLots,
    deposit_transactions: depositTransactions,
    loan_transactions: loanTransactions,
    account_balance: accounts.depositAccountBalance,
  };
}

module.exports = {
  listMembersWithProfiles,
  getMemberProfile,
};
