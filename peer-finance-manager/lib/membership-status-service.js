/**
 * Membership account status (all tenants).
 * Bylaws-aligned cessation types: resigned, deceased, expelled, suspended.
 * Former members stay in the DB/ledger but leave the active directory and email lists.
 * Optional resignation/termination document: PDF or image on the member profile.
 */
const fs = require("fs");
const path = require("path");
const { getDb, DATA_DIR } = require("../db/database");

const DOCUMENT_MIME_EXT = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const ACCOUNT_STATUS = {
  ACTIVE: "active",
  PENDING_APPROVAL: "pending_approval",
  RESIGNED: "resigned",
  DECEASED: "deceased",
  EXPELLED: "expelled",
  SUSPENDED: "suspended",
};

const CESSATION_STATUSES = [
  ACCOUNT_STATUS.RESIGNED,
  ACCOUNT_STATUS.DECEASED,
  ACCOUNT_STATUS.EXPELLED,
  ACCOUNT_STATUS.SUSPENDED,
];

const ADMIN_SELECTABLE_STATUSES = [
  ACCOUNT_STATUS.ACTIVE,
  ...CESSATION_STATUSES,
];

const STATUS_LABELS = {
  [ACCOUNT_STATUS.ACTIVE]: "Active",
  [ACCOUNT_STATUS.PENDING_APPROVAL]: "Pending Approval",
  [ACCOUNT_STATUS.RESIGNED]: "Resigned",
  [ACCOUNT_STATUS.DECEASED]: "Deceased",
  [ACCOUNT_STATUS.EXPELLED]: "Expelled",
  [ACCOUNT_STATUS.SUSPENDED]: "Suspended",
};

/** SQL: active directory only (default Members & Accounts list). */
const ACTIVE_DIRECTORY_SQL =
  "(mp.cooperative_account_status IS NULL OR mp.cooperative_account_status = 'active')";

/** SQL: active + former (exclude pending applicants). */
const NON_PENDING_SQL =
  "(mp.cooperative_account_status IS NULL OR mp.cooperative_account_status != 'pending_approval')";

/** SQL: eligible for Cooperative member emails. */
const EMAIL_ELIGIBLE_SQL = ACTIVE_DIRECTORY_SQL;

function normalizeAccountStatus(status) {
  const raw = String(status || ACCOUNT_STATUS.ACTIVE)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!raw) return ACCOUNT_STATUS.ACTIVE;
  if (Object.values(ACCOUNT_STATUS).includes(raw)) return raw;
  return null;
}

function formatAccountStatusLabel(status) {
  const normalized = normalizeAccountStatus(status) || ACCOUNT_STATUS.ACTIVE;
  return STATUS_LABELS[normalized] || normalized;
}

function isActiveDirectoryStatus(status) {
  const normalized = normalizeAccountStatus(status);
  return normalized === ACCOUNT_STATUS.ACTIVE;
}

function isCessationStatus(status) {
  const normalized = normalizeAccountStatus(status);
  return CESSATION_STATUSES.includes(normalized);
}

function isEmailEligibleStatus(status) {
  return isActiveDirectoryStatus(status);
}

function listAdminStatusOptions() {
  return ADMIN_SELECTABLE_STATUSES.map((value) => ({
    value,
    label: STATUS_LABELS[value],
  }));
}

function ensureMembershipStatusColumns(db = getDb()) {
  const cols = db.prepare(`PRAGMA table_info(member_profiles)`).all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("membership_status_changed_at")) {
    db.exec(
      `ALTER TABLE member_profiles ADD COLUMN membership_status_changed_at TEXT`
    );
  }
  if (!names.has("membership_status_note")) {
    db.exec(`ALTER TABLE member_profiles ADD COLUMN membership_status_note TEXT`);
  }
  if (!names.has("membership_status_document_path")) {
    db.exec(
      `ALTER TABLE member_profiles ADD COLUMN membership_status_document_path TEXT`
    );
  }
  if (!names.has("membership_status_document_name")) {
    db.exec(
      `ALTER TABLE member_profiles ADD COLUMN membership_status_document_name TEXT`
    );
  }
  if (!names.has("membership_status_document_mime")) {
    db.exec(
      `ALTER TABLE member_profiles ADD COLUMN membership_status_document_mime TEXT`
    );
  }
}

function membershipStatusDocsDir() {
  const dir = path.join(DATA_DIR, "uploads", "membership-status");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function membershipStatusDocumentApiPath(memberId) {
  return `/api/members/${memberId}/account-status/document`;
}

function resolveMembershipStatusDocumentFile(memberId) {
  const dir = membershipStatusDocsDir();
  const prefix = `member-${memberId}-status`;
  for (const ext of Object.values(DOCUMENT_MIME_EXT)) {
    const filePath = path.join(dir, `${prefix}${ext}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function clearMembershipStatusDocumentFiles(memberId, keepPath = null) {
  const dir = membershipStatusDocsDir();
  const prefix = `member-${memberId}-status`;
  for (const ext of Object.values(DOCUMENT_MIME_EXT)) {
    const candidate = path.join(dir, `${prefix}${ext}`);
    if (fs.existsSync(candidate) && candidate !== keepPath) {
      try {
        fs.unlinkSync(candidate);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Save PDF or image of resignation / termination notice for a member.
 */
function saveMembershipStatusDocument(memberId, uploadedFile) {
  if (!uploadedFile?.path) throw new Error("No document file uploaded");

  const mime = String(uploadedFile.mimetype || "").toLowerCase();
  const ext = DOCUMENT_MIME_EXT[mime];
  if (!ext) {
    throw new Error("Document must be PDF, JPEG, PNG, WebP, or GIF");
  }

  const db = getDb();
  ensureMembershipStatusColumns(db);
  const member = db.prepare(`SELECT id, name FROM members WHERE id = ?`).get(memberId);
  if (!member) throw new Error("Member not found");

  const existing = db
    .prepare(`SELECT id FROM member_profiles WHERE member_id = ?`)
    .get(memberId);
  if (!existing) {
    db.prepare(
      `INSERT INTO member_profiles (
         member_id, display_name, cooperative_account_status,
         preferred_payment_method, application_source, updated_at
       ) VALUES (?, ?, 'active', 'Zelle', 'Manual entry', datetime('now'))`
    ).run(memberId, member.name);
  }

  const dir = membershipStatusDocsDir();
  const dest = path.join(dir, `member-${memberId}-status${ext}`);
  clearMembershipStatusDocumentFiles(memberId, dest);
  fs.copyFileSync(uploadedFile.path, dest);
  try {
    fs.unlinkSync(uploadedFile.path);
  } catch {
    /* ignore temp cleanup */
  }

  const originalName = path.basename(String(uploadedFile.originalname || `status${ext}`));
  const documentPath = membershipStatusDocumentApiPath(memberId);
  db.prepare(
    `UPDATE member_profiles
     SET membership_status_document_path = ?,
         membership_status_document_name = ?,
         membership_status_document_mime = ?,
         updated_at = datetime('now')
     WHERE member_id = ?`
  ).run(documentPath, originalName, mime, memberId);

  return {
    memberId,
    documentPath,
    documentName: originalName,
    documentMime: mime,
  };
}

function getMemberAccountStatus(memberId, db = getDb()) {
  ensureMembershipStatusColumns(db);
  const row = db
    .prepare(
      `SELECT cooperative_account_status AS status,
              membership_status_changed_at AS changedAt,
              membership_status_note AS note,
              membership_status_document_path AS documentPath,
              membership_status_document_name AS documentName,
              membership_status_document_mime AS documentMime
       FROM member_profiles WHERE member_id = ?`
    )
    .get(memberId);
  return {
    status: normalizeAccountStatus(row?.status) || ACCOUNT_STATUS.ACTIVE,
    changedAt: row?.changedAt || null,
    note: row?.note || null,
    documentPath: row?.documentPath || null,
    documentName: row?.documentName || null,
    documentMime: row?.documentMime || null,
  };
}

function setMemberPortalLoginActive(db, memberId, active) {
  db.prepare(
    `UPDATE users SET active = ? WHERE member_id = ? AND role = 'member'`
  ).run(active ? 1 : 0, memberId);
}

/**
 * Block member benefits for former/pending statuses.
 * Use for portal, emails, statements, new loans, distributions, contributions, etc.
 * Do not use for bank-import matching, withdrawals, or loan repayments on existing debt.
 */
function assertActiveDirectoryMember(
  memberId,
  { action = "This action", allowMissingProfile = false } = {}
) {
  const db = getDb();
  const member = db.prepare(`SELECT id FROM members WHERE id = ?`).get(memberId);
  if (!member) throw new Error("Member not found");

  ensureMembershipStatusColumns(db);
  const row = db
    .prepare(
      `SELECT cooperative_account_status AS status FROM member_profiles WHERE member_id = ?`
    )
    .get(memberId);

  if (!row && allowMissingProfile) {
    return { status: ACCOUNT_STATUS.ACTIVE };
  }

  const status = normalizeAccountStatus(row?.status) || ACCOUNT_STATUS.ACTIVE;
  if (!isActiveDirectoryStatus(status)) {
    throw new Error(
      `${action} is only available to active members. This membership is ${formatAccountStatusLabel(status)}.`
    );
  }
  return { status };
}

function listActiveDirectoryMembers() {
  const db = getDb();
  ensureMembershipStatusColumns(db);
  return db
    .prepare(
      `SELECT m.id, m.name, m.member_number, mp.email, mp.display_name,
              mp.cooperative_account_status
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE ${ACTIVE_DIRECTORY_SQL}
       ORDER BY m.name`
    )
    .all();
}

/**
 * Set membership account status by type. Does not delete the member or ledger rows.
 */
function setMemberAccountStatus(
  memberId,
  { status, effectiveDate = null, note = null } = {}
) {
  const db = getDb();
  ensureMembershipStatusColumns(db);

  const member = db.prepare(`SELECT id, name FROM members WHERE id = ?`).get(memberId);
  if (!member) throw new Error("Member not found");

  const nextStatus = normalizeAccountStatus(status);
  if (!nextStatus || !ADMIN_SELECTABLE_STATUSES.includes(nextStatus)) {
    throw new Error(
      "Select a membership status type: Active, Resigned, Deceased, Expelled, or Suspended."
    );
  }
  if (nextStatus === ACCOUNT_STATUS.PENDING_APPROVAL) {
    throw new Error("Pending Approval is set only through membership applications.");
  }

  const existing = db
    .prepare(`SELECT * FROM member_profiles WHERE member_id = ?`)
    .get(memberId);

  const changedAt =
    effectiveDate && String(effectiveDate).trim()
      ? String(effectiveDate).trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const statusNote = note != null ? String(note).trim() || null : null;

  if (!existing) {
    db.prepare(
      `INSERT INTO member_profiles (
         member_id, display_name, cooperative_account_status,
         membership_status_changed_at, membership_status_note, updated_at
       ) VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(memberId, member.name, nextStatus, changedAt, statusNote);
  } else {
    db.prepare(
      `UPDATE member_profiles
       SET cooperative_account_status = ?,
           membership_status_changed_at = ?,
           membership_status_note = COALESCE(?, membership_status_note),
           updated_at = datetime('now')
       WHERE member_id = ?`
    ).run(nextStatus, changedAt, statusNote, memberId);
  }

  // Former / ceased members lose portal login; reactivation restores it.
  setMemberPortalLoginActive(db, memberId, nextStatus === ACCOUNT_STATUS.ACTIVE);

  const refreshed = getMemberAccountStatus(memberId, db);
  return {
    memberId,
    status: nextStatus,
    label: formatAccountStatusLabel(nextStatus),
    changedAt,
    note: statusNote ?? existing?.membership_status_note ?? null,
    documentPath: refreshed.documentPath,
    documentName: refreshed.documentName,
    documentMime: refreshed.documentMime,
    directoryListed: isActiveDirectoryStatus(nextStatus),
    emailEligible: isEmailEligibleStatus(nextStatus),
  };
}

module.exports = {
  ACCOUNT_STATUS,
  CESSATION_STATUSES,
  ADMIN_SELECTABLE_STATUSES,
  STATUS_LABELS,
  DOCUMENT_MIME_EXT,
  ACTIVE_DIRECTORY_SQL,
  NON_PENDING_SQL,
  EMAIL_ELIGIBLE_SQL,
  normalizeAccountStatus,
  formatAccountStatusLabel,
  isActiveDirectoryStatus,
  isCessationStatus,
  isEmailEligibleStatus,
  listAdminStatusOptions,
  ensureMembershipStatusColumns,
  getMemberAccountStatus,
  setMemberAccountStatus,
  assertActiveDirectoryMember,
  listActiveDirectoryMembers,
  saveMembershipStatusDocument,
  resolveMembershipStatusDocumentFile,
  membershipStatusDocumentApiPath,
};
