/**
 * Email borrowers on their installment due date (same calendar day as disbursement,
 * each month after the disbursement date).
 */
const { sendEmail, isEmailConfigured } = require("./email-service");
const { getDb } = require("../db/database");
const { getOrgSlugOrNull } = require("./org-context");
const { getMemberPortalLoginUrl } = require("./portal-urls");
const { formatMoney } = require("./money-format");
const { formatCooperativeDate } = require("./cooperative-date-format");
const { todayIso } = require("./cooperative-time");
const { CESSATION_STATUSES } = require("./membership-status-service");
const { recordDeliveryBatch, ensureEmailAuditTables } = require("./email-audit-service");
const { getAllBankLoanLots } = require("./loan-ledger-service");

const TRIGGER_TYPE = "loan_due_notice";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function usableEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email.includes("@") || email.endsWith(".local")) return null;
  return email;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function organizationBranding() {
  const slug = getOrgSlugOrNull();
  let name = "Your Cooperative";
  if (slug) {
    try {
      const { getOrganization } = require("./organization-service");
      const org = getOrganization(slug);
      if (org?.name) name = org.name;
    } catch (_) {
      /* tests and missing registry fall back */
    }
  }
  return { slug, name, portalUrl: getMemberPortalLoginUrl(slug) };
}

function lookupBorrowerRecipient(memberId) {
  const id = Number(memberId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT m.id AS memberId,
              COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName,
              mp.email AS profileEmail,
              u.email AS loginEmail,
              mp.cooperative_account_status AS accountStatus
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       LEFT JOIN users u ON u.member_id = m.id AND u.role = 'member'
       WHERE m.id = ?
       LIMIT 1`
    )
    .get(id);
  if (!row) return null;
  const status = String(row.accountStatus || "active").toLowerCase();
  if (CESSATION_STATUSES.includes(status)) return null;
  return {
    memberId: row.memberId,
    memberName: row.memberName || "Member",
    email: usableEmail(row.profileEmail) || usableEmail(row.loginEmail),
  };
}

function parseIsoDay(iso) {
  const [year, month, day] = String(iso || "")
    .slice(0, 10)
    .split("-")
    .map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function lastCalendarDay(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Disbursed 5/22 means every 22nd after that date, not the disbursement day itself. */
function isInstallmentDueDay(disbursementIso, todayIsoValue) {
  const start = String(disbursementIso || "").slice(0, 10);
  const today = String(todayIsoValue || "").slice(0, 10);
  if (!start || !today || today <= start) return false;
  const d = parseIsoDay(start);
  const t = parseIsoDay(today);
  if (!d || !t) return false;
  const dueDay = Math.min(d.day, lastCalendarDay(t.year, t.month));
  return t.day === dueDay;
}

function typicalPeriodPayment(period) {
  const explicit = Number(period.totalDue ?? period.total_due);
  const parts = round2(Number(period.interest || period.interestDue || 0) + Number(period.principal || period.principalDue || 0));
  if (explicit > 0.005) return round2(explicit);
  if (parts > 0.005) return parts;
  return 0;
}

function monthlyPaymentFromLot(lot) {
  if (Number(lot.scheduledMonthlyPayment) > 0.005) {
    return round2(lot.scheduledMonthlyPayment);
  }
  for (const period of lot.schedule || []) {
    const payment = typicalPeriodPayment(period);
    if (payment > 0.005) return payment;
  }
  return 0;
}

function duePaymentForLot(lot, today) {
  if (Number(lot.outstanding) <= 0.005) return null;
  const todayIsoValue = String(today).slice(0, 10);

  for (const period of lot.schedule || []) {
    const due = String(period.dueDate || period.due_date || "").slice(0, 10);
    if (due === todayIsoValue) {
      const payment = typicalPeriodPayment(period);
      if (payment > 0.005) {
        return round2(Math.min(payment, Number(lot.outstanding) || payment));
      }
    }
  }

  if (!isInstallmentDueDay(lot.disbursementDate, todayIsoValue)) return null;
  const monthly = monthlyPaymentFromLot(lot);
  if (monthly <= 0.005) return null;
  return round2(Math.min(monthly, Number(lot.outstanding) || monthly));
}

function listInstallmentsDueOn(todayIsoValue) {
  const db = getDb();
  return db
    .prepare(
      `SELECT i.id AS installmentId,
              i.loan_id AS loanId,
              i.total_due AS totalDue,
              l.borrower_id AS borrowerId,
              l.start_date AS startDate,
              l.principal AS principal,
              l.status AS loanStatus
       FROM loan_installments i
       JOIN loans l ON l.id = i.loan_id
       WHERE substr(i.due_date, 1, 10) = ?
         AND l.status = 'active'`
    )
    .all(String(todayIsoValue).slice(0, 10));
}

function installmentOutstanding(loanId, principal) {
  const db = getDb();
  const paid = db
    .prepare(
      `SELECT COALESCE(SUM(paid_amount), 0) AS paid
       FROM loan_installments WHERE loan_id = ?`
    )
    .get(loanId)?.paid || 0;
  return round2(Math.max(0, Number(principal || 0) - Number(paid || 0)));
}

function listDueLoanNotices(todayIsoValue) {
  const today = String(todayIsoValue || todayIso()).slice(0, 10);
  const byMember = new Map();
  const covered = new Set();

  let lots = [];
  try {
    lots = getAllBankLoanLots({ status: "active" });
  } catch (_) {
    lots = [];
  }

  for (const lot of lots) {
    const paymentAmount = duePaymentForLot(lot, today);
    if (paymentAmount == null) continue;
    const memberId = Number(lot.memberId);
    if (!byMember.has(memberId)) byMember.set(memberId, []);
    byMember.get(memberId).push({
      loanLabel: `Loan ${lot.loanNumber}`,
      disbursementDate: String(lot.disbursementDate || "").slice(0, 10),
      paymentAmount,
      outstanding: round2(lot.outstanding),
    });
    if (lot.disbursementDate) {
      covered.add(`${memberId}:${String(lot.disbursementDate).slice(0, 10)}`);
    }
  }

  for (const row of listInstallmentsDueOn(today)) {
    const memberId = Number(row.borrowerId);
    const start = String(row.startDate || "").slice(0, 10);
    if (covered.has(`${memberId}:${start}`)) continue;
    const paymentAmount = round2(row.totalDue);
    if (paymentAmount <= 0.005) continue;
    const outstanding = installmentOutstanding(row.loanId, row.principal);
    if (outstanding <= 0.005) continue;
    if (!byMember.has(memberId)) byMember.set(memberId, []);
    byMember.get(memberId).push({
      loanLabel: `Loan ${row.loanId}`,
      disbursementDate: start,
      paymentAmount,
      outstanding,
    });
  }

  return [...byMember.entries()].map(([memberId, loans]) => ({
    memberId,
    dueDate: today,
    loans,
  }));
}

function alreadySent(dedupeKey) {
  const db = getDb();
  ensureEmailAuditTables(db);
  return Boolean(
    db.prepare(`SELECT 1 FROM member_report_email_log WHERE dedupe_key = ?`).get(dedupeKey)
  );
}

function dueDateLabel(dueDate) {
  const fallback = String(dueDate || "").slice(0, 10);
  try {
    return formatCooperativeDate(dueDate) || fallback;
  } catch (_) {
    return fallback;
  }
}

function buildLoanDueNoticeEmail({ memberName, dueDate, loans, branding }) {
  const { renderAutomatedEmail } = require("./automated-message-service");
  const greeting = memberName || "Member";
  const dateLabel = dueDateLabel(dueDate);
  const items = loans || [];
  const first = items[0] || {};
  const paymentAmount = formatMoney(first.paymentAmount);
  const outstandingBalance = formatMoney(first.outstanding);
  const details =
    items.length > 1
      ? `The following loan installments are due today, ${dateLabel}:\n` +
        items
          .map((loan) => {
            const amount = formatMoney(loan.paymentAmount);
            const balance = formatMoney(loan.outstanding);
            return `- ${loan.loanLabel}: payment of ${amount} is due today. Outstanding loan balance as of ${dateLabel}: ${balance}.`;
          })
          .join("\n")
      : `Your installment of ${paymentAmount} for ${first.loanLabel} is due today, ${dateLabel}. Your outstanding loan balance as of ${dateLabel} is ${outstandingBalance}.`;

  return renderAutomatedEmail("loan_due_notice", {
    memberName: greeting,
    orgName: branding.name,
    portalUrl: branding.portalUrl,
    dueDate: dateLabel,
    paymentAmount,
    loanLabel: first.loanLabel || "Loan",
    outstandingBalance,
    details,
  });
}

async function sendLoanDueNoticesForToday(date = new Date()) {
  const dueDate = todayIso(date);
  const notices = listDueLoanNotices(dueDate);
  if (!notices.length) {
    return { sent: 0, failed: 0, skipped: 0, noticeCount: 0, dueDate };
  }

  const branding = organizationBranding();
  const deliveries = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notice of notices) {
    const dedupeKey = `loan_due:${notice.memberId}:${dueDate}`;
    if (alreadySent(dedupeKey)) {
      skipped += 1;
      continue;
    }
    const recipient = lookupBorrowerRecipient(notice.memberId);
    if (!recipient) {
      skipped += 1;
      continue;
    }
    if (!recipient.email) {
      skipped += 1;
      continue;
    }
    const message = buildLoanDueNoticeEmail({
      memberName: recipient.memberName,
      dueDate,
      loans: notice.loans,
      branding,
    });
    if (!isEmailConfigured()) {
      skipped += 1;
      continue;
    }
    try {
      const result = await sendEmail({
        to: recipient.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      if (result?.sent) {
        sent += 1;
        recordDeliveryBatch({
          triggerType: TRIGGER_TYPE,
          dedupeKey,
          deliveries: [
            {
              memberId: recipient.memberId,
              memberName: recipient.memberName,
              email: recipient.email,
              subject: message.subject,
              status: "sent",
            },
          ],
        });
        deliveries.push({ memberId: recipient.memberId, status: "sent" });
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      deliveries.push({ memberId: recipient.memberId, status: "failed", error: err.message });
    }
  }

  return {
    sent,
    failed,
    skipped,
    noticeCount: notices.length,
    dueDate,
    reason: !isEmailConfigured() ? "not_configured" : null,
  };
}

async function runScheduledLoanDueNoticesForAllOrganizations() {
  const { listOrganizations } = require("./organization-service");
  const { runWithOrg } = require("./org-context");
  const summary = [];
  for (const org of listOrganizations()) {
    await runWithOrg(org.slug, async () => {
      try {
        const outcome = await sendLoanDueNoticesForToday();
        if (outcome.noticeCount || outcome.sent) {
          summary.push({ orgSlug: org.slug, ...outcome });
        }
      } catch (err) {
        summary.push({ orgSlug: org.slug, error: err.message });
      }
    });
  }
  return summary;
}

module.exports = {
  TRIGGER_TYPE,
  isInstallmentDueDay,
  duePaymentForLot,
  listDueLoanNotices,
  buildLoanDueNoticeEmail,
  sendLoanDueNoticesForToday,
  runScheduledLoanDueNoticesForAllOrganizations,
};
