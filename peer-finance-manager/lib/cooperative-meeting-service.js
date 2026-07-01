const { getDb } = require("../db/database");
const { getOrgSlug } = require("./org-context");
const { getOrganization } = require("./organization-service");
const {
  getCooperativeSetting,
  setCooperativeSetting,
  ensureSettingsTable,
} = require("./cooperative-settings");
const {
  getCooperativeTimezone,
  nowUtcIso,
  todayIso,
  timezoneLabel,
  formatInstantAsCooperativeDate,
} = require("./cooperative-time");

const SETTING_AUTO_REMINDER = "meetings_auto_reminder";
const SETTING_REMINDER_HOURS = "meetings_reminder_hours";

const STATUSES = {
  DRAFT: "draft",
  ANNOUNCED: "announced",
  CANCELLED: "cancelled",
};

function ensureMeetingsTable(db) {
  ensureSettingsTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cooperative_meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      meeting_time TEXT NOT NULL,
      location TEXT,
      virtual_link TEXT,
      agenda TEXT,
      admin_notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      announced_at TEXT,
      cancelled_at TEXT,
      reminder_sent_at TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cooperative_meetings_date ON cooperative_meetings(meeting_date, meeting_time);
    CREATE INDEX IF NOT EXISTS idx_cooperative_meetings_status ON cooperative_meetings(status);
  `);
}

function localDateTimeToInstant(dateIso, timeHm, timeZone = getCooperativeTimezone()) {
  const [y, m, d] = String(dateIso).slice(0, 10).split("-").map(Number);
  const [hour, minute] = String(timeHm).slice(0, 5).split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error("Invalid meeting date or time");
  }
  let utcMs = Date.UTC(y, m - 1, d, hour, minute);
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      })
        .formatToParts(new Date(utcMs))
        .map((p) => [p.type, Number(p.value)])
    );
    const diffMin =
      (y - parts.year) * 525600 +
      (m - parts.month) * 43800 +
      (d - parts.day) * 1440 +
      (hour - parts.hour) * 60 +
      (minute - parts.minute);
    if (diffMin === 0) break;
    utcMs += diffMin * 60 * 1000;
  }
  return new Date(utcMs);
}

function formatMeetingTimeLabel(timeHm, timeZone = getCooperativeTimezone()) {
  const [hour, minute] = String(timeHm).slice(0, 5).split(":").map(Number);
  const ref = localDateTimeToInstant("2000-01-01", `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, timeZone);
  return ref.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMeetingDateLabel(dateIso, timeZone = getCooperativeTimezone()) {
  const instant = localDateTimeToInstant(dateIso, "12:00", timeZone);
  return formatInstantAsCooperativeDate(instant.toISOString(), {}, timeZone);
}

function meetingSortKey(row) {
  return `${row.meeting_date}T${String(row.meeting_time).slice(0, 5)}`;
}

function isMeetingUpcoming(row, now = new Date(), timeZone = getCooperativeTimezone()) {
  if (row.status !== STATUSES.ANNOUNCED) return false;
  try {
    const start = localDateTimeToInstant(row.meeting_date, row.meeting_time, timeZone);
    return start.getTime() >= now.getTime() - 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function mapMeetingRow(row) {
  if (!row) return null;
  const tz = getCooperativeTimezone();
  return {
    id: row.id,
    title: row.title,
    meetingDate: row.meeting_date,
    meetingTime: String(row.meeting_time).slice(0, 5),
    meetingDateLabel: formatMeetingDateLabel(row.meeting_date, tz),
    meetingTimeLabel: formatMeetingTimeLabel(row.meeting_time, tz),
    timezone: tz,
    timezoneLabel: timezoneLabel(tz),
    location: row.location || "",
    virtualLink: row.virtual_link || "",
    agenda: row.agenda || "",
    adminNotes: row.admin_notes || "",
    status: row.status,
    announcedAt: row.announced_at,
    cancelledAt: row.cancelled_at,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    upcoming: isMeetingUpcoming(row),
  };
}

function validateMeetingPayload(payload, { partial = false } = {}) {
  const title = payload.title != null ? String(payload.title).trim() : null;
  const meetingDate = payload.meetingDate != null ? String(payload.meetingDate).trim() : null;
  const meetingTime = payload.meetingTime != null ? String(payload.meetingTime).trim().slice(0, 5) : null;

  if (!partial || payload.title !== undefined) {
    if (!title) throw new Error("Meeting title is required");
  }
  if (!partial || payload.meetingDate !== undefined) {
    if (!meetingDate || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
      throw new Error("Meeting date is required (YYYY-MM-DD)");
    }
  }
  if (!partial || payload.meetingTime !== undefined) {
    if (!meetingTime || !/^\d{2}:\d{2}$/.test(meetingTime)) {
      throw new Error("Meeting time is required (HH:MM)");
    }
  }
  if (meetingDate && meetingTime) {
    localDateTimeToInstant(meetingDate, meetingTime);
  }
  return {
    title,
    meetingDate,
    meetingTime,
    location: payload.location != null ? String(payload.location).trim() : undefined,
    virtualLink: payload.virtualLink != null ? String(payload.virtualLink).trim() : undefined,
    agenda: payload.agenda != null ? String(payload.agenda).trim() : undefined,
    adminNotes: payload.adminNotes != null ? String(payload.adminNotes).trim() : undefined,
  };
}

function getMeetingSettings() {
  const db = getDb();
  ensureMeetingsTable(db);
  const autoReminder = getCooperativeSetting(SETTING_AUTO_REMINDER);
  const reminderHours = getCooperativeSetting(SETTING_REMINDER_HOURS);
  return {
    autoReminder: autoReminder === null ? true : autoReminder === "1" || autoReminder === "true",
    reminderHours: reminderHours != null ? Math.max(1, Number(reminderHours) || 24) : 24,
    cooperativeTimezone: getCooperativeTimezone(),
    timezoneLabel: timezoneLabel(getCooperativeTimezone()),
  };
}

function updateMeetingSettings(payload = {}) {
  const db = getDb();
  ensureMeetingsTable(db);
  if (payload.autoReminder !== undefined) {
    setCooperativeSetting(db, SETTING_AUTO_REMINDER, payload.autoReminder ? "1" : "0");
  }
  if (payload.reminderHours !== undefined) {
    const hours = Math.max(1, Math.min(168, Number(payload.reminderHours) || 24));
    setCooperativeSetting(db, SETTING_REMINDER_HOURS, String(hours));
  }
  return getMeetingSettings();
}

function listMeetings({ includeDrafts = true, includeCancelled = false } = {}) {
  const db = getDb();
  ensureMeetingsTable(db);
  const clauses = [];
  if (!includeDrafts) clauses.push(`status != 'draft'`);
  if (!includeCancelled) clauses.push(`status != 'cancelled'`);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT * FROM cooperative_meetings
       ${where}
       ORDER BY meeting_date DESC, meeting_time DESC, id DESC`
    )
    .all();
  return rows.map(mapMeetingRow);
}

function getMeetingById(id) {
  const db = getDb();
  ensureMeetingsTable(db);
  const row = db.prepare(`SELECT * FROM cooperative_meetings WHERE id = ?`).get(id);
  return mapMeetingRow(row);
}

function createMeeting(payload, createdByUserId = null) {
  const db = getDb();
  ensureMeetingsTable(db);
  const data = validateMeetingPayload(payload);
  const result = db
    .prepare(
      `INSERT INTO cooperative_meetings (
         title, meeting_date, meeting_time, location, virtual_link, agenda, admin_notes,
         status, created_by_user_id, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, datetime('now'))`
    )
    .run(
      data.title,
      data.meetingDate,
      data.meetingTime,
      data.location || null,
      data.virtualLink || null,
      data.agenda || null,
      data.adminNotes || null,
      createdByUserId
    );
  return getMeetingById(result.lastInsertRowid);
}

function updateMeeting(id, payload) {
  const db = getDb();
  ensureMeetingsTable(db);
  const existing = db.prepare(`SELECT * FROM cooperative_meetings WHERE id = ?`).get(id);
  if (!existing) throw new Error("Meeting not found");
  if (existing.status === STATUSES.CANCELLED) {
    throw new Error("Cancelled meetings cannot be edited");
  }
  if (existing.status === STATUSES.ANNOUNCED) {
    const allowed = ["location", "virtualLink", "agenda", "adminNotes"];
    const keys = Object.keys(payload || {});
    if (keys.some((k) => !allowed.includes(k))) {
      throw new Error("Announced meetings can only update location, virtual link, agenda, or admin notes");
    }
  }
  const data = validateMeetingPayload(payload, { partial: true });
  const fields = [];
  const values = [];
  const map = {
    title: "title",
    meetingDate: "meeting_date",
    meetingTime: "meeting_time",
    location: "location",
    virtualLink: "virtual_link",
    agenda: "agenda",
    adminNotes: "admin_notes",
  };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(data[key] || null);
    }
  }
  if (!fields.length) return getMeetingById(id);
  fields.push(`updated_at = datetime('now')`);
  values.push(id);
  db.prepare(`UPDATE cooperative_meetings SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getMeetingById(id);
}

function deleteMeeting(id) {
  const db = getDb();
  ensureMeetingsTable(db);
  const existing = db.prepare(`SELECT status FROM cooperative_meetings WHERE id = ?`).get(id);
  if (!existing) throw new Error("Meeting not found");
  if (existing.status !== STATUSES.DRAFT) {
    throw new Error("Only draft meetings can be deleted. Cancel announced meetings instead.");
  }
  db.prepare(`DELETE FROM cooperative_meetings WHERE id = ?`).run(id);
  return { deleted: true, id: Number(id) };
}

function announceMeeting(id) {
  const db = getDb();
  ensureMeetingsTable(db);
  const existing = db.prepare(`SELECT * FROM cooperative_meetings WHERE id = ?`).get(id);
  if (!existing) throw new Error("Meeting not found");
  if (existing.status === STATUSES.CANCELLED) {
    throw new Error("Cancelled meetings cannot be announced");
  }
  if (existing.status === STATUSES.ANNOUNCED) {
    return getMeetingById(id);
  }
  const announcedAt = nowUtcIso();
  db.prepare(
    `UPDATE cooperative_meetings
     SET status = 'announced', announced_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(announcedAt, id);
  const meeting = getMeetingById(id);
  const { queueMeetingAnnouncedEmails } = require("./meeting-notification-service");
  queueMeetingAnnouncedEmails(meeting);
  return meeting;
}

function cancelMeeting(id) {
  const db = getDb();
  ensureMeetingsTable(db);
  const existing = db.prepare(`SELECT * FROM cooperative_meetings WHERE id = ?`).get(id);
  if (!existing) throw new Error("Meeting not found");
  if (existing.status === STATUSES.CANCELLED) return getMeetingById(id);
  db.prepare(
    `UPDATE cooperative_meetings
     SET status = 'cancelled', cancelled_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nowUtcIso(), id);
  const meeting = getMeetingById(id);
  const { queueMeetingCancelledEmails } = require("./meeting-notification-service");
  queueMeetingCancelledEmails(meeting);
  return meeting;
}

function listMemberMeetings() {
  return listMeetings({ includeDrafts: false, includeCancelled: false }).filter(
    (m) => m.status === STATUSES.ANNOUNCED
  );
}

function listMeetingsNeedingReminder(now = new Date()) {
  const settings = getMeetingSettings();
  if (!settings.autoReminder) return [];
  const db = getDb();
  ensureMeetingsTable(db);
  const rows = db
    .prepare(
      `SELECT * FROM cooperative_meetings
       WHERE status = 'announced' AND reminder_sent_at IS NULL`
    )
    .all();
  const tz = getCooperativeTimezone();
  const windowMs = settings.reminderHours * 60 * 60 * 1000;
  return rows
    .map(mapMeetingRow)
    .filter((meeting) => {
      try {
        const start = localDateTimeToInstant(meeting.meetingDate, meeting.meetingTime, tz);
        const msUntil = start.getTime() - now.getTime();
        return msUntil > 0 && msUntil <= windowMs;
      } catch {
        return false;
      }
    });
}

function markMeetingReminderSent(id) {
  const db = getDb();
  db.prepare(
    `UPDATE cooperative_meetings SET reminder_sent_at = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(nowUtcIso(), id);
}

function getOrganizationBranding() {
  const org = getOrganization(getOrgSlug());
  return {
    organizationName: org?.name || "Cooperative",
    website: getCooperativeSetting("organization_website") || "",
  };
}

function runScheduledMeetingJobsForOrganization() {
  const { sendMeetingReminderEmails } = require("./meeting-notification-service");
  const due = listMeetingsNeedingReminder();
  return Promise.all(
    due.map(async (meeting) => {
      const result = await sendMeetingReminderEmails(meeting.id);
      if (result.sent) markMeetingReminderSent(meeting.id);
      return { meetingId: meeting.id, ...result };
    })
  );
}

async function runScheduledMeetingJobsForAllOrganizations() {
  const { listOrganizations } = require("./organization-service");
  const { runWithOrg } = require("./org-context");
  const results = [];
  for (const org of listOrganizations()) {
    await runWithOrg(org.slug, async () => {
      try {
        const orgResults = await runScheduledMeetingJobsForOrganization();
        if (orgResults.length) {
          results.push({ orgSlug: org.slug, reminders: orgResults });
        }
      } catch (err) {
        results.push({ orgSlug: org.slug, error: err.message });
      }
    });
  }
  return results;
}

module.exports = {
  STATUSES,
  ensureMeetingsTable,
  localDateTimeToInstant,
  getMeetingSettings,
  updateMeetingSettings,
  listMeetings,
  listMemberMeetings,
  getMeetingById,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  announceMeeting,
  cancelMeeting,
  listMeetingsNeedingReminder,
  markMeetingReminderSent,
  runScheduledMeetingJobsForOrganization,
  runScheduledMeetingJobsForAllOrganizations,
  getOrganizationBranding,
};
