/**
 * Cooperative inbox messaging (all tenants).
 * Per-org SQLite: bidirectional threads between Cooperative admins and members.
 * Audience: all active members, a subset, or one member; members may write the Cooperative admin.
 * Bodies support Markdown; optional PDF/image/docx attachments viewable by participants.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDb } = require("../db/database");
const { getOrgSlug } = require("./org-context");
const { getOrgDataDir } = require("./organization-service");
const { ROLES } = require("./auth-service");
const { ACTIVE_DIRECTORY_SQL } = require("./membership-status-service");
const { sendEmail, isEmailConfigured } = require("./email-service");
const { getMemberPortalUrl } = require("./report-notification-service");
const { renderMarkdownToSafeHtml, markdownPreviewPlain, escapeHtml } = require("./markdown-lite");
const {
  sanitizeRichHtml,
  htmlToPlainPreview,
  isProbablyHtml,
} = require("./html-sanitize-lite");

const MAX_SUBJECT = 200;
const MAX_BODY = 100000;
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

const ATTACHMENT_MIME = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/msword": ".doc",
};

function ensureMessagingSchema(db = getDb()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coop_message_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      created_by_user_id INTEGER NOT NULL,
      created_by_role TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'selected',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coop_message_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      member_id INTEGER,
      role TEXT NOT NULL,
      last_read_at TEXT,
      UNIQUE(thread_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS coop_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      sender_user_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      sender_member_id INTEGER,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coop_message_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      thread_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_coop_msg_part_user ON coop_message_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_coop_msg_part_thread ON coop_message_participants(thread_id);
    CREATE INDEX IF NOT EXISTS idx_coop_messages_thread ON coop_messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_coop_msg_attach_message ON coop_message_attachments(message_id);
  `);
  const cols = db.prepare(`PRAGMA table_info(coop_messages)`).all().map((c) => c.name);
  if (!cols.includes("body_format")) {
    try {
      db.exec(`ALTER TABLE coop_messages ADD COLUMN body_format TEXT NOT NULL DEFAULT 'markdown'`);
    } catch (_) {
      /* ignore */
    }
  }
}

function messagesUploadDir() {
  const dir = path.join(getOrgDataDir(getOrgSlug()), "uploads", "messages");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeUploadedFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return [];
}

function saveMessageAttachments(messageId, threadId, files = []) {
  const list = normalizeUploadedFiles(files).slice(0, MAX_ATTACHMENTS);
  if (!list.length) return [];
  const db = getDb();
  ensureMessagingSchema(db);
  const dir = messagesUploadDir();
  const insert = db.prepare(
    `INSERT INTO coop_message_attachments
      (message_id, thread_id, original_name, stored_name, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const saved = [];
  for (const file of list) {
    const mime = String(file.mimetype || "").toLowerCase();
    const ext = ATTACHMENT_MIME[mime];
    if (!ext) {
      try {
        fs.unlinkSync(file.path);
      } catch (_) {
        /* ignore */
      }
      const err = new Error(
        "Unsupported attachment type. Use PDF, image (JPG/PNG/WebP/GIF), or Word (.docx)."
      );
      err.status = 400;
      throw err;
    }
    const size = Number(file.size || 0);
    if (size <= 0 || size > MAX_ATTACHMENT_BYTES) {
      try {
        fs.unlinkSync(file.path);
      } catch (_) {
        /* ignore */
      }
      const err = new Error(`Each attachment must be under ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
      err.status = 400;
      throw err;
    }
    const storedName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    const dest = path.join(dir, storedName);
    fs.renameSync(file.path, dest);
    const originalName = String(file.originalname || `attachment${ext}`).slice(0, 180);
    const result = insert.run(messageId, threadId, originalName, storedName, mime, size);
    saved.push({
      id: result.lastInsertRowid,
      originalName,
      mimeType: mime,
      sizeBytes: size,
      viewableInline: mime === "application/pdf" || mime.startsWith("image/"),
    });
  }
  return saved;
}

function listMessageAttachments(messageId) {
  const db = getDb();
  ensureMessagingSchema(db);
  return db
    .prepare(
      `SELECT id, message_id AS messageId, thread_id AS threadId,
              original_name AS originalName, mime_type AS mimeType,
              size_bytes AS sizeBytes
       FROM coop_message_attachments
       WHERE message_id = ?
       ORDER BY id`
    )
    .all(messageId)
    .map((row) => ({
      ...row,
      viewableInline:
        row.mimeType === "application/pdf" || String(row.mimeType || "").startsWith("image/"),
    }));
}

function resolveAttachmentFile(user, attachmentId) {
  const db = getDb();
  ensureMessagingSchema(db);
  const row = db
    .prepare(
      `SELECT id, message_id AS messageId, thread_id AS threadId,
              original_name AS originalName, stored_name AS storedName,
              mime_type AS mimeType, size_bytes AS sizeBytes
       FROM coop_message_attachments
       WHERE id = ?`
    )
    .get(Number(attachmentId));
  if (!row) {
    const err = new Error("Attachment not found");
    err.status = 404;
    throw err;
  }
  requireParticipant(user, row.threadId);
  const absPath = path.join(messagesUploadDir(), row.storedName);
  if (!fs.existsSync(absPath)) {
    const err = new Error("Attachment file missing");
    err.status = 404;
    throw err;
  }
  return { ...row, absPath };
}

function normalizeBodyFormat(value, body) {
  const fmt = String(value || "").toLowerCase().trim();
  // Prefer content detection so HTML stored under the default "markdown"
  // label (older deploys / column default) still renders as rich HTML.
  if (fmt === "plain") return "plain";
  if (fmt === "html" || isProbablyHtml(body)) return "html";
  if (fmt === "markdown") return "markdown";
  return "markdown";
}

function prepareStoredBody(body, bodyFormat, files = []) {
  const format = normalizeBodyFormat(bodyFormat, body);
  const fileCount = normalizeUploadedFiles(files).length;
  let raw = String(body || "").trim();

  if (format === "html") {
    raw = sanitizeRichHtml(raw);
    if (!htmlToPlainPreview(raw, 20) && !fileCount) {
      const err = new Error("Write a message or attach at least one file");
      err.status = 400;
      throw err;
    }
    if (!raw && fileCount) raw = "<p>(See attached file.)</p>";
    return { body: raw.slice(0, MAX_BODY), bodyFormat: "html" };
  }

  if (!raw && !fileCount) {
    const err = new Error("Write a message or attach at least one file");
    err.status = 400;
    throw err;
  }
  if (!raw && fileCount) raw = "(See attached file.)";
  return { body: raw.slice(0, MAX_BODY), bodyFormat: format === "plain" ? "plain" : "markdown" };
}

function formatMessageBody(body, bodyFormat = "markdown") {
  const raw = String(body || "");
  const format = normalizeBodyFormat(bodyFormat, raw);
  if (format === "html") {
    const safe = sanitizeRichHtml(raw);
    return {
      body: safe,
      bodyFormat: "html",
      bodyHtml: safe,
      bodyPreview: htmlToPlainPreview(safe),
    };
  }
  if (format === "plain") {
    return {
      body: raw,
      bodyFormat: "plain",
      bodyHtml: `<p>${escapeHtml(raw).replace(/\n/g, "<br>")}</p>`,
      bodyPreview: markdownPreviewPlain(raw),
    };
  }
  return {
    body: raw,
    bodyFormat: "markdown",
    bodyHtml: renderMarkdownToSafeHtml(raw),
    bodyPreview: markdownPreviewPlain(raw),
  };
}

function trimText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function assertNonEmpty(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    const err = new Error(`${label} is required`);
    err.status = 400;
    throw err;
  }
  return text;
}

function listActiveAdminUsers(db = getDb()) {
  return db
    .prepare(
      `SELECT id AS userId, email, display_name AS displayName
       FROM users
       WHERE role = 'admin' AND active = 1
       ORDER BY id`
    )
    .all();
}

function listMessageableMembers(db = getDb()) {
  return db
    .prepare(
      `SELECT m.id AS memberId,
              u.id AS userId,
              COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS memberName,
              COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), '')) AS email
       FROM members m
       INNER JOIN users u ON u.member_id = m.id AND u.role = 'member' AND u.active = 1
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE ${ACTIVE_DIRECTORY_SQL}
       ORDER BY memberName COLLATE NOCASE`
    )
    .all();
}

function resolveMemberTargets({ audience, memberIds }) {
  const all = listMessageableMembers();
  const byId = new Map(all.map((m) => [m.memberId, m]));
  if (audience === "all") {
    return { audience: "all", members: all };
  }
  const ids = Array.isArray(memberIds)
    ? [...new Set(memberIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (!ids.length) {
    const err = new Error("Select at least one member");
    err.status = 400;
    throw err;
  }
  const members = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      const err = new Error(`Member ${id} is not available for messaging`);
      err.status = 400;
      throw err;
    }
    members.push(row);
  }
  return {
    audience: members.length === 1 ? "direct" : "selected",
    members,
  };
}

function insertParticipant(db, { threadId, userId, memberId = null, role, lastReadAt = null }) {
  db.prepare(
    `INSERT OR IGNORE INTO coop_message_participants
      (thread_id, user_id, member_id, role, last_read_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(threadId, userId, memberId, role, lastReadAt);
}

function addAdminParticipants(db, threadId, { markReadForUserId = null } = {}) {
  for (const admin of listActiveAdminUsers(db)) {
    insertParticipant(db, {
      threadId,
      userId: admin.userId,
      memberId: null,
      role: ROLES.ADMIN,
      lastReadAt: markReadForUserId === admin.userId ? new Date().toISOString() : null,
    });
  }
}

function senderDisplayName(user) {
  if (!user) return "Cooperative";
  if (user.role === ROLES.MEMBER) {
    return user.displayName || user.username || "Member";
  }
  return user.displayName || "Cooperative Admin";
}

function queueNewMessageEmails({ thread, messagePreview, recipientUserIds, senderUserId }) {
  if (!isEmailConfigured()) return { queued: false, reason: "email_not_configured" };
  const db = getDb();
  const portalUrl = getMemberPortalUrl();
  const subject = `New Message: ${thread.subject}`;
  const preview = trimText(messagePreview, 280);
  let sent = 0;
  let failed = 0;

  for (const userId of recipientUserIds) {
    if (userId === senderUserId) continue;
    const row = db
      .prepare(
        `SELECT u.id AS userId, u.role, u.email AS userEmail, u.member_id AS memberId,
                COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), '')) AS email,
                COALESCE(NULLIF(TRIM(mp.display_name), ''), u.display_name, u.username) AS name
         FROM users u
         LEFT JOIN member_profiles mp ON mp.member_id = u.member_id
         WHERE u.id = ? AND u.active = 1`
      )
      .get(userId);
    const email = String(row?.email || row?.userEmail || "").trim();
    if (!email) continue;
    const text = [
      `Hello ${row.name || ""},`,
      "",
      `You have a new message in your Cooperative portal.`,
      "",
      `Subject: ${thread.subject}`,
      "",
      preview,
      "",
      `Sign in to read and reply: ${portalUrl}`,
      "",
    ].join("\n");
    const html = `
      <p>Hello ${escapeHtml(row.name || "")},</p>
      <p>You have a new message in your Cooperative portal.</p>
      <p><strong>Subject:</strong> ${escapeHtml(thread.subject)}</p>
      <p>${escapeHtml(preview).replace(/\n/g, "<br>")}</p>
      <p><a href="${escapeHtml(portalUrl)}">Sign In to the Member Portal</a></p>
    `;
    sendEmail({ to: email, subject, text, html }).then(
      () => {
        sent += 1;
      },
      () => {
        failed += 1;
      }
    );
  }
  return { queued: true, sent, failed };
}

function createAdminThread(
  user,
  { subject, body, bodyFormat = "html", audience = "selected", memberIds = [], files = [] } = {}
) {
  if (user?.role !== ROLES.ADMIN) {
    const err = new Error("Administrator access required");
    err.status = 403;
    throw err;
  }
  const db = getDb();
  ensureMessagingSchema(db);
  const cleanSubject = trimText(assertNonEmpty(subject, "Subject"), MAX_SUBJECT);
  const prepared = prepareStoredBody(body, bodyFormat, files);
  const targets = resolveMemberTargets({ audience, memberIds });
  if (!targets.members.length) {
    const err = new Error(
      "No members with portal logins are available. Create member portal accounts first."
    );
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const insert = db
    .prepare(
      `INSERT INTO coop_message_threads
        (subject, created_by_user_id, created_by_role, audience, created_at, updated_at)
       VALUES (?, ?, 'admin', ?, ?, ?)`
    )
    .run(cleanSubject, user.id, targets.audience, now, now);
  const threadId = insert.lastInsertRowid;

  addAdminParticipants(db, threadId, { markReadForUserId: user.id });
  for (const member of targets.members) {
    insertParticipant(db, {
      threadId,
      userId: member.userId,
      memberId: member.memberId,
      role: ROLES.MEMBER,
      lastReadAt: null,
    });
  }

  const msg = db
    .prepare(
      `INSERT INTO coop_messages
        (thread_id, sender_user_id, sender_role, sender_member_id, body, body_format, created_at)
       VALUES (?, ?, 'admin', NULL, ?, ?, ?)`
    )
    .run(threadId, user.id, prepared.body, prepared.bodyFormat, now);
  saveMessageAttachments(msg.lastInsertRowid, threadId, files);

  const thread = getThreadRow(threadId);
  const recipientUserIds = targets.members.map((m) => m.userId);
  const preview = formatMessageBody(prepared.body, prepared.bodyFormat).bodyPreview;
  queueNewMessageEmails({
    thread,
    messagePreview: preview,
    recipientUserIds,
    senderUserId: user.id,
  });

  return getThreadDetail(user, threadId);
}

function createMemberThread(user, { subject, body, bodyFormat = "markdown", files = [] } = {}) {
  if (user?.role !== ROLES.MEMBER || !user.memberId) {
    const err = new Error("Member account required");
    err.status = 403;
    throw err;
  }
  const { assertActiveDirectoryMember } = require("./membership-status-service");
  assertActiveDirectoryMember(user.memberId, { action: "Messaging" });

  const db = getDb();
  ensureMessagingSchema(db);
  const admins = listActiveAdminUsers(db);
  if (!admins.length) {
    const err = new Error("No Cooperative administrator is available to receive messages");
    err.status = 400;
    throw err;
  }

  const cleanSubject = trimText(assertNonEmpty(subject, "Subject"), MAX_SUBJECT);
  const prepared = prepareStoredBody(body, bodyFormat, files);
  const now = new Date().toISOString();
  const insert = db
    .prepare(
      `INSERT INTO coop_message_threads
        (subject, created_by_user_id, created_by_role, audience, created_at, updated_at)
       VALUES (?, ?, 'member', 'direct', ?, ?)`
    )
    .run(cleanSubject, user.id, now, now);
  const threadId = insert.lastInsertRowid;

  addAdminParticipants(db, threadId);
  insertParticipant(db, {
    threadId,
    userId: user.id,
    memberId: user.memberId,
    role: ROLES.MEMBER,
    lastReadAt: now,
  });

  const msg = db
    .prepare(
      `INSERT INTO coop_messages
        (thread_id, sender_user_id, sender_role, sender_member_id, body, body_format, created_at)
       VALUES (?, ?, 'member', ?, ?, ?, ?)`
    )
    .run(threadId, user.id, user.memberId, prepared.body, prepared.bodyFormat, now);
  saveMessageAttachments(msg.lastInsertRowid, threadId, files);

  const thread = getThreadRow(threadId);
  queueNewMessageEmails({
    thread,
    messagePreview: formatMessageBody(prepared.body, prepared.bodyFormat).bodyPreview,
    recipientUserIds: admins.map((a) => a.userId),
    senderUserId: user.id,
  });

  return getThreadDetail(user, threadId);
}

function getThreadRow(threadId) {
  const db = getDb();
  ensureMessagingSchema(db);
  return db.prepare(`SELECT * FROM coop_message_threads WHERE id = ?`).get(threadId);
}

function getParticipant(threadId, userId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM coop_message_participants WHERE thread_id = ? AND user_id = ?`
    )
    .get(threadId, userId);
}

function requireParticipant(user, threadId) {
  const thread = getThreadRow(threadId);
  if (!thread) {
    const err = new Error("Message not found");
    err.status = 404;
    throw err;
  }
  const participant = getParticipant(threadId, user.id);
  if (!participant) {
    const err = new Error("You are not a participant in this conversation");
    err.status = 403;
    throw err;
  }
  return { thread, participant };
}

function countUnreadForParticipant(participant) {
  const db = getDb();
  if (!participant) return 0;
  if (participant.last_read_at) {
    return db
      .prepare(
        `SELECT COUNT(*) AS count FROM coop_messages
         WHERE thread_id = ?
           AND sender_user_id != ?
           AND created_at > ?`
      )
      .get(participant.thread_id, participant.user_id, participant.last_read_at).count;
  }
  return db
    .prepare(
      `SELECT COUNT(*) AS count FROM coop_messages
       WHERE thread_id = ? AND sender_user_id != ?`
    )
    .get(participant.thread_id, participant.user_id).count;
}

function listInbox(user) {
  const db = getDb();
  ensureMessagingSchema(db);
  const rows = db
    .prepare(
      `SELECT t.id, t.subject, t.audience, t.created_by_role, t.created_at, t.updated_at,
              p.last_read_at AS lastReadAt,
              (SELECT body FROM coop_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS lastBody,
              (SELECT created_at FROM coop_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS lastMessageAt,
              (SELECT sender_role FROM coop_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS lastSenderRole,
              (SELECT COUNT(*) FROM coop_message_participants mp
                WHERE mp.thread_id = t.id AND mp.role = 'member') AS memberCount
       FROM coop_message_threads t
       INNER JOIN coop_message_participants p ON p.thread_id = t.id AND p.user_id = ?
       ORDER BY COALESCE(t.updated_at, t.created_at) DESC, t.id DESC`
    )
    .all(user.id);

  return rows.map((row) => {
    const participant = {
      thread_id: row.id,
      user_id: user.id,
      last_read_at: row.lastReadAt,
    };
    const unreadCount = countUnreadForParticipant(participant);
    return {
      id: row.id,
      subject: row.subject,
      audience: row.audience,
      createdByRole: row.created_by_role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastBody: htmlToPlainPreview(row.lastBody || "") || markdownPreviewPlain(row.lastBody || ""),
      lastMessageAt: row.lastMessageAt || row.updated_at,
      lastSenderRole: row.lastSenderRole || null,
      memberCount: row.memberCount || 0,
      unreadCount,
      hasUnread: unreadCount > 0,
    };
  });
}

function getUnreadSummary(user) {
  const inbox = listInbox(user);
  const unreadThreads = inbox.filter((t) => t.hasUnread).length;
  const unreadMessages = inbox.reduce((sum, t) => sum + t.unreadCount, 0);
  return { unreadThreads, unreadMessages, hasUnread: unreadMessages > 0 };
}

function markThreadRead(user, threadId) {
  const db = getDb();
  ensureMessagingSchema(db);
  requireParticipant(user, threadId);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE coop_message_participants SET last_read_at = ? WHERE thread_id = ? AND user_id = ?`
  ).run(now, threadId, user.id);
}

function listThreadMessages(threadId) {
  const db = getDb();
  ensureMessagingSchema(db);
  const rows = db
    .prepare(
      `SELECT m.id, m.thread_id AS threadId, m.sender_user_id AS senderUserId,
              m.sender_role AS senderRole, m.sender_member_id AS senderMemberId,
              m.body, COALESCE(m.body_format, 'markdown') AS bodyFormat,
              m.created_at AS createdAt,
              COALESCE(
                NULLIF(TRIM(mp.display_name), ''),
                NULLIF(TRIM(mem.name), ''),
                NULLIF(TRIM(u.display_name), ''),
                u.username,
                CASE WHEN m.sender_role = 'admin' THEN 'Cooperative Admin' ELSE 'Member' END
              ) AS senderName
       FROM coop_messages m
       LEFT JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN members mem ON mem.id = m.sender_member_id
       LEFT JOIN member_profiles mp ON mp.member_id = m.sender_member_id
       WHERE m.thread_id = ?
       ORDER BY m.created_at ASC, m.id ASC`
    )
    .all(threadId);

  return rows.map((row) => {
    const formatted = formatMessageBody(row.body, row.bodyFormat);
    return {
      id: row.id,
      threadId: row.threadId,
      senderUserId: row.senderUserId,
      senderRole: row.senderRole,
      senderMemberId: row.senderMemberId,
      senderName: row.senderName,
      body: formatted.body,
      bodyFormat: formatted.bodyFormat,
      bodyHtml: formatted.bodyHtml,
      createdAt: row.createdAt,
      attachments: listMessageAttachments(row.id),
    };
  });
}

function listThreadParticipants(threadId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT p.user_id AS userId, p.member_id AS memberId, p.role,
              COALESCE(
                NULLIF(TRIM(mp.display_name), ''),
                NULLIF(TRIM(m.name), ''),
                NULLIF(TRIM(u.display_name), ''),
                u.username,
                CASE WHEN p.role = 'admin' THEN 'Cooperative Admin' ELSE 'Member' END
              ) AS displayName
       FROM coop_message_participants p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN members m ON m.id = p.member_id
       LEFT JOIN member_profiles mp ON mp.member_id = p.member_id
       WHERE p.thread_id = ?
       ORDER BY p.role DESC, displayName COLLATE NOCASE`
    )
    .all(threadId);
}

function getThreadDetail(user, threadId) {
  const { thread } = requireParticipant(user, threadId);
  markThreadRead(user, threadId);
  return {
    id: thread.id,
    subject: thread.subject,
    audience: thread.audience,
    createdByRole: thread.created_by_role,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    participants: listThreadParticipants(thread.id),
    messages: listThreadMessages(thread.id),
    unread: getUnreadSummary(user),
  };
}

function replyToThread(user, threadId, { body, bodyFormat, files = [] } = {}) {
  const db = getDb();
  ensureMessagingSchema(db);
  const { thread } = requireParticipant(user, threadId);
  if (user.role === ROLES.MEMBER) {
    const { assertActiveDirectoryMember } = require("./membership-status-service");
    assertActiveDirectoryMember(user.memberId, { action: "Messaging" });
  }
  if (user.role === ROLES.STAFF) {
    const err = new Error("Staff accounts are read-only");
    err.status = 403;
    throw err;
  }
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.MEMBER) {
    const err = new Error("Access denied");
    err.status = 403;
    throw err;
  }

  const preferredFormat =
    bodyFormat || (user.role === ROLES.ADMIN ? "html" : "markdown");
  const prepared = prepareStoredBody(body, preferredFormat, files);
  const now = new Date().toISOString();
  const msg = db
    .prepare(
      `INSERT INTO coop_messages
        (thread_id, sender_user_id, sender_role, sender_member_id, body, body_format, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      threadId,
      user.id,
      user.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.MEMBER,
      user.role === ROLES.MEMBER ? user.memberId : null,
      prepared.body,
      prepared.bodyFormat,
      now
    );
  if (user.role === ROLES.ADMIN) {
    saveMessageAttachments(msg.lastInsertRowid, threadId, files);
  }
  db.prepare(`UPDATE coop_message_threads SET updated_at = ? WHERE id = ?`).run(now, threadId);
  db.prepare(
    `UPDATE coop_message_participants SET last_read_at = ? WHERE thread_id = ? AND user_id = ?`
  ).run(now, threadId, user.id);

  const others = db
    .prepare(
      `SELECT user_id AS userId FROM coop_message_participants
       WHERE thread_id = ? AND user_id != ?`
    )
    .all(threadId, user.id)
    .map((r) => r.userId);

  queueNewMessageEmails({
    thread,
    messagePreview: formatMessageBody(prepared.body, prepared.bodyFormat).bodyPreview,
    recipientUserIds: others,
    senderUserId: user.id,
  });

  return getThreadDetail(user, threadId);
}

function listRecipientOptions() {
  ensureMessagingSchema();
  return {
    members: listMessageableMembers().map((m) => ({
      memberId: m.memberId,
      userId: m.userId,
      memberName: m.memberName,
      email: m.email || null,
    })),
    adminCount: listActiveAdminUsers().length,
  };
}

module.exports = {
  ensureMessagingSchema,
  listRecipientOptions,
  createAdminThread,
  createMemberThread,
  listInbox,
  getUnreadSummary,
  getThreadDetail,
  replyToThread,
  markThreadRead,
  resolveAttachmentFile,
  formatMessageBody,
  senderDisplayName,
  MAX_SUBJECT,
  MAX_BODY,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  ATTACHMENT_MIME,
};
