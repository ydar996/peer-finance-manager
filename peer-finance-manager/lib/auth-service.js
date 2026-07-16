const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getDb } = require("../db/database");
const { runWithOrg, getOrgSlug } = require("./org-context");
const {
  getRegistryDb,
  getOrganization,
  organizationExists,
  registerOrganization,
  updateOrganizationAdminEmail,
  normalizeSlug,
  ASSURANCE_SLUG,
  ASSURANCE_NAME,
} = require("./organization-service");

const ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
  MEMBER: "member",
};

const PORTALS = {
  ADMIN: "admin",
  STAFF: "staff",
  MEMBER: "member",
};

const ASSURANCE_ADMIN_EMAIL = "yinka@eworkchop.com";
const SESSION_DAYS = 7;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts[0] !== "scrypt" || parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(expected, actual);
}

function sessionExpiryIso() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d.toISOString();
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function mapUser(row, organization) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username || null,
    role: row.role,
    memberId: row.member_id,
    displayName: row.display_name || row.member_name || row.username || row.email,
    mustChangePassword: Boolean(row.must_change_password),
    active: Boolean(row.active),
    organizationSlug: organization?.slug || null,
    organizationName: organization?.name || null,
  };
}

function getUserRowByIdentifier(identifier) {
  const db = getDb();
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;
  const email = normalizeEmail(normalized);
  const username = normalizeUsername(normalized);
  return db
    .prepare(
      `SELECT u.*, m.name AS member_name
       FROM users u
       LEFT JOIN members m ON m.id = u.member_id
       WHERE u.active = 1
         AND (lower(u.email) = lower(?) OR lower(u.username) = lower(?))`
    )
    .get(email, username);
}

function getUserByEmail(email) {
  const row = getUserRowByIdentifier(email);
  return mapUser(row);
}

function getUserById(id, organization) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, m.name AS member_name
       FROM users u
       LEFT JOIN members m ON m.id = u.member_id
       WHERE u.id = ? AND u.active = 1`
    )
    .get(id);
  return mapUser(row, organization);
}

function getSession(token) {
  if (!token) return null;
  const registry = getRegistryDb();
  const session = registry
    .prepare(`SELECT id, organization_slug, user_id, expires_at FROM sessions WHERE id = ?`)
    .get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    registry.prepare(`DELETE FROM sessions WHERE id = ?`).run(token);
    return null;
  }
  const organization = getOrganization(session.organization_slug);
  if (!organization) return null;

  const user = runWithOrg(session.organization_slug, () =>
    getUserById(session.user_id, organization)
  );
  if (!user) return null;

  return {
    token: session.id,
    organizationSlug: organization.slug,
    organizationName: organization.name,
    user,
  };
}

function portalAllowsUser(portal, user) {
  if (!portal || !user) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (portal === PORTALS.ADMIN) return user.role === ROLES.ADMIN;
  if (portal === PORTALS.STAFF) return user.role === ROLES.STAFF;
  if (portal === PORTALS.MEMBER) return user.role === ROLES.MEMBER;
  return false;
}

function login(identifier, password, portal = PORTALS.MEMBER, organizationSlug) {
  const slug = normalizeSlug(organizationSlug);
  if (!slug) throw new Error("Organization code is required");
  if (!organizationExists(slug)) throw new Error("Organization not found");

  return runWithOrg(slug, () => {
    const organization = getOrganization(slug);
    const row = getUserRowByIdentifier(identifier);
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new Error("Invalid username or password");
    }
    const user = mapUser(row, organization);
    if (!portalAllowsUser(portal, user)) {
      throw new Error("This account cannot sign in on this page");
    }
    if (user.role === ROLES.MEMBER && user.memberId) {
      const { getMemberAccountStatus, isActiveDirectoryStatus } = require(
        "./membership-status-service"
      );
      const account = getMemberAccountStatus(user.memberId);
      if (!isActiveDirectoryStatus(account.status)) {
        throw new Error(
          "This membership is no longer active. Contact your Cooperative administrator."
        );
      }
    }
    const token = createSessionToken();
    getRegistryDb()
      .prepare(
        `INSERT INTO sessions (id, organization_slug, user_id, expires_at) VALUES (?, ?, ?, ?)`
      )
      .run(token, slug, row.id, sessionExpiryIso());
    return { token, user, mustChangePassword: user.mustChangePassword, organization };
  });
}

function logout(token) {
  if (!token) return;
  getRegistryDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(token);
}

function changePassword(userId, currentPassword, newPassword) {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, password_hash FROM users WHERE id = ? AND active = 1`)
    .get(userId);
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    throw new Error("Current password is incorrect");
  }
  if (!newPassword || String(newPassword).length < 8) {
    throw new Error("New password must be at least 8 characters");
  }
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`
  ).run(hashPassword(newPassword), userId);
  return getUserById(userId, getOrganization(getOrgSlug()));
}

function ensureAssuranceAdminUser() {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id, role FROM users WHERE lower(email) = lower(?)`)
    .get(ASSURANCE_ADMIN_EMAIL);

  if (existing) {
    db.prepare(
      `UPDATE users
       SET role = 'admin', active = 1, display_name = 'Administrator', must_change_password = 0
       WHERE id = ?`
    ).run(existing.id);
  } else {
    db.prepare(
      `INSERT INTO users (email, password_hash, role, display_name, active, must_change_password)
       VALUES (?, ?, 'admin', 'Administrator', 1, 0)`
    ).run(ASSURANCE_ADMIN_EMAIL, hashPassword("123456789"));
  }

  db.prepare(
    `UPDATE users SET role = 'staff'
     WHERE role = 'admin' AND lower(email) != lower(?)`
  ).run(ASSURANCE_ADMIN_EMAIL);
}

function registerOrganizationWithAdmin({
  name,
  slug,
  adminEmail,
  adminPassword,
  adminDisplayName,
}) {
  const normalizedEmail = normalizeEmail(adminEmail);
  if (!normalizedEmail) throw new Error("Administrator email is required");
  if (!adminPassword || String(adminPassword).length < 8) {
    throw new Error("Administrator password must be at least 8 characters");
  }

  const organization = registerOrganization({ name, slug });
  updateOrganizationAdminEmail(organization.slug, normalizedEmail);
  return runWithOrg(organization.slug, () => {
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, role, display_name, active, must_change_password)
         VALUES (?, ?, 'admin', ?, 1, 0)`
      )
      .run(
        normalizedEmail,
        hashPassword(adminPassword),
        adminDisplayName || "Administrator"
      );
    const admin = getUserById(result.lastInsertRowid, organization);
    return { organization, admin };
  });
}

function listUsers() {
  const db = getDb();
  return db
    .prepare(
      `SELECT u.id, u.email, u.username, u.role, u.member_id, u.display_name, u.must_change_password,
              u.active, u.created_at, m.name AS member_name
       FROM users u
       LEFT JOIN members m ON m.id = u.member_id
       ORDER BY u.role, u.email`
    )
    .all()
    .map((row) => ({
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      memberId: row.member_id,
      memberName: row.member_name,
      displayName: row.display_name,
      mustChangePassword: Boolean(row.must_change_password),
      active: Boolean(row.active),
      createdAt: row.created_at,
    }));
}

function createUser({ email, username, password, role, memberId, displayName, mustChangePassword }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = username ? normalizeUsername(username) : null;
  if (!normalizedEmail) throw new Error("Email is required");
  if (!password || String(password).length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (![ROLES.STAFF, ROLES.MEMBER].includes(role)) {
    throw new Error("New accounts can only be staff or member");
  }
  if (role === ROLES.MEMBER) {
    if (!memberId) throw new Error("Member accounts must be linked to a ledger member");
    if (!normalizedUsername) throw new Error("Member accounts require a username");
    const db = getDb();
    const member = db.prepare(`SELECT id FROM members WHERE id = ?`).get(memberId);
    if (!member) throw new Error("Linked member not found");
    const taken = db
      .prepare(`SELECT id FROM users WHERE member_id = ? AND active = 1`)
      .get(memberId);
    if (taken) throw new Error("This member already has a login account");
  }

  const db = getDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO users (email, username, password_hash, role, member_id, display_name, active, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        normalizedEmail,
        role === ROLES.MEMBER ? normalizedUsername : null,
        hashPassword(password),
        role,
        role === ROLES.MEMBER ? memberId : null,
        displayName || null,
        mustChangePassword ? 1 : 0
      );
    return getUserById(result.lastInsertRowid, getOrganization(getOrgSlug()));
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      if (String(err.message).includes("users.username")) {
        throw new Error("This username is already taken");
      }
      throw new Error("An account with this email already exists");
    }
    throw err;
  }
}

function slugifyMemberName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
}

function generateUsername(memberName, memberId, db) {
  const base = slugifyMemberName(memberName) || `member.${memberId}`;
  let candidate = base;
  let suffix = 0;
  while (
    db.prepare(`SELECT id FROM users WHERE lower(username) = lower(?)`).get(candidate)
  ) {
    suffix += 1;
    candidate = `${base}.${suffix}`;
  }
  return candidate;
}

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function memberLoginEmail(username, profileEmail, db, organizationSlug) {
  const profile = normalizeEmail(profileEmail);
  if (profile && profile.includes("@")) {
    const taken = db
      .prepare(`SELECT id FROM users WHERE lower(email) = lower(?)`)
      .get(profile);
    if (!taken) return profile;
  }
  return `${username}@members.${normalizeSlug(organizationSlug)}.local`;
}

function provisionAllMemberAccounts({ forceReset = false } = {}) {
  const db = getDb();
  const members = db
    .prepare(
      `SELECT m.id, m.name, mp.email, mp.display_name
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       ORDER BY m.name`
    )
    .all();

  const created = [];
  const skipped = [];

  for (const member of members) {
    const existing = db
      .prepare(`SELECT id, username FROM users WHERE member_id = ? AND active = 1`)
      .get(member.id);

    if (existing && !forceReset) {
      skipped.push({
        memberId: member.id,
        memberName: member.name,
        username: existing.username,
        reason: "Account already exists",
      });
      continue;
    }

    const displayName = member.display_name || member.name;

    if (existing && forceReset) {
      const username = existing.username || generateUsername(member.name, member.id, db);
      const tempPassword = generateTempPassword();
      const email = memberLoginEmail(username, member.email, db, getOrgSlug());
      db.prepare(
        `UPDATE users SET email = ?, username = ?, password_hash = ?, display_name = ?,
         must_change_password = 1 WHERE id = ?`
      ).run(email, username, hashPassword(tempPassword), displayName, existing.id);
      created.push({
        memberId: member.id,
        memberName: member.name,
        username,
        tempPassword,
        email,
        reset: true,
      });
      continue;
    }

    const username = generateUsername(member.name, member.id, db);
    const tempPassword = generateTempPassword();
    const email = memberLoginEmail(username, member.email, db, getOrgSlug());

    try {
      createUser({
        email,
        username,
        password: tempPassword,
        role: ROLES.MEMBER,
        memberId: member.id,
        displayName,
        mustChangePassword: true,
      });
      created.push({
        memberId: member.id,
        memberName: member.name,
        username,
        tempPassword,
        email,
      });
    } catch (err) {
      skipped.push({
        memberId: member.id,
        memberName: member.name,
        reason: err.message,
      });
    }
  }

  const exportPath = writeMemberCredentialsExport(created, skipped);
  return { created, skipped, exportPath };
}

function writeMemberCredentialsExport(created, skipped) {
  const { DATA_DIR } = require("../db/database");
  const exportDir = path.join(DATA_DIR, "exports");
  fs.mkdirSync(exportDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const exportPath = path.join(exportDir, `member-credentials-${stamp}.csv`);

  const lines = [
    "Member Name,Username,Temporary Password,Email,Member ID,Status",
    ...created.map(
      (row) =>
        `"${row.memberName.replace(/"/g, '""')}",${row.username},${row.tempPassword},${row.email},${row.memberId},${row.reset ? "Reset" : "New"}`
    ),
    ...skipped.map(
      (row) =>
        `"${row.memberName.replace(/"/g, '""')}",${row.username || ""},,,${row.memberId},"Skipped: ${row.reason}"`
    ),
  ];
  fs.writeFileSync(exportPath, lines.join("\n"), "utf8");
  return exportPath;
}

function syncMemberPortalLoginEmail(db, memberId, profileEmail) {
  const user = db
    .prepare(
      `SELECT id, email FROM users WHERE member_id = ? AND role = 'member' AND active = 1`
    )
    .get(memberId);
  if (!user) return null;

  const email = normalizeEmail(profileEmail);
  if (!email || !email.includes("@")) return user.email;

  const current = normalizeEmail(user.email);
  if (email === current) return current;

  const taken = db
    .prepare(`SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?`)
    .get(email, user.id);
  if (taken) {
    throw new Error("That email is already used by another login account");
  }

  if (email !== normalizeEmail(user.email)) {
    db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(email, user.id);
  }
  return email;
}

function listMemberCredentialsSummary() {
  const db = getDb();
  return db
    .prepare(
      `SELECT u.username, u.email AS login_email, u.must_change_password,
              m.id AS member_id, m.name AS member_name, mp.email AS profile_email
       FROM users u
       JOIN members m ON m.id = u.member_id
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       WHERE u.role = 'member' AND u.active = 1
       ORDER BY m.name`
    )
    .all()
    .map((row) => {
      const profileEmail = normalizeEmail(row.profile_email);
      const loginEmail = row.login_email;
      return {
        memberId: row.member_id,
        memberName: row.member_name,
        username: row.username,
        email: profileEmail && profileEmail.includes("@") ? profileEmail : loginEmail,
        mustChangePassword: Boolean(row.must_change_password),
      };
    });
}

function canAccessMember(user, memberId) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN || user.role === ROLES.STAFF) return true;
  return user.role === ROLES.MEMBER && Number(user.memberId) === Number(memberId);
}

function canWrite(user) {
  return user?.role === ROLES.ADMIN;
}

function canViewCooperative(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.STAFF;
}

module.exports = {
  ROLES,
  PORTALS,
  ASSURANCE_ADMIN_EMAIL,
  ASSURANCE_SLUG,
  ASSURANCE_NAME,
  normalizeEmail,
  ensureAssuranceAdminUser,
  registerOrganizationWithAdmin,
  login,
  logout,
  changePassword,
  getSession,
  getUserById,
  listUsers,
  createUser,
  provisionAllMemberAccounts,
  syncMemberPortalLoginEmail,
  listMemberCredentialsSummary,
  portalAllowsUser,
  canAccessMember,
  canWrite,
  canViewCooperative,
};
