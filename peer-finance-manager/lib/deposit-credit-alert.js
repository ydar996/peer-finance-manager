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
]);

function isCreditAlertType(type) {
  return CREDIT_ALERT_TYPES.has(String(type || ""));
}

function creditAlertLabel(type) {
  if (String(type || "") === TRANSACTION_TYPES.LOAN_REPAYMENT) return "Loan Repayment";
  return "Member Deposit";
}

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
  const byMember = new Map();
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
    if (!byMember.has(memberId)) {
      byMember.set(memberId, []);
    }
    byMember.get(memberId).push({
      transactionId,
      type: row.type,
      date,
      amount,
      description: row.description || "",
    });
  }
  for (const deposits of byMember.values()) {
    deposits.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  return byMember;
}

function alertSubjectKind(items) {
  const types = new Set((items || []).map((item) => String(item.type || TRANSACTION_TYPES.DEPOSIT)));
  const hasDeposit = types.has(TRANSACTION_TYPES.DEPOSIT);
  const hasRepayment = types.has(TRANSACTION_TYPES.LOAN_REPAYMENT);
  if (hasDeposit && hasRepayment) return "Deposits/Loan Repayments Received";
  if (hasRepayment) {
    return items.length > 1 ? "Loan Repayments Received" : "Loan Repayment Received";
  }
  return items.length > 1 ? "Deposits Received" : "Deposit Received";
}

function buildDepositAlertEmail({ memberName, deposits, branding }) {
  const greeting = memberName || "Member";
  const items = deposits || [];
  const plural = items.length > 1;
  const subject = `${branding.name}: ${alertSubjectKind(items)}`;

  const lines = items.map((d) => {
    const dateLabel = formatCooperativeDate(d.date) || d.date;
    const amountLabel = formatMoney(d.amount);
    const kindLabel = creditAlertLabel(d.type);
    return { dateLabel, amountLabel, kindLabel };
  });

  let bodyLead;
  if (!plural) {
    bodyLead = `Your Cooperative has recorded your ${lines[0].kindLabel} of ${lines[0].amountLabel} on ${lines[0].dateLabel}.`;
  } else {
    bodyLead = "Your Cooperative has recorded the following:";
  }

  const listText = plural
    ? lines.map((line) => `- ${line.dateLabel}: ${line.kindLabel} ${line.amountLabel}`).join("\n")
    : "";
  const listHtml = plural
    ? `<ul>${lines
        .map(
          (line) =>
            `<li>${escapeHtml(line.dateLabel)}: ${escapeHtml(line.kindLabel)} ${escapeHtml(line.amountLabel)}</li>`
        )
        .join("")}</ul>`
    : "";

  const text =
    `Hello ${greeting},\n\n` +
    `${bodyLead}\n` +
    (listText ? `${listText}\n\n` : "\n") +
    `You can also view this in the member portal:\n${branding.portalUrl}\n`;

  const html =
    `<p>Hello ${escapeHtml(greeting)},</p>` +
    `<p>${escapeHtml(bodyLead)}</p>` +
    listHtml +
    `<p>You can also view this in the member portal:<br>` +
    `<a href="${escapeHtml(branding.portalUrl)}">${escapeHtml(branding.portalUrl)}</a></p>`;

  return { subject, text, html };
}

function formatDepositAlertStatus(alerts) {
  if (!alerts) return "";
  if (alerts.reason === "not_configured" && alerts.wouldEmail > 0) {
    return " Deposit/loan repayment alerts were not emailed because email is not configured.";
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
       WHERE bank_import_id = ? AND type IN (?, ?) AND member_id IS NOT NULL`
    )
    .all(id, TRANSACTION_TYPES.DEPOSIT, TRANSACTION_TYPES.LOAN_REPAYMENT);
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

async function notifyImportedMemberDeposits(insertedRows = []) {
  const grouped = groupMemberDepositAlerts(insertedRows);
  const depositCount = [...grouped.values()].reduce((n, rows) => n + rows.length, 0);
  if (!depositCount) {
    return { sent: 0, failed: 0, skipped: 0, wouldEmail: 0, depositCount: 0 };
  }

  const branding = organizationBranding();
  const deliveries = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let wouldEmail = 0;

  for (const [memberId, deposits] of grouped) {
    const recipient = lookupMemberAlertRecipient(memberId);
    if (!recipient) {
      skipped += 1;
      markDepositsAlerted(deposits.map((d) => ({ ...d, memberId })), "skipped");
      continue;
    }
    if (!recipient.email) {
      skipped += 1;
      markDepositsAlerted(deposits.map((d) => ({ ...d, memberId })), "skipped");
      deliveries.push({
        memberId,
        memberName: recipient.memberName,
        email: "none",
        status: "skipped",
        errorMessage: "no_email",
      });
      continue;
    }
    wouldEmail += 1;
    const message = buildDepositAlertEmail({
      memberName: recipient.memberName,
      deposits,
      branding,
    });
    if (!isEmailConfigured()) {
      skipped += 1;
      deliveries.push({
        memberId,
        memberName: recipient.memberName,
        email: recipient.email,
        subject: message.subject,
        status: "skipped",
        errorMessage: "not_configured",
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
          status: "sent",
        });
      } else {
        skipped += 1;
        deliveries.push({
          memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject: message.subject,
          status: "skipped",
          errorMessage: result?.reason || "not_sent",
        });
      }
    } catch (err) {
      failed += 1;
      deliveries.push({
        memberId,
        memberName: recipient.memberName,
        email: recipient.email,
        subject: message.subject,
        status: "failed",
        errorMessage: err.message,
      });
    }
  }

  for (const [memberId, items] of grouped) {
    if (!items.some((item) => String(item.type) === TRANSACTION_TYPES.DEPOSIT)) continue;
    try {
      require("./flexxforms-membership-service").maybeNotifyDepositsVerified(memberId);
    } catch (_) {
      /* optional first-deposit membership follow-up */
    }
  }

  const auditDeliveries = deliveries.filter((d) => d.email && d.email !== "none");
  if (auditDeliveries.length) {
    try {
      recordDeliveryBatch({
        triggerType: TRIGGER_TYPE,
        dedupeKey: `deposit-alert:${Date.now()}:${sent}:${failed}`,
        deliveries: auditDeliveries,
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
  const pendingCount = [...pending.values()].reduce((n, list) => n + list.length, 0);
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
  findLatestAppendImport,
};
