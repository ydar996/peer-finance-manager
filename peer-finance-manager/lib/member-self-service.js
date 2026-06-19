const fs = require("fs");
const path = require("path");
const { getDb, DATA_DIR } = require("../db/database");

const PHOTO_MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function memberPhotosDir() {
  const dir = path.join(DATA_DIR, "uploads", "photos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureMemberProfileRow(db, memberId) {
  const existing = db
    .prepare(`SELECT id FROM member_profiles WHERE member_id = ?`)
    .get(memberId);
  if (existing) return;

  const member = db.prepare(`SELECT name FROM members WHERE id = ?`).get(memberId);
  db.prepare(
    `INSERT INTO member_profiles (
       member_id, display_name, preferred_payment_method,
       cooperative_account_status, application_source, updated_at
     ) VALUES (?, ?, 'Zelle', 'active', 'Member portal', datetime('now'))`
  ).run(memberId, member?.name || null);
}

function memberPhotoApiPath(memberId) {
  return `/api/members/${memberId}/photo`;
}

function resolveMemberPhotoFile(memberId) {
  const dir = memberPhotosDir();
  const prefix = `member-${memberId}`;
  for (const ext of Object.values(PHOTO_MIME_EXT)) {
    const filePath = path.join(dir, `${prefix}${ext}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function saveMemberPhotoUpload(memberId, uploadedFile) {
  if (!uploadedFile?.path) throw new Error("No photo file uploaded");

  const mime = String(uploadedFile.mimetype || "").toLowerCase();
  const ext = PHOTO_MIME_EXT[mime];
  if (!ext) {
    throw new Error("Photo must be JPEG, PNG, WebP, or GIF");
  }

  const db = getDb();
  const member = db.prepare(`SELECT id FROM members WHERE id = ?`).get(memberId);
  if (!member) throw new Error("Member not found");

  ensureMemberProfileRow(db, memberId);

  const dir = memberPhotosDir();
  const dest = path.join(dir, `member-${memberId}${ext}`);

  for (const otherExt of Object.values(PHOTO_MIME_EXT)) {
    const candidate = path.join(dir, `member-${memberId}${otherExt}`);
    if (fs.existsSync(candidate) && candidate !== dest) {
      fs.unlinkSync(candidate);
    }
  }

  fs.copyFileSync(uploadedFile.path, dest);
  try {
    fs.unlinkSync(uploadedFile.path);
  } catch {
    /* ignore temp cleanup */
  }

  const photoPath = memberPhotoApiPath(memberId);
  db.prepare(
    `UPDATE member_profiles
     SET photo_path = ?, updated_at = datetime('now')
     WHERE member_id = ?`
  ).run(photoPath, memberId);

  return { photoPath, memberId };
}

function updateMemberEmergencyContact(memberId, payload = {}) {
  const db = getDb();
  const member = db.prepare(`SELECT id FROM members WHERE id = ?`).get(memberId);
  if (!member) throw new Error("Member not found");

  ensureMemberProfileRow(db, memberId);

  const firstName = payload.emergencyFirstName?.trim() || null;
  const lastName = payload.emergencyLastName?.trim() || null;
  const email = payload.emergencyEmail?.trim() || null;
  const phone = payload.emergencyPhone?.trim() || null;
  const relationship = payload.emergencyRelationship?.trim() || null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Emergency contact email is not valid");
  }

  db.prepare(
    `UPDATE member_profiles SET
       next_of_kin_first_name = ?,
       next_of_kin_last_name = ?,
       next_of_kin_email = ?,
       next_of_kin_phone = ?,
       next_of_kin_relationship = COALESCE(?, next_of_kin_relationship),
       updated_at = datetime('now')
     WHERE member_id = ?`
  ).run(firstName, lastName, email, phone, relationship, memberId);

  return { memberId };
}

module.exports = {
  saveMemberPhotoUpload,
  updateMemberEmergencyContact,
  resolveMemberPhotoFile,
  memberPhotoApiPath,
};
