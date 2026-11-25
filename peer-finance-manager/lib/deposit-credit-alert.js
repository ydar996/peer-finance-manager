/**
 * Email members after a successful Import New Bank Activity apply
 * when new member deposits were posted (credit alerts).
 */
const { sendEmail, isEmailConfigured } = require("./email-service");
const { getDb } = require("../db/database");
const { getOrgSlugOrNull } = require("./org-context");
const { getMemberPortalLoginUrl } = require("./portal-urls");
const { formatMoney } = require("./money-format");
const { formatCooperativeDate } = require("./cooperative-date-format");
const { TRANSACTION_TYPES } = require("./constants");
const { CESSATION_STATUSES } = require("./membership-status-service");
const { recordDeliveryBatch } = require("./email-audit-service");

const TRIGGER_TYPE = "deposit_credit_alert";
const DEFAULT_BACKFILL_HOURS = 72;

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

const CREDIT_ALERT_TYPES = new Set([
  TRANSACTION_TYPES.DEPOSIT,
  TRANSACTION_TYPES.LOAN_REPAYMENT,
  TRANSACTION_TYPES.SHARE_CAPITAL,
]);

function isCreditAlertType(type) {
  return CREDIT_ALERT_TYPES.has(String(type || ""));
}

function creditAlertLabel(type) {
  if (String(type || "") === TRANSACTION_TYPES.LOAN_REPAYMENT) return "Loan Repayment";
  if (String(type || "") === TRANSACTION_TYPES.SHARE_CAPITAL) return "Share Capital";
  return "Member Deposit";
}

function creditAlertCategory(type) {
  if (String(type || "") === TRANSACTION_TYPES.LOAN_REPAYMENT) return "loan_repayment";
  if (String(type || "") === TRANSACTION_TYPES.SHARE_CAPITAL) return "share_capital";
  return "deposit";
}

const CATEGORY_TEMPLATE = {
  deposit: "deposit_credit_alert",
  loan_repayment: "loan_repayment_received",
  share_capital: "share_capital_received",
};

function ensureDepositAlertLog(db = getDb()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deposit_credit_alert_log (
      transaction_id INTEGER PRIMARY KEY,
      member_id INTEGER,
      status TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function alreadyAlertedIds(transactionIds) {
  const ids = [...new Set((transactionIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Set();
  const db = getDb();
  ensureDepositAlertLog(db);
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT transaction_id AS id FROM deposit_credit_alert_log
       WHERE transaction_id IN (${placeholders}) AND status = 'sent'`
    )
    .all(...ids);
  return new Set(rows.map((row) => Number(row.id)));
}

function markDepositsAlerted(rows, status) {
  const db = getDb();
  ensureDepositAlertLog(db);
  const insert = db.prepare(
    `INSERT INTO deposit_credit_alert_log (transaction_id, member_id, status, sent_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(transaction_id) DO UPDATE SET
       status = excluded.status,
       sent_at = excluded.sent_at,
       member_id = excluded.member_id`
  );
  const run = db.transaction((items) => {
    for (const row of items) {
      const txId = Number(row.transactionId);
      if (!Number.isInteger(txId) || txId <= 0) continue;
      insert.run(txId, row.memberId || null, status);
    }
  });
  run(rows || []);
}

function lookupMemberAlertRecipient(memberId) {
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
  const email = usableEmail(row.profileEmail) || usableEmail(row.loginEmail);
  return {
    memberId: row.memberId,
    memberName: row.memberName || "Member",
    email,
  };
}

function groupMemberDepositAlerts(insertedRows = []) {
  const byMemberCategory = new Map();
  const sentIds = alreadyAlertedIds((insertedRows || []).map((row) => row.transactionId));
  for (const row of insertedRows || []) {
    if (!isCreditAlertType(row.type)) continue;
    const memberId = Number(row.memberId);
    if (!Number.isInteger(memberId) || memberId <= 0) continue;
    if (!lookupMemberAlertRecipient(memberId)) continue;
    const amount = Math.abs(Number(row.amount) || 0);
    if (amount <= 0) continue;
    const transactionId = Number(row.transactionId) || null;
    if (transactionId && sentIds.has(transactionId)) continue;
    const date = String(row.date || "").slice(0, 10);
    const key = `${memberId}:${creditAlertCategory(row.type)}`;
    if (!byMemberCategory.has(key)) {
      byMemberCategory.set(key, { memberId, category: creditAlertCategory(row.type), items: [] });
    }
    byMemberCategory.get(key).items.push({
      transactionId,
      type: row.type,
      date,
      amount,
      description: row.description || "",
    });
  }
  for (const group of byMemberCategory.values()) {
    group.items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  return byMemberCategory;
}

function alertSubjectKind(category, count) {
  const plural = count > 1;
  if (category === "loan_repayment") {
    return plural ? "Loan Repayments Received" : "Loan Repayment Received";
  }
  if (category === "share_capital") {
    return plural ? "Share Capital Payments Received" : "Share Capital Received";
  }
  return plural ? "Deposits Received" : "Deposit Received";
}

function buildDepositAlertEmail({ memberName, deposits, category, branding }) {
  const { renderAutomatedEmail } = require("./automated-message-service");
  const greeting = memberName || "Member";
  const items = deposits || [];
  const lines = items.map((d) => {
    const dateLabel = formatCooperativeDate(d.date) || d.date;
    const amountLabel = formatMoney(d.amount);
    const kindLabel = creditAlertLabel(d.type);
    return { dateLabel, amountLabel, kindLabel };
  });
  const details =
    lines.length > 1
      ? "Your Cooperative has recorded the following:\n" +
        lines.map((line) => `- ${line.dateLabel}: ${line.kindLabel} ${line.amountLabel}`).join("\n")
      : `Your Cooperative has recorded your ${lines[0]?.kindLabel} of ${lines[0]?.amountLabel} on ${lines[0]?.dateLabel}.`;

  return renderAutomatedEmail(CATEGORY_TEMPLATE[category] || CATEGORY_TEMPLATE.deposit, {
    memberName: greeting,
    orgName: branding.name,
    portalUrl: branding.portalUrl,
    alertKind: alertSubjectKind(category, items.length),
    details,
  });
}

function formatDepositAlertStatus(alerts) {
  if (!alerts) return "";
  if (alerts.reason === "not_configured" && alerts.wouldEmail > 0) {
    return " Deposit/loan repayment notices were posted to the member portal. Email was not sent because email is not configured.";
  }
  if (alerts.alreadySent) {
    return " Deposit/loan repayment alerts for this import were already emailed.";
  }
  if (alerts.sent > 0) {
    const noun = alerts.sent === 1 ? "member" : "members";
    const failed =
      alerts.failed > 0 ? ` ${alerts.failed} could not be sent.` : "";
    return ` Deposit/loan repayment alerts emailed to ${alerts.sent} ${noun}.${failed}`;
  }
  if (alerts.wouldEmail === 0 && alerts.depositCount > 0) {
    return " No deposit/loan repayment alerts emailed (no member email on file for those payments).";
  }
  return "";
}

function listDepositsForBankImport(importId) {
  const id = Number(importId);
  if (!Number.isInteger(id) || id <= 0) return [];
  const db = getDb();
  return db
    .prepare(
      `SELECT id AS transactionId,
              member_id AS memberId,
              type,
              amount,
              transaction_date AS date,
              description
       FROM transactions
       WHERE bank_import_id = ? AND type IN (?, ?, ?) AND member_id IS NOT NULL`
    )
    .all(id, TRANSACTION_TYPES.DEPOSIT, TRANSACTION_TYPES.LOAN_REPAYMENT, TRANSACTION_TYPES.SHARE_CAPITAL);
}

function findLatestAppendImport() {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT id, filename, imported_at AS importedAt, status
         FROM bank_imports
         WHERE status = 'applied' AND filename LIKE 'append:%'
         ORDER BY id DESC
         LIMIT 1`
      )
      .get() || null
  );
}

function importAgeHours(importedAt) {
  if (!importedAt) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(String(importedAt).replace(" ", "T") + "Z");
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return (Date.now() - ts) / (1000 * 60 * 60);
}

async function notifyImportedMemberDeposits(insertedRows = [], { emailOnly = false } = {}) {
  const { memberEmailNotificationsEnabled } = require("./member-email-gate");
  const memberEmailOn = memberEmailNotificationsEnabled();
  const grouped = groupMemberDepositAlerts(insertedRows);
  const depositCount = [...grouped.values()].reduce((n, group) => n + group.items.length, 0);
  if (!depositCount) {
    return { sent: 0, failed: 0, skipped: 0, wouldEmail: 0, depositCount: 0 };
  }

  const branding = organizationBranding();
  const deliveries = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let wouldEmail = 0;

  for (const { memberId, category, items: deposits } of grouped.values()) {
    const recipient = lookupMemberAlertRecipient(memberId);
    if (!recipient) {
      skipped += 1;
      markDepositsAlerted(deposits.map((d) => ({ ...d, memberId })), "skipped");
      continue;
    }
    const message = buildDepositAlertEmail({
      memberName: recipient.memberName,
      deposits,
      category,
      branding,
    });
    const { postMemberNoticeFromAutomatedEmail } = require("./messaging-service");
    const portal = emailOnly
      ? null
      : postMemberNoticeFromAutomatedEmail({ memberId, message });
    const portalNote = portal?.created
      ? "portal"
      : portal?.reason === "no_portal_login"
        ? "no_portal_login"
        : portal?.error || null;
    if (!recipient.email) {
      skipped += 1;
      markDepositsAlerted(deposits.map((d) => ({ ...d, memberId })), portal?.created ? "sent" : "skipped");
      deliveries.push({
        memberId,
        memberName: recipient.memberName,
        email: "none",
        subject: message.subject,
        bodyText: message.text,
        bodyHtml: message.html,
        status: portal?.created ? "sent" : "skipped",
        errorMessage: portal?.created ? "portal_only" : portalNote || "no_email",
      });
      continue;
    }
    wouldEmail += 1;
    if (!memberEmailOn || !isEmailConfigured()) {
      const skipReason = !memberEmailOn ? "member_email_disabled" : "not_configured";
      skipped += 1;
      markDepositsAlerted(deposits.map((d) => ({ ...d, memberId })), portal?.created ? "sent" : "skipped");
      deliveries.push({
        memberId,
        memberName: recipient.memberName,
        email: recipient.email,
        subject: message.subject,
        bodyText: message.text,
        bodyHtml: message.html,
        status: portal?.created ? "sent" : "skipped",
        errorMessage: portal?.created ? `portal_only:${skipReason}` : skipReason,
      });
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
        markDepositsAlerted(deposits.map((d) => ({ ...d, memberId })), "sent");
        deliveries.push({
          memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject: message.subject,
          bodyText: message.text,
          bodyHtml: message.html,
          status: "sent",
          errorMessage: portalNote === "portal" ? null : portalNote,
        });
      } else {
        skipped += 1;
        markDepositsAlerted(deposits.map((d) => ({ ...d, memberId })), portal?.created ? "sent" : "skipped");
        deliveries.push({
          memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject: message.subject,
          bodyText: message.text,
          bodyHtml: message.html,
          status: portal?.created ? "sent" : "skipped",
          errorMessage: result?.reason || "not_sent",
        });
      }
    } catch (err) {
      failed += 1;
      markDepositsAlerted(deposits.map((d) => ({ ...d, memberId })), portal?.created ? "sent" : "failed");
      deliveries.push({
        memberId,
        memberName: recipient.memberName,
        email: recipient.email,
        subject: message.subject,
        bodyText: message.text,
        bodyHtml: message.html,
        status: "failed",
        errorMessage: err.message,
      });
    }
  }

  const verifiedCandidates = new Set();
  for (const { memberId, category } of grouped.values()) {
    if (category === "deposit") verifiedCandidates.add(memberId);
  }
  for (const memberId of verifiedCandidates) {
    try {
      require("./flexxforms-membership-service").maybeNotifyDepositsVerified(memberId);
    } catch (_) {
      /* optional first-deposit membership follow-up */
    }
  }

  if (deliveries.length) {
    try {
      recordDeliveryBatch({
        triggerType: TRIGGER_TYPE,
        dedupeKey: `deposit-alert:${Date.now()}:${sent}:${failed}:${deliveries.length}`,
        deliveries,
      });
    } catch (_) {
      /* audit is best-effort */
    }
  }

  return {
    sent,
    failed,
    skipped,
    wouldEmail,
    depositCount,
    reason: !isEmailConfigured() && wouldEmail > 0 ? "not_configured" : null,
  };
}

async function notifyDepositsForBankImport(importId) {
  const rows = listDepositsForBankImport(importId);
  const result = await notifyImportedMemberDeposits(rows);
  return { ...result, importId: Number(importId) || null };
}

function findLatestAppliedImport() {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT id, filename, imported_at AS importedAt, status
         FROM bank_imports
         WHERE status = 'applied'
         ORDER BY id DESC
         LIMIT 1`
      )
      .get() || null
  );
}

// Resend path for alerts suppressed while member email was toggled off:
// transactions were logged 'sent' (portal-only) so the normal dedupe
// skips them. Reset the log rows for this import, then email only -
// no duplicate portal notices.
function resetAlertsForImport(importId) {
  const rows = listDepositsForBankImport(importId);
  const ids = rows.map((r) => r.transactionId);
  if (!ids.length) return 0;
  const db = getDb();
  ensureDepositAlertLog(db);
  const placeholders = ids.map(() => "?").join(", ");
  const info = db
    .prepare(`DELETE FROM deposit_credit_alert_log WHERE transaction_id IN (${placeholders})`)
    .run(...ids);
  return info.changes;
}

async function resendDepositsForBankImport(importId, { emailOnly = true } = {}) {
  const rows = listDepositsForBankImport(importId);
  const reset = resetAlertsForImport(importId);
  const result = await notifyImportedMemberDeposits(rows, { emailOnly });
  return { ...result, importId: Number(importId) || null, reset };
}

async function notifyLatestImportedDeposits({ maxAgeHours = DEFAULT_BACKFILL_HOURS } = {}) {
  const latest = findLatestAppendImport();
  if (!latest) {
    return { sent: 0, failed: 0, skipped: 0, wouldEmail: 0, depositCount: 0, reason: "no_import" };
  }
  const age = importAgeHours(latest.importedAt);
  if (age > Number(maxAgeHours || DEFAULT_BACKFILL_HOURS)) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      wouldEmail: 0,
      depositCount: 0,
      importId: latest.id,
      reason: "too_old",
    };
  }
  const rows = listDepositsForBankImport(latest.id);
  if (!rows.length) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      wouldEmail: 0,
      depositCount: 0,
      importId: latest.id,
      filename: latest.filename,
      reason: "no_deposits",
    };
  }
  const pending = groupMemberDepositAlerts(rows);
  const pendingCount = [...pending.values()].reduce((n, group) => n + group.items.length, 0);
  if (!pendingCount) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      wouldEmail: 0,
      depositCount: 0,
      importId: latest.id,
      filename: latest.filename,
      alreadySent: true,
    };
  }
  const result = await notifyImportedMemberDeposits(rows);
  return { ...result, importId: latest.id, filename: latest.filename, importedAt: latest.importedAt };
}

module.exports = {
  TRIGGER_TYPE,
  groupMemberDepositAlerts,
  buildDepositAlertEmail,
  formatDepositAlertStatus,
  notifyImportedMemberDeposits,
  notifyDepositsForBankImport,
  notifyLatestImportedDeposits,
  resendDepositsForBankImport,
  resetAlertsForImport,
  findLatestAppendImport,
  findLatestAppliedImport,
};
