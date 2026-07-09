const { getDb } = require("../db/database");
const { ensureSettingsTable } = require("./cooperative-settings");
const { isEmailConfigured } = require("./email-service");

const TRIGGER_LABELS = {
  meeting_announced: "Meeting Announcement",
  meeting_cancelled: "Meeting Cancellation",
  meeting_reminder: "Meeting Reminder",
  report_published: "Status Report Published",
  month_end: "Month-End Report Reminder",
};

function ensureEmailAuditTables(db = getDb()) {
  ensureSettingsTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_report_email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_type TEXT NOT NULL,
      period_slug TEXT,
      dedupe_key TEXT NOT NULL UNIQUE,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS member_email_delivery_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER,
      trigger_type TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      period_slug TEXT,
      member_id INTEGER,
      member_name TEXT,
      email TEXT NOT NULL,
      subject TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_email_delivery_sent_at
      ON member_email_delivery_log(sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_delivery_batch
      ON member_email_delivery_log(batch_id);
    CREATE INDEX IF NOT EXISTS idx_email_delivery_dedupe
      ON member_email_delivery_log(dedupe_key);
  `);
}

function triggerLabel(triggerType) {
  return TRIGGER_LABELS[triggerType] || String(triggerType || "Email Notification");
}

function recordDeliveryBatch({
  triggerType,
  periodSlug = null,
  dedupeKey,
  subject = null,
  deliveries = [],
}) {
  const db = getDb();
  ensureEmailAuditTables(db);

  const sentCount = deliveries.filter((d) => d.status === "sent").length;
  const failedCount = deliveries.filter((d) => d.status === "failed").length;
  const skippedCount = deliveries.filter((d) => d.status === "skipped").length;

  let batchId = null;
  const insertBatch = db.prepare(
    `INSERT INTO member_report_email_log (trigger_type, period_slug, dedupe_key, recipient_count)
     VALUES (?, ?, ?, ?)`
  );
  try {
    const info = insertBatch.run(triggerType, periodSlug || null, dedupeKey, sentCount);
    batchId = Number(info.lastInsertRowid);
  } catch (err) {
    const existing = db
      .prepare(`SELECT id FROM member_report_email_log WHERE dedupe_key = ?`)
      .get(dedupeKey);
    batchId = existing?.id != null ? Number(existing.id) : null;
    if (!batchId) throw err;
  }

  const insertDelivery = db.prepare(
    `INSERT INTO member_email_delivery_log
      (batch_id, trigger_type, dedupe_key, period_slug, member_id, member_name, email, subject, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insertDelivery.run(
        batchId,
        triggerType,
        dedupeKey,
        periodSlug || null,
        row.memberId ?? null,
        row.memberName || null,
        String(row.email || "").trim().toLowerCase(),
        row.subject || subject || null,
        row.status || "sent",
        row.errorMessage || null
      );
    }
  });
  insertMany(deliveries);

  return {
    batchId,
    sentCount,
    failedCount,
    skippedCount,
    recipientCount: sentCount,
    dedupeKey,
  };
}

function listEmailSendBatches(limit = 50) {
  const db = getDb();
  ensureEmailAuditTables(db);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = db
    .prepare(
      `SELECT b.id,
              b.trigger_type AS triggerType,
              b.period_slug AS periodSlug,
              b.dedupe_key AS dedupeKey,
              b.recipient_count AS recipientCount,
              b.sent_at AS sentAt,
              COALESCE(d.sent_count, 0) AS detailSentCount,
              COALESCE(d.failed_count, 0) AS detailFailedCount,
              COALESCE(d.skipped_count, 0) AS detailSkippedCount,
              COALESCE(d.detail_rows, 0) AS detailRowCount,
              d.sample_subject AS sampleSubject
       FROM member_report_email_log b
       LEFT JOIN (
         SELECT batch_id,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
                COUNT(*) AS detail_rows,
                MAX(subject) AS sample_subject
         FROM member_email_delivery_log
         GROUP BY batch_id
       ) d ON d.batch_id = b.id
       ORDER BY b.sent_at DESC, b.id DESC
       LIMIT ?`
    )
    .all(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    triggerType: row.triggerType,
    triggerLabel: triggerLabel(row.triggerType),
    periodSlug: row.periodSlug || null,
    dedupeKey: row.dedupeKey,
    recipientCount: Number(row.recipientCount) || 0,
    detailSentCount: Number(row.detailSentCount) || 0,
    detailFailedCount: Number(row.detailFailedCount) || 0,
    detailSkippedCount: Number(row.detailSkippedCount) || 0,
    hasRecipientDetails: Number(row.detailRowCount) > 0,
    subject: row.sampleSubject || null,
    sentAt: row.sentAt,
  }));
}

function listEmailDeliveriesForBatch(batchId, limit = 500) {
  const db = getDb();
  ensureEmailAuditTables(db);
  const id = Number(batchId);
  if (!Number.isFinite(id)) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  return db
    .prepare(
      `SELECT id,
              batch_id AS batchId,
              trigger_type AS triggerType,
              dedupe_key AS dedupeKey,
              period_slug AS periodSlug,
              member_id AS memberId,
              member_name AS memberName,
              email,
              subject,
              status,
              error_message AS errorMessage,
              sent_at AS sentAt
       FROM member_email_delivery_log
       WHERE batch_id = ?
       ORDER BY
         CASE status WHEN 'failed' THEN 0 WHEN 'sent' THEN 1 ELSE 2 END,
         member_name COLLATE NOCASE,
         email COLLATE NOCASE,
         id
       LIMIT ?`
    )
    .all(id, safeLimit)
    .map((row) => ({
      ...row,
      triggerLabel: triggerLabel(row.triggerType),
    }));
}

function getEmailAuditSummary() {
  const { listMemberNotificationRecipients } = require("./report-notification-service");
  const recipients = listMemberNotificationRecipients();
  const db = getDb();
  ensureEmailAuditTables(db);
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM member_report_email_log) AS batchCount,
         (SELECT COUNT(*) FROM member_email_delivery_log WHERE status = 'sent') AS deliverySentCount,
         (SELECT COUNT(*) FROM member_email_delivery_log WHERE status = 'failed') AS deliveryFailedCount,
         (SELECT MAX(sent_at) FROM member_report_email_log) AS lastBatchAt`
    )
    .get();

  return {
    emailConfigured: isEmailConfigured(),
    recipientCount: recipients.length,
    recipients: recipients.map((r) => ({
      memberId: r.memberId,
      memberName: r.memberName,
      email: r.email,
    })),
    batchCount: Number(totals?.batchCount) || 0,
    deliverySentCount: Number(totals?.deliverySentCount) || 0,
    deliveryFailedCount: Number(totals?.deliveryFailedCount) || 0,
    lastBatchAt: totals?.lastBatchAt || null,
  };
}

module.exports = {
  ensureEmailAuditTables,
  triggerLabel,
  recordDeliveryBatch,
  listEmailSendBatches,
  listEmailDeliveriesForBatch,
  getEmailAuditSummary,
};
