const { TRANSACTION_TYPES } = require("./constants");

const TYPE_LABEL_TO_LEDGER = {
  "member deposit": TRANSACTION_TYPES.DEPOSIT,
  contribution: TRANSACTION_TYPES.DEPOSIT,
  deposit: TRANSACTION_TYPES.DEPOSIT,
  "member withdrawal": TRANSACTION_TYPES.WITHDRAWAL,
  withdrawal: TRANSACTION_TYPES.WITHDRAWAL,
  "loan repayment": TRANSACTION_TYPES.LOAN_REPAYMENT,
  "loan disbursement": TRANSACTION_TYPES.LOAN_DISBURSEMENT,
  distribution: TRANSACTION_TYPES.DISTRIBUTION,
  "interest income": TRANSACTION_TYPES.DISTRIBUTION,
  expenses: TRANSACTION_TYPES.EXPENSE,
  expense: TRANSACTION_TYPES.EXPENSE,
  "purchase of certificate of deposit": TRANSACTION_TYPES.CD_PURCHASE,
  "cd purchase": TRANSACTION_TYPES.CD_PURCHASE,
  "liquidation of certificate of deposit": TRANSACTION_TYPES.CD_LIQUIDATION,
  "cd liquidation": TRANSACTION_TYPES.CD_LIQUIDATION,
  investment: TRANSACTION_TYPES.INVESTMENT,
  "membership fee": TRANSACTION_TYPES.MEMBERSHIP_FEE,
};

const LEDGER_TO_TYPE_LABEL = {
  [TRANSACTION_TYPES.DEPOSIT]: "Member Deposit",
  [TRANSACTION_TYPES.WITHDRAWAL]: "Member Withdrawal",
  [TRANSACTION_TYPES.LOAN_REPAYMENT]: "Loan Repayment",
  [TRANSACTION_TYPES.LOAN_DISBURSEMENT]: "Loan Disbursement",
  [TRANSACTION_TYPES.DISTRIBUTION]: "Distribution",
  [TRANSACTION_TYPES.EXPENSE]: "Expenses",
  [TRANSACTION_TYPES.CD_PURCHASE]: "Purchase of Certificate of Deposit",
  [TRANSACTION_TYPES.CD_LIQUIDATION]: "Liquidation of Certificate of Deposit",
  [TRANSACTION_TYPES.INVESTMENT]: "Investment",
  [TRANSACTION_TYPES.MEMBERSHIP_FEE]: "Membership Fee",
};

const MEMBER_REQUIRED_TYPES = new Set([
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.LOAN_REPAYMENT,
  TRANSACTION_TYPES.LOAN_DISBURSEMENT,
  TRANSACTION_TYPES.DISTRIBUTION,
]);

const APPEND_SUPPORTED_TYPES = new Set([
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.LOAN_REPAYMENT,
  TRANSACTION_TYPES.LOAN_DISBURSEMENT,
  TRANSACTION_TYPES.DISTRIBUTION,
  TRANSACTION_TYPES.EXPENSE,
  TRANSACTION_TYPES.CD_PURCHASE,
  TRANSACTION_TYPES.CD_LIQUIDATION,
  TRANSACTION_TYPES.INVESTMENT,
]);

function normalizeTypeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseTypeLabel(label) {
  const key = normalizeTypeLabel(label);
  if (!key) return null;
  return TYPE_LABEL_TO_LEDGER[key] || null;
}

function typeLabelForLedger(ledgerType) {
  return LEDGER_TO_TYPE_LABEL[ledgerType] || ledgerType;
}

function memberRequiredForType(ledgerType) {
  return MEMBER_REQUIRED_TYPES.has(ledgerType);
}

function isAppendSupportedType(ledgerType) {
  return APPEND_SUPPORTED_TYPES.has(ledgerType);
}

function listTemplateTypeLabels() {
  return [
    "Member Deposit",
    "Member Withdrawal",
    "Loan Repayment",
    "Loan Disbursement",
    "Distribution",
    "Expenses",
    "Purchase of Certificate of Deposit",
    "Liquidation of Certificate of Deposit",
    "Investment",
  ];
}

module.exports = {
  parseTypeLabel,
  typeLabelForLedger,
  memberRequiredForType,
  isAppendSupportedType,
  listTemplateTypeLabels,
  TYPE_LABEL_TO_LEDGER,
  MEMBER_REQUIRED_TYPES,
};
