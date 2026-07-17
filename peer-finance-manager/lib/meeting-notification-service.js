const { getDb } = require("../db/database");
const { sendEmail, isEmailConfigured } = require("./email-service");
const { trace } = require("./trace-log");
const {
  listMemberNotificationRecipients,
  getMemberPortalUrl,
} = require("./report-notification-service");
const {
  getMeetingById,
  getOrganizationBranding,
} = require("./cooperative-meeting-service");
const {
  ensureEmailAuditTables,
  recordDeliveryBatch,
} = require("./email-audit-service");

function notificationAlreadySent(dedupeKey) {
  const db = getDb();
  ensureEmailAuditTables(db);
  return Boolean(
    db.prepare(`SELECT 1 FROM member_report_email_log WHERE dedupe_key = ?`).get(dedupeKey)
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function agendaLines(agenda) {
  return String(agenda || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, ""));
}

function meetingDetailsText(meeting) {
  const lines = [
    meeting.title,
    `${meeting.meetingDateLabel} at ${meeting.meetingTimeLabel} (${meeting.timezoneLabel})`,
  ];
  if (meeting.location) lines.push(`Location: ${meeting.location}`);
  if (meeting.virtualLink) lines.push(`Join Online: ${meeting.virtualLink}`);
  const agenda = agendaLines(meeting.agenda);
  if (agenda.length) {
    lines.push("Agenda");
    for (const item of agenda) lines.push(item);
  }
  return lines.join("\n");
}

function meetingDetailsHtml(meeting) {
  let html =
    `<p><strong>${escapeHtml(meeting.title)}</strong></p>` +
    `<p>${escapeHtml(meeting.meetingDateLabel)} at ${escapeHtml(meeting.meetingTimeLabel)} ` +
    `(${escapeHtml(meeting.timezoneLabel)})</p>`;
  if (meeting.location) {
    html += `<p><strong>Location:</strong> ${escapeHtml(meeting.location)}</p>`;
  }
  if (meeting.virtualLink) {
    html +=
      `<p><strong>Join Online:</strong> ` +
      `<a href="${escapeHtml(meeting.virtualLink)}">${escapeHtml(meeting.virtualLink)}</a></p>`;
  }
  const agenda = agendaLines(meeting.agenda);
  if (agenda.length) {
    html += `<p><strong>Agenda</strong></p><ul>`;
    for (const item of agenda) {
      html += `<li>${escapeHtml(item)}</li>`;
    }
    html += `</ul>`;
  }
  return html;
}

function meetingEmailClosingText(branding, portalUrl) {
  return (
    `Best regards,\n` +
    `${branding.organizationName}\n` +
    `Sign In to the Member Portal: ${portalUrl}`
  );
}

function meetingEmailClosingHtml(branding, portalUrl) {
  return (
    `<p>Best regards,<br><strong>${escapeHtml(branding.organizationName)}</strong></p>` +
    `<p><a href="${escapeHtml(portalUrl)}">Sign In to the Member Portal</a></p>`
  );
}

async function sendMemberBroadcastEmail({ triggerType, dedupeKey, subject, textFor, htmlFor }) {
  if (!isEmailConfigured()) {
    return { sent: false, skipped: true, reason: "not_configured" };
  }
  if (notificationAlreadySent(dedupeKey)) {
    return { sent: false, skipped: true, reason: "already_sent", dedupeKey };
  }
  const recipients = listMemberNotificationRecipients();
  if (!recipients.length) {
    trace.info("Meeting email skipped : no member emails on file", { triggerType, dedupeKey });
    return { sent: false, skipped: true, reason: "no_recipients" };
  }
  const deliveries = [];
  for (const recipient of recipients) {
    try {
      const result = await sendEmail({
        to: recipient.email,
        subject,
        text: textFor(recipient),
        html: htmlFor(recipient),
      });
      if (result.sent) {
        deliveries.push({
          memberId: recipient.memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject,
          status: "sent",
        });
      } else {
        deliveries.push({
          memberId: recipient.memberId,
          memberName: recipient.memberName,
          email: recipient.email,
          subject,
          status: "skipped",
          errorMessage: result.reason || "skipped",
        });
      }
    } catch (err) {
      deliveries.push({
        memberId: recipient.memberId,
        memberName: recipient.memberName,
        email: recipient.email,
        subject,
        status: "failed",
        errorMessage: err.message || "send failed",
      });
      trace.warn("Meeting email failed for recipient", {
        triggerType,
        dedupeKey,
        email: recipient.email,
        error: err.message,
      });
    }
  }
  const summary = recordDeliveryBatch({
    triggerType,
    dedupeKey,
    subject,
    deliveries,
  });
  trace.info("Meeting emails sent", {
    triggerType,
    dedupeKey,
    sentCount: summary.sentCount,
    failedCount: summary.failedCount,
  });
  return {
    sent: summary.sentCount > 0,
    recipientCount: summary.sentCount,
    failedCount: summary.failedCount,
    batchId: summary.batchId,
    dedupeKey,
  };
}

async function sendMeetingAnnouncedEmails(meetingOrId, options = {}) {
  const meeting =
    typeof meetingOrId === "object" ? meetingOrId : getMeetingById(meetingOrId);
  if (!meeting || meeting.status !== "announced") {
    return { skipped: true, reason: "not_announced" };
  }
  const branding = getOrganizationBranding();
  const portalUrl = getMemberPortalUrl();
  const dedupeKey = options.bypassDedupe
    ? `meeting_announced_manual:${meeting.id}:${Date.now()}`
    : `meeting_announced:${meeting.id}:${meeting.announcedAt || meeting.updatedAt}`;
  const subject = `${branding.organizationName} : Meeting Announcement: ${meeting.title}`;

  return sendMemberBroadcastEmail({
    triggerType: "meeting_announced",
    dedupeKey,
    subject,
    textFor: (recipient) =>
      `Hello ${recipient.memberName},\n` +
      `A Cooperative meeting has been scheduled:\n` +
      meetingDetailsText(meeting) +
      `\n` +
      meetingEmailClosingText(branding, portalUrl),
    htmlFor: (recipient) =>
      `<p>Hello ${escapeHtml(recipient.memberName)},</p>` +
      `<p>A Cooperative meeting has been scheduled:</p>` +
      meetingDetailsHtml(meeting) +
      meetingEmailClosingHtml(branding, portalUrl),
  });
}

async function sendMeetingCancelledEmails(meetingOrId) {
  const meeting =
    typeof meetingOrId === "object" ? meetingOrId : getMeetingById(meetingOrId);
  if (!meeting || meeting.status !== "cancelled") {
    return { skipped: true, reason: "not_cancelled" };
  }
  const branding = getOrganizationBranding();
  const dedupeKey = `meeting_cancelled:${meeting.id}:${meeting.cancelledAt || meeting.updatedAt}`;
  const subject = `${branding.organizationName} : Meeting Cancelled: ${meeting.title}`;

  return sendMemberBroadcastEmail({
    triggerType: "meeting_cancelled",
    dedupeKey,
    subject,
    textFor: (recipient) =>
      `Hello ${recipient.memberName},\n\n` +
      `The following Cooperative meeting has been cancelled:\n\n` +
      `${meeting.title} : ${meeting.meetingDateLabel} at ${meeting.meetingTimeLabel}\n\n` +
      `${branding.organizationName}`,
    htmlFor: (recipient) =>
      `<p>Hello ${escapeHtml(recipient.memberName)},</p>` +
      `<p>The following Cooperative meeting has been cancelled:</p>` +
      `<p><strong>${escapeHtml(meeting.title)}</strong><br>` +
      `${escapeHtml(meeting.meetingDateLabel)} at ${escapeHtml(meeting.meetingTimeLabel)}</p>` +
      `<p>${escapeHtml(branding.organizationName)}</p>`,
  });
}

async function sendMeetingReminderEmails(meetingOrId) {
  const meeting =
    typeof meetingOrId === "object" ? meetingOrId : getMeetingById(meetingOrId);
  if (!meeting || meeting.status !== "announced") {
    return { skipped: true, reason: "not_announced" };
  }
  const branding = getOrganizationBranding();
  const portalUrl = getMemberPortalUrl();
  const dedupeKey = `meeting_reminder:${meeting.id}:${meeting.meetingDate}:${meeting.meetingTime}`;
  const subject = `${branding.organizationName} : Meeting Reminder: ${meeting.title}`;

  return sendMemberBroadcastEmail({
    triggerType: "meeting_reminder",
    dedupeKey,
    subject,
    textFor: (recipient) =>
      `Hello ${recipient.memberName},\n` +
      `Reminder : Cooperative meeting coming up:\n` +
      meetingDetailsText(meeting) +
      `\n` +
      meetingEmailClosingText(branding, portalUrl),
    htmlFor: (recipient) =>
      `<p>Hello ${escapeHtml(recipient.memberName)},</p>` +
      `<p>Reminder : Cooperative meeting coming up:</p>` +
      meetingDetailsHtml(meeting) +
      meetingEmailClosingHtml(branding, portalUrl),
  });
}

function queueMeetingAnnouncedEmails(meeting) {
  setImmediate(() => {
    sendMeetingAnnouncedEmails(meeting).catch((err) => {
      trace.warn("Meeting announce email failed", { error: err.message, meetingId: meeting?.id });
    });
  });
}

function queueMeetingCancelledEmails(meeting) {
  setImmediate(() => {
    sendMeetingCancelledEmails(meeting).catch((err) => {
      trace.warn("Meeting cancel email failed", { error: err.message, meetingId: meeting?.id });
    });
  });
}

module.exports = {
  sendMeetingAnnouncedEmails,
  sendMeetingCancelledEmails,
  sendMeetingReminderEmails,
  queueMeetingAnnouncedEmails,
  queueMeetingCancelledEmails,
};
