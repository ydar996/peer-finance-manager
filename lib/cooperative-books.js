const { getDb } = require("../db/database");
const { TRANSACTION_TYPES } = require("./constants");
const { getMemberDepositAccountBalance } = require("./balance-service");
const { getCooperativeSetting } = require("./cooperative-settings");
const {
  getLoanPortfolioFromBankLedger,
  getMemberLoanLedgerSummary,
  hasBankLoanLedger,
  getTotalLoanInterestIncome,
  getExpectedFutureLoanInterest,
} = require("./loan-ledger-service");

const DEPOSIT_ACCOUNT_TYPES = [
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.WITHDRAWAL,
  TRANSACTION_TYPES.DISTRIBUTION,
  TRANSACTION_TYPES.MEMBERSHIP_FEE,
];

const LOAN_ACCOUNT_TYPES = [
  TRANSACTION_TYPES.LOAN_REPAYMENT,
  TRANSACTION_TYPES.LOAN_DISBURSEMENT,
  TRANSACTION_TYPES.LOAN_OVERPAYMENT,
  TRANSACTION_TYPES.LATE_FEE,
];

function sumByTypes(types, memberId = null) {
  const db = getDb();
  const placeholders = types.map(() => "?").join(", ");
  const params = [...types];
  let sql = `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type IN (${placeholders})`;
  if (memberId != null) {
    sql += " AND member_id = ?";
    params.push(memberId);
  }
  return db.prepare(sql).get(...params).total;
}

function getMemberAccountSummary(memberId) {
  const db = getDb();
  const depositBalance = getMemberDepositAccountBalance(memberId);

  const loans = db
    .prepare(
      `SELECT l.id, l.principal, l.status, l.start_date,
              COALESCE(SUM(i.paid_amount), 0) AS paid,
              COALESCE(SUM(i.total_due), 0) AS scheduled
       FROM loans l
       LEFT JOIN loan_installments i ON i.loan_id = l.id
       WHERE l.borrower_id = ?
       GROUP BY l.id`
    )
    .all(memberId);

  const loanTxBalance = sumByTypes(LOAN_ACCOUNT_TYPES, memberId);
  const loanOutstanding = loans.reduce((sum, l) => {
    const remaining = Math.max(0, (l.scheduled || l.principal) - (l.paid || 0));
    return sum + remaining;
  }, 0);

  if (hasBankLoanLedger()) {
    const ledger = getMemberLoanLedgerSummary(memberId);
    return {
      depositAccountBalance: depositBalance,
      loanAccountBalance: ledger.outstanding,
      loanOverpaymentCredit: ledger.overpaymentCredit,
      activeLoans: ledger.activeLoanCount,
      paidLoans: ledger.paidLoanCount,
      loanLots: ledger.lots,
      loans,
    };
  }

  return {
    depositAccountBalance: depositBalance,
    loanAccountBalance: loanOutstanding || loanTxBalance,
    loanOverpaymentCredit: 0,
    activeLoans: loans.filter((l) => l.status === "active").length,
    paidLoans: 0,
    loanLots: [],
    loans,
  };
}

function getCooperativeAssetTotals() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'cd_purchase' THEN ABS(amount) ELSE 0 END), 0) AS cdPurchased,
         COALESCE(SUM(CASE WHEN type = 'cd_liquidation' THEN amount ELSE 0 END), 0) AS cdLiquidated,
         COALESCE(SUM(CASE WHEN type = 'investment' THEN ABS(amount) ELSE 0 END), 0) AS investments
       FROM transactions
       WHERE type IN ('cd_purchase', 'cd_liquidation', 'investment')`
    )
    .get();
  return {
    cdPurchased: row.cdPurchased || 0,
    cdLiquidated: row.cdLiquidated || 0,
    investments: row.investments || 0,
  };
}

/** Realized + accrued interest on cooperative CDs (liquidations + current balance − purchases). */
function getCdInterestBreakdown() {
  const db = getDb();
  const events = db
    .prepare(
      `SELECT transaction_date, type, amount, description
       FROM transactions
       WHERE type IN ('cd_purchase', 'cd_liquidation')
       ORDER BY transaction_date, id`
    )
    .all();

  if (!events.length) {
    return { cdInterestIncome: 0, cdInterestRealized: 0, cdInterestAccrued: 0, rows: [] };
  }

  const cdBalanceSetting = getCooperativeSetting("cd_balance");
  const cdBalanceAsOf = getCooperativeSetting("cd_balance_as_of");
  const openLots = [];
  const rows = [];
  let realized = 0;

  for (const ev of events) {
    if (ev.type === "cd_purchase") {
      openLots.push({
        purchaseDate: ev.transaction_date,
        principal: Math.abs(ev.amount),
        description: ev.description || "",
      });
      continue;
    }

    const proceeds = ev.amount;
    const lot = openLots.shift();
    if (!lot) {
      rows.push({
        date: ev.transaction_date,
        status: "Liquidated",
        principal: null,
        balanceOrProceeds: proceeds,
        interest: proceeds,
        description: ev.description || "",
      });
      realized += proceeds;
      continue;
    }

    const interest = proceeds - lot.principal;
    realized += interest;
    rows.push({
      date: ev.transaction_date,
      status: "Liquidated",
      principal: lot.principal,
      balanceOrProceeds: proceeds,
      interest,
      description: ev.description || `CD purchased ${lot.purchaseDate}`,
    });
  }

  let accrued = 0;
  if (openLots.length > 0 && cdBalanceSetting != null) {
    const balance = Number(cdBalanceSetting);
    const openPrincipal = openLots.reduce((sum, lot) => sum + lot.principal, 0);
    accrued = balance - openPrincipal;
    for (const lot of openLots) {
      const lotInterest =
        openLots.length === 1 ? accrued : (accrued * lot.principal) / openPrincipal;
      rows.push({
        date: cdBalanceAsOf || ":",
        status: "Active",
        principal: lot.principal,
        balanceOrProceeds: openLots.length === 1 ? balance : lot.principal + lotInterest,
        interest: lotInterest,
        description: `CD purchased ${lot.purchaseDate}`,
      });
    }
  }

  return {
    cdInterestIncome: realized + accrued,
    cdInterestRealized: realized,
    cdInterestAccrued: accrued,
    rows,
  };
}

function getCooperativeBooks() {
  const db = getDb();

  const memberDeposits = sumByTypes([
    TRANSACTION_TYPES.DEPOSIT,
    TRANSACTION_TYPES.WITHDRAWAL,
  ]);
  const distributions = sumByTypes([TRANSACTION_TYPES.DISTRIBUTION]);
  // Membership fees are stored as member-account debits (negative); flip for cooperative income.
  const registrationIncome = -sumByTypes([TRANSACTION_TYPES.MEMBERSHIP_FEE]);

  const loanPortfolio = db
    .prepare(
      `SELECT COALESCE(SUM(l.principal), 0) AS principal,
              COALESCE(SUM(i.paid_amount), 0) AS collected
       FROM loans l
       LEFT JOIN loan_installments i ON i.loan_id = l.id
       WHERE l.status = 'active'`
    )
    .get();

  const bankLoanBorrowers = getLoanPortfolioFromBankLedger();
  const hasBankLoanLedgerData = hasBankLoanLedger();
  const bankLoanPrincipal = bankLoanBorrowers.reduce((s, r) => s + r.disbursed, 0);
  const bankLoanCollected = bankLoanBorrowers.reduce((s, r) => s + r.collected, 0);
  const bankLoanOutstanding = bankLoanBorrowers.reduce((s, r) => s + r.outstanding, 0);

  const expenses = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses`)
    .get();

  const assets = getCooperativeAssetTotals();
  const cdInterest = getCdInterestBreakdown();
  const loanInterestIncome = hasBankLoanLedgerData ? getTotalLoanInterestIncome() : 0;
  const expectedLoanInterest = hasBankLoanLedgerData ? getExpectedFutureLoanInterest() : 0;
  const totalCooperativeIncome =
    registrationIncome + cdInterest.cdInterestIncome + loanInterestIncome;
  const cooperativeNetIncome = totalCooperativeIncome - (expenses.total || 0);
  const cdBalanceSetting = getCooperativeSetting("cd_balance");
  const cdBalanceAsOf = getCooperativeSetting("cd_balance_as_of");

  const memberCount = db.prepare(`SELECT COUNT(*) AS c FROM members`).get().c;
  const profileCount = db
    .prepare(`SELECT COUNT(*) AS c FROM member_profiles`)
    .get().c;

  const memberIds = db.prepare(`SELECT id FROM members`).all();
  const totalMemberBalances = memberIds.reduce(
    (sum, row) => sum + getMemberDepositAccountBalance(row.id),
    0
  );

  return {
    memberCount,
    profileCount,
    memberDeposits,
    distributions,
    registrationIncome,
    totalMemberDepositAccounts: totalMemberBalances,
    loansOutstanding: hasBankLoanLedgerData
      ? bankLoanOutstanding
      : Math.max(0, (loanPortfolio.principal || 0) - (loanPortfolio.collected || 0)),
    loansPrincipal: hasBankLoanLedgerData ? bankLoanPrincipal : loanPortfolio.principal || 0,
    loansCollected: hasBankLoanLedgerData ? bankLoanCollected : loanPortfolio.collected || 0,
    loanBorrowerCount: new Set(
      bankLoanBorrowers.filter((r) => r.outstanding > 0).map((r) => r.borrowerId)
    ).size,
    loanCount: bankLoanBorrowers.length,
    expenses: expenses.total || 0,
    cdBalance: cdBalanceSetting != null ? Number(cdBalanceSetting) : null,
    cdBalanceAsOf: cdBalanceAsOf || null,
    cdPurchased: assets.cdPurchased,
    cdLiquidated: assets.cdLiquidated,
    cdInterestIncome: cdInterest.cdInterestIncome,
    cdInterestRealized: cdInterest.cdInterestRealized,
    cdInterestAccrued: cdInterest.cdInterestAccrued,
    loanInterestIncome,
    expectedLoanInterest,
    totalCooperativeIncome,
    cooperativeNetIncome,
    investments: assets.investments,
    cooperativeNet:
      memberDeposits +
      registrationIncome +
      distributions +
      (hasBankLoanLedgerData ? bankLoanCollected : loanPortfolio.collected || 0) -
      (hasBankLoanLedgerData ? bankLoanPrincipal : loanPortfolio.principal || 0) -
      (expenses.total || 0),
  };
}

const BOOK_DETAIL_SLUGS = {
  "deposit-accounts": "Member Deposit Accounts (Total)",
  "deposits-withdrawals": "Member Deposits & Withdrawals",
  "registration-income": "Registration Income",
  distributions: "Distributions Paid",
  loans: "Loans Outstanding",
  expenses: "Cooperative Expenses",
  "cd-balance": "CD Account",
  "cd-interest-income": "CD Interest Income",
  "loan-interest-income": "Loan Interest Income",
  "expected-loan-interest": "Expected Future Loan Interest",
  "total-income": "Total Cooperative Income",
  "net-income": "Cooperative Net Income",
  investments: "Cooperative Investments",
  "members-profiles": "Members/Profiles on File",
};

function getBookDetail(slug) {
  if (!BOOK_DETAIL_SLUGS[slug]) {
    throw new Error("Unknown book detail");
  }

  const db = getDb();
  const title = BOOK_DETAIL_SLUGS[slug];

  if (slug === "deposit-accounts") {
    const rows = db
      .prepare(
        `SELECT m.id AS member_id, m.name, mp.display_name
         FROM members m
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         ORDER BY m.name`
      )
      .all();
    const detailRows = rows.map((row) => ({
      member: row.display_name || row.name,
      balance: getMemberDepositAccountBalance(row.member_id),
      memberId: row.member_id,
    }));
    return {
      slug,
      title,
      navigateTab: null,
      summary: detailRows.reduce((sum, row) => sum + row.balance, 0),
      columns: [
        { key: "member", label: "Member" },
        { key: "balance", label: "Deposit Account Balance", format: "money" },
      ],
      rows: detailRows,
    };
  }

  if (slug === "deposits-withdrawals") {
    const rows = db
      .prepare(
        `SELECT t.transaction_date, t.type, t.amount, t.description,
                m.id AS member_id, m.name, mp.display_name
         FROM transactions t
         JOIN members m ON m.id = t.member_id
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         WHERE t.type IN ('deposit', 'withdrawal')
         ORDER BY t.transaction_date DESC, t.id DESC`
      )
      .all();
    return {
      slug,
      title,
      navigateTab: null,
      summary: rows.reduce((sum, row) => sum + row.amount, 0),
      columns: [
        { key: "date", label: "Date", format: "date" },
        { key: "member", label: "Member" },
        { key: "type", label: "Type" },
        { key: "amount", label: "Amount", format: "money" },
        { key: "description", label: "Description" },
      ],
      rows: rows.map((row) => ({
        date: row.transaction_date,
        member: row.display_name || row.name,
        type: row.type,
        amount: row.amount,
        description: row.description || "",
        memberId: row.member_id,
      })),
    };
  }

  if (slug === "registration-income") {
    const rows = db
      .prepare(
        `SELECT t.transaction_date, t.amount, t.description,
                m.id AS member_id, m.name, mp.display_name
         FROM transactions t
         JOIN members m ON m.id = t.member_id
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         WHERE t.type = 'membership_fee'
         ORDER BY t.transaction_date DESC, t.id DESC`
      )
      .all();
    return {
      slug,
      title,
      navigateTab: null,
      summary: rows.reduce((sum, row) => sum + Math.abs(row.amount), 0),
      columns: [
        { key: "date", label: "Date", format: "date" },
        { key: "member", label: "Member" },
        { key: "amount", label: "Fee Collected", format: "money" },
        { key: "description", label: "Description" },
      ],
      rows: rows.map((row) => ({
        date: row.transaction_date,
        member: row.display_name || row.name,
        amount: Math.abs(row.amount),
        description: row.description || "",
        memberId: row.member_id,
      })),
    };
  }

  if (slug === "distributions") {
    const rows = db
      .prepare(
        `SELECT t.transaction_date, t.amount, t.description,
                m.id AS member_id, m.name, mp.display_name
         FROM transactions t
         JOIN members m ON m.id = t.member_id
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         WHERE t.type = 'distribution'
         ORDER BY t.transaction_date DESC, t.id DESC`
      )
      .all();
    return {
      slug,
      title,
      navigateTab: null,
      summary: rows.reduce((sum, row) => sum + row.amount, 0),
      columns: [
        { key: "date", label: "Date", format: "date" },
        { key: "member", label: "Member" },
        { key: "amount", label: "Amount", format: "money" },
        { key: "description", label: "Description" },
      ],
      rows: rows.map((row) => ({
        date: row.transaction_date,
        member: row.display_name || row.name,
        amount: row.amount,
        description: row.description || "",
        memberId: row.member_id,
      })),
    };
  }

  if (slug === "loans") {
    const bankRows = getLoanPortfolioFromBankLedger();
    if (bankRows.length) {
      return {
        slug,
        title,
        navigateTab: "loans",
        summary: bankRows.reduce((sum, row) => sum + row.outstanding, 0),
        columns: [
          { key: "borrower", label: "Borrower" },
          { key: "loanLabel", label: "Loan" },
          { key: "disbursementDate", label: "Disbursed", format: "date" },
          { key: "disbursed", label: "Principal", format: "money" },
          { key: "collected", label: "Repaid", format: "money" },
          { key: "interestIncome", label: "Interest Earned", format: "money" },
          { key: "outstanding", label: "Outstanding", format: "money" },
          { key: "status", label: "Status" },
        ],
        rows: bankRows.map((row) => ({
          borrower: row.borrower,
          loanLabel: `Loan ${row.loanNumber}`,
          disbursementDate: row.disbursementDate,
          disbursed: row.disbursed,
          collected: row.collected,
          interestIncome: row.interestIncome,
          outstanding: row.outstanding,
          status: row.status === "paid" ? "Paid" : "Active",
          memberId: row.borrowerId,
          loanKey: row.loanKey,
        })),
      };
    }
    const rows = db
      .prepare(
        `SELECT l.id, l.principal, l.annual_rate, l.status, l.start_date,
                m.name AS borrower_name, mp.display_name AS borrower_display,
                COALESCE(SUM(i.paid_amount), 0) AS collected,
                COALESCE(SUM(i.total_due), 0) AS scheduled
         FROM loans l
         JOIN members m ON m.id = l.borrower_id
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         LEFT JOIN loan_installments i ON i.loan_id = l.id
         GROUP BY l.id
         ORDER BY l.id DESC`
      )
      .all();
    return {
      slug,
      title,
      navigateTab: "loans",
      summary: rows.reduce(
        (sum, row) => sum + Math.max(0, (row.scheduled || row.principal) - (row.collected || 0)),
        0
      ),
      columns: [
        { key: "id", label: "Loan ID" },
        { key: "borrower", label: "Borrower" },
        { key: "principal", label: "Principal", format: "money" },
        { key: "collected", label: "Collected", format: "money" },
        { key: "outstanding", label: "Outstanding", format: "money" },
        { key: "status", label: "Status" },
      ],
      rows: rows.map((row) => ({
        id: row.id,
        borrower: row.borrower_display || row.borrower_name,
        principal: row.principal,
        collected: row.collected || 0,
        outstanding: Math.max(0, (row.scheduled || row.principal) - (row.collected || 0)),
        status: row.status,
      })),
    };
  }

  if (slug === "cd-balance") {
    const { getCdBalanceSnapshot } = require("./cd-balance-service");
    const ledgerRows = db
      .prepare(
        `SELECT transaction_date, type, amount, description
         FROM transactions
         WHERE type IN ('cd_purchase', 'cd_liquidation')
         ORDER BY transaction_date`
      )
      .all();
    const snapshot = getCdBalanceSnapshot();
    const balance = snapshot.balance;
    return {
      slug,
      title,
      navigateTab: "record",
      summary: balance != null ? Number(balance) : null,
      columns: [
        { key: "date", label: "Date", format: "date" },
        { key: "type", label: "Type" },
        { key: "amount", label: "Amount", format: "money" },
        { key: "description", label: "Description" },
      ],
      rows: [
        ...ledgerRows.map((row) => ({
          date: row.transaction_date,
          type: row.type === "cd_purchase" ? "Purchase" : "Liquidation",
          amount: row.amount,
          description: row.description || "",
        })),
        ...snapshot.history.map((row) => ({
          date: row.as_of_date,
          type: "Balance Update",
          amount: row.balance,
          description: row.note
            ? `Manual update : ${row.note}`
            : "Manual balance update",
        })),
        ...(balance != null && !snapshot.history.length
          ? [
              {
                date: snapshot.asOf || ":",
                type: "Current Balance",
                amount: Number(balance),
                description: "Reported CD account balance",
              },
            ]
          : []),
      ],
    };
  }

  if (slug === "cd-interest-income") {
    const breakdown = getCdInterestBreakdown();
    return {
      slug,
      title,
      navigateTab: null,
      summary: breakdown.cdInterestIncome,
      columns: [
        { key: "date", label: "Date", format: "date" },
        { key: "status", label: "Status" },
        { key: "principal", label: "Principal", format: "money" },
        { key: "balanceOrProceeds", label: "Proceeds/Balance", format: "money" },
        { key: "interest", label: "Interest Earned", format: "money" },
        { key: "description", label: "Description" },
      ],
      rows: breakdown.rows,
    };
  }

  if (slug === "loan-interest-income") {
    const bankRows = getLoanPortfolioFromBankLedger();
    return {
      slug,
      title,
      navigateTab: "loans",
      summary: bankRows.reduce((sum, row) => sum + (row.interestIncome || 0), 0),
      columns: [
        { key: "borrower", label: "Borrower" },
        { key: "loanLabel", label: "Loan" },
        { key: "disbursementDate", label: "Disbursed", format: "date" },
        { key: "disbursed", label: "Principal", format: "money" },
        { key: "collected", label: "Repaid", format: "money" },
        { key: "interestIncome", label: "Interest Earned", format: "money" },
        { key: "status", label: "Status" },
      ],
      rows: bankRows.map((row) => ({
        borrower: row.borrower,
        loanLabel: `Loan ${row.loanNumber}`,
        disbursementDate: row.disbursementDate,
        disbursed: row.disbursed,
        collected: row.collected,
        interestIncome: row.interestIncome,
        status: row.status === "paid" ? "Paid" : "Active",
        memberId: row.borrowerId,
      })),
    };
  }

  if (slug === "total-income") {
    const cdInterest = getCdInterestBreakdown();
    const registrationIncome = -sumByTypes([TRANSACTION_TYPES.MEMBERSHIP_FEE]);
    const loanInterest = getTotalLoanInterestIncome();
    const rows = [
      {
        source: "Registration Income",
        amount: registrationIncome,
        note: "Membership fees collected",
      },
      {
        source: "Loan Interest Income",
        amount: loanInterest,
        note: "Interest earned on repayments, including active loans",
      },
      {
        source: "CD Interest Income",
        amount: cdInterest.cdInterestIncome,
        note: `Realized ${cdInterest.cdInterestRealized.toFixed(2)} · Accrued ${cdInterest.cdInterestAccrued.toFixed(2)}`,
      },
    ];
    return {
      slug,
      title,
      navigateTab: null,
      summary: rows.reduce((sum, row) => sum + row.amount, 0),
      columns: [
        { key: "source", label: "Income Source" },
        { key: "amount", label: "Amount", format: "money" },
        { key: "note", label: "Detail" },
      ],
      rows,
    };
  }

  if (slug === "net-income") {
    const cdInterest = getCdInterestBreakdown();
    const registrationIncome = -sumByTypes([TRANSACTION_TYPES.MEMBERSHIP_FEE]);
    const loanInterest = getTotalLoanInterestIncome();
    const expenseTotal = db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses`)
      .get().total;
    const rows = [
      {
        line: "Registration Income",
        amount: registrationIncome,
        note: "Membership fees collected",
      },
      {
        line: "Loan Interest Income",
        amount: loanInterest,
        note: "Interest earned to date on loan repayments",
      },
      {
        line: "CD Interest Income",
        amount: cdInterest.cdInterestIncome,
        note: `Realized ${cdInterest.cdInterestRealized.toFixed(2)} · Accrued ${cdInterest.cdInterestAccrued.toFixed(2)}`,
      },
      {
        line: "Cooperative Expenses",
        amount: -(expenseTotal || 0),
        note: "Operating expenses recorded",
      },
    ];
    const incomeTotal = registrationIncome + loanInterest + cdInterest.cdInterestIncome;
    return {
      slug,
      title,
      navigateTab: null,
      summary: incomeTotal - (expenseTotal || 0),
      columns: [
        { key: "line", label: "Line Item" },
        { key: "amount", label: "Amount", format: "money" },
        { key: "note", label: "Detail" },
      ],
      rows,
    };
  }

  if (slug === "expected-loan-interest") {
    const bankRows = getLoanPortfolioFromBankLedger().filter((row) => row.status === "active");
    const rows = bankRows
      .map((row) => {
        const scheduled = row.scheduledTotalInterest;
        if (scheduled == null || scheduled <= 0) return null;
        const earned = row.interestIncome || 0;
        const future = Math.max(0, scheduled - earned);
        return {
          borrower: row.borrower,
          loanLabel: `Loan ${row.loanNumber}`,
          disbursementDate: row.disbursementDate,
          scheduledInterest: scheduled,
          interestEarned: earned,
          futureInterest: future,
          outstanding: row.outstanding,
          memberId: row.borrowerId,
        };
      })
      .filter(Boolean);
    return {
      slug,
      title,
      navigateTab: "loans",
      summary: rows.reduce((sum, row) => sum + row.futureInterest, 0),
      columns: [
        { key: "borrower", label: "Borrower" },
        { key: "loanLabel", label: "Loan" },
        { key: "disbursementDate", label: "Disbursed", format: "date" },
        { key: "scheduledInterest", label: "Scheduled Interest", format: "money" },
        { key: "interestEarned", label: "Earned to Date", format: "money" },
        { key: "futureInterest", label: "Expected Future", format: "money" },
        { key: "outstanding", label: "Principal Outstanding", format: "money" },
      ],
      rows,
    };
  }

  if (slug === "investments") {
    const rows = db
      .prepare(
        `SELECT transaction_date, amount, description
         FROM transactions WHERE type = 'investment'
         ORDER BY transaction_date`
      )
      .all();
    return {
      slug,
      title,
      navigateTab: null,
      summary: rows.reduce((sum, row) => sum + Math.abs(row.amount), 0),
      columns: [
        { key: "date", label: "Date", format: "date" },
        { key: "amount", label: "Amount", format: "money" },
        { key: "description", label: "Description" },
      ],
      rows: rows.map((row) => ({
        date: row.transaction_date,
        amount: Math.abs(row.amount),
        description: row.description || "",
      })),
    };
  }

  if (slug === "expenses") {
    const rows = db
      .prepare(
        `SELECT expense_date, category, description, amount
         FROM expenses
         ORDER BY expense_date DESC, id DESC`
      )
      .all();
    return {
      slug,
      title,
      navigateTab: "record",
      summary: rows.reduce((sum, row) => sum + row.amount, 0),
      columns: [
        { key: "date", label: "Date", format: "date" },
        { key: "category", label: "Category" },
        { key: "description", label: "Description" },
        { key: "amount", label: "Amount", format: "money" },
      ],
      rows: rows.map((row) => ({
        date: row.expense_date,
        category: row.category,
        description: row.description,
        amount: row.amount,
      })),
    };
  }

  if (slug === "members-profiles") {
    const rows = db
      .prepare(
        `SELECT m.id AS member_id, m.name, mp.display_name, mp.id AS profile_id,
                mp.email, mp.phone
         FROM members m
         LEFT JOIN member_profiles mp ON mp.member_id = m.id
         ORDER BY m.name`
      )
      .all();
    const withProfile = rows.filter((row) => row.profile_id).length;
    return {
      slug,
      title,
      navigateTab: "members",
      summary: `${withProfile}/${rows.length}`,
      columns: [
        { key: "member", label: "Member" },
        { key: "profile", label: "Profile" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
      ],
      rows: rows.map((row) => ({
        member: row.display_name || row.name,
        profile: row.profile_id ? "On File" : "Missing",
        email: row.email || ":",
        phone: row.phone || ":",
        memberId: row.member_id,
      })),
    };
  }

  throw new Error("Unknown book detail");
}

module.exports = {
  getCooperativeBooks,
  getMemberAccountSummary,
  getBookDetail,
  BOOK_DETAIL_SLUGS,
  DEPOSIT_ACCOUNT_TYPES,
  LOAN_ACCOUNT_TYPES,
};
