const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MEMBERSHIP_FEE = 100;
const INITIAL_MEMBERSHIP_CONTRIBUTION = 100;
const LATE_FEE_AMOUNT = 25;
const LATE_FEE_DAY_OF_MONTH = 22;
const DEFAULT_LOAN_ANNUAL_RATE = 0.08;
const DEFAULT_LOAN_TERM_MONTHS = 12;
const MIN_MEMBERSHIP_MONTHS_FOR_LOAN = 6;
const REQUIRED_GUARANTORS = 2;

const EXPENSE_CATEGORIES = [
  "Bank Fees",
  "Administrative",
  "Technology",
  "Meeting/Event",
  "Professional Services",
  "Insurance",
  "Wages and Salaries",
  "Other",
];

const TRANSACTION_TYPES = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  MEMBERSHIP_FEE: "membership_fee",
  DISTRIBUTION: "distribution",
  LOAN_DISBURSEMENT: "loan_disbursement",
  LOAN_REPAYMENT: "loan_repayment",
  LOAN_OVERPAYMENT: "loan_overpayment",
  LATE_FEE: "late_fee",
  EXPENSE: "expense",
  ADMIN_FEE: "admin_fee",
  CD_PURCHASE: "cd_purchase",
  CD_LIQUIDATION: "cd_liquidation",
  INVESTMENT: "investment",
  SHARE_CAPITAL: "share_capital",
  SHARE_CAPITAL_REDEMPTION: "share_capital_redemption",
};

/**
 * Investment credits whose narration contains any of these words always
 * count as realized deposit-instrument interest income. Administrators
 * can extend the list via the Interest Income Keywords report setting.
 */
const DEFAULT_INTEREST_INCOME_KEYWORDS = ["INTEREST", "CAPITALIS"];

module.exports = {
  MONTH_NAMES,
  DEFAULT_INTEREST_INCOME_KEYWORDS,
  MEMBERSHIP_FEE,
  INITIAL_MEMBERSHIP_CONTRIBUTION,
  LATE_FEE_AMOUNT,
  LATE_FEE_DAY_OF_MONTH,
  DEFAULT_LOAN_ANNUAL_RATE,
  DEFAULT_LOAN_TERM_MONTHS,
  MIN_MEMBERSHIP_MONTHS_FOR_LOAN,
  REQUIRED_GUARANTORS,
  EXPENSE_CATEGORIES,
  TRANSACTION_TYPES,
};
