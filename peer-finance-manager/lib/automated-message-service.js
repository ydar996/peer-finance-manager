/**
 * Catalog of automated member emails. Each Cooperative can edit subject and
 * body on demand; placeholders are filled when the message is sent.
 */
const { getDb } = require("../db/database");
const {
  ensureSettingsTable,
  getCooperativeSetting,
  setCooperativeSetting,
} = require("./cooperative-settings");
const { capitalizeCooperativeWording } = require("./text-format");
const { getOrgSlugOrNull } = require("./org-context");
const { getMemberPortalLoginUrl } = require("./portal-urls");

const SETTING_PREFIX = "automated_message:";
const SUBJECT_MAX = 200;
const BODY_MAX = 8000;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function organizationName() {
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
  return name;
}

function portalUrl() {
  return getMemberPortalLoginUrl(getOrgSlugOrNull());
}

function settingKey(id) {
  return `${SETTING_PREFIX}${id}`;
}

function sanitizeCopy(value) {
  return String(value ?? "")
    .replace(/\s*[\u2014\u2013]\s*/g, ": ")
    .replace(/\r\n/g, "\n");
}

function fillTemplate(template, vars = {}) {
  return String(template ?? "")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      if (!Object.prototype.hasOwnProperty.call(vars, key)) return `{{${key}}}`;
      const value = vars[key];
      return value == null ? "" : String(value);
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function autolinkHtml(html) {
  return html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  );
}

function emailTextToHtml(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  const blocks = normalized.split(/\n\n+/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trimEnd());
      const listLines = lines.filter((line) => /^[-*]\s+/.test(line.trim()));
      const contentLines = lines.filter((line) => line.trim());
      if (listLines.length && listLines.length === contentLines.length) {
        const items = listLines
          .map((line) => `<li>${autolinkHtml(escapeHtml(line.trim().replace(/^[-*]\s+/, "")))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${autolinkHtml(escapeHtml(lines.join("\n"))).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

const CATALOG = [
  {
    id: "loan_due_notice",
    title: "Loan Payment Due",
    description:
      "Sent to each borrower on the installment due date (the same calendar day as disbursement, each month after).",
    placeholders: [
      { token: "memberName", meaning: "Borrower name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "dueDate", meaning: "Due date" },
      { token: "paymentAmount", meaning: "Installment amount" },
      { token: "loanLabel", meaning: "Loan 1, Loan 2, and so on" },
      { token: "outstandingBalance", meaning: "Outstanding balance as of the due date" },
      { token: "details", meaning: "Amount due and outstanding balance sentences" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: Loan Payment Due",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "{{details}}\n\n" +
      "If you have already sent this payment, please disregard this notice pending periodic bank reconciliation. " +
      "A notice will be sent acknowledging payment as soon as it is confirmed, recognizing the date of the transaction.\n\n" +
      "You can also view this in the member portal:\n{{portalUrl}}",
    sample: {
      memberName: "Ada Okeke",
      dueDate: "06/22/2026",
      paymentAmount: "$125.50",
      loanLabel: "Loan 1",
      outstandingBalance: "$1,875.00",
      details:
        "Your installment of $125.50 for Loan 1 is due today, 06/22/2026. Your outstanding loan balance as of 06/22/2026 is $1,875.00.",
    },
  },
  {
    id: "deposit_credit_alert",
    title: "Deposit/Loan Repayment Received",
    description:
      "Sent after a Member Deposit or Loan Repayment is confirmed on the books (usually from Import New Bank Activity).",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "alertKind", meaning: "Deposit Received, Loan Repayment Received, or mixed" },
      { token: "details", meaning: "Confirmed payment date, type, and amount" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: {{alertKind}}",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "{{details}}\n\n" +
      "You can also view this in the member portal:\n{{portalUrl}}",
    sample: {
      memberName: "Ada Okeke",
      alertKind: "Loan Repayment Received",
      details: "Your Cooperative has recorded your Loan Repayment of $200.00 on 10/07/2026.",
    },
  },
  {
    id: "membership_application_received",
    title: "Membership Application Received",
    description: "Sent to the applicant as soon as a membership application is submitted.",
    placeholders: [
      { token: "memberName", meaning: "Applicant name" },
      { token: "orgName", meaning: "Cooperative name" },
    ],
    defaultSubject: "{{orgName}}: We Received Your Membership Application",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "Welcome to {{orgName}}. We received your membership application.\n\n" +
      "Once we verify your deposits, you will receive another email with the details of the transaction.\n\n" +
      "Thank you for applying.",
    sample: { memberName: "Ada Okeke" },
  },
  {
    id: "deposits_verified",
    title: "Deposits Have Been Verified",
    description:
      "Sent when a first deposit is verified: membership fee deducted, leftover in the contributions account.",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "feeAmount", meaning: "Membership fee deducted" },
      { token: "depositAmount", meaning: "First deposit total" },
      { token: "contributionAmount", meaning: "Amount remaining in the contributions account after the fee" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: Your Deposits Have Been Verified",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "Your first deposit of {{depositAmount}} has been verified for {{orgName}}.\n\n" +
      "The agreed membership application fee of {{feeAmount}} has been deducted from your initial deposit. The remaining {{contributionAmount}} has been credited to your contributions account as your first deposit.\n\n" +
      "Please sign in to the member portal to check your balances and continue using the portal going forward.\n" +
      "{{portalUrl}}",
    sample: {
      memberName: "Ada Okeke",
      feeAmount: "$100.00",
      depositAmount: "$150.00",
      contributionAmount: "$50.00",
    },
  },
  {
    id: "member_welcome_login",
    title: "Member Portal Welcome Login",
    description: "Sent when a membership application is accepted and a member login is created.",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "organizationCode", meaning: "Organization code for sign-in" },
      { token: "username", meaning: "Member username" },
      { token: "tempPassword", meaning: "Temporary password" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: Your Member Portal Login",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "Welcome to {{orgName}}. Your membership has been accepted. Here are your Peer Finance Manager member portal login details.\n\n" +
      "Organization code: {{organizationCode}}\n" +
      "Sign-in page: {{portalUrl}}\n" +
      "Username: {{username}}\n" +
      "Temporary password: {{tempPassword}}\n\n" +
      "You must change this password after you sign in.\n\n" +
      "If you did not expect this email, contact your Cooperative administrator.",
    sample: {
      memberName: "Ada Okeke",
      organizationCode: "assurance",
      username: "ada.okeke",
      tempPassword: "TemporaryPassword123",
    },
  },
  {
    id: "member_password_reset",
    title: "Temporary Member Portal Password",
    description: "Sent when an administrator resets a member portal password.",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "organizationCode", meaning: "Organization code for sign-in" },
      { token: "username", meaning: "Member username" },
      { token: "tempPassword", meaning: "Temporary password" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: Temporary Member Portal Password",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "An administrator reset your Peer Finance Manager member portal password.\n\n" +
      "Organization code: {{organizationCode}}\n" +
      "Sign-in page: {{portalUrl}}\n" +
      "Username: {{username}}\n" +
      "Temporary password: {{tempPassword}}\n\n" +
      "You must change this password after you sign in.\n\n" +
      "If you did not expect this email, contact your Cooperative administrator.",
    sample: {
      memberName: "Ada Okeke",
      organizationCode: "assurance",
      username: "ada.okeke",
      tempPassword: "TemporaryPassword123",
    },
  },
  {
    id: "meeting_announced",
    title: "Meeting Announcement",
    description: "Sent to members when a Cooperative meeting is announced.",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "meetingTitle", meaning: "Meeting title" },
      { token: "meetingDetails", meaning: "Date, time, location, and agenda" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: Meeting Announcement: {{meetingTitle}}",
    defaultBody:
      "Hello {{memberName}},\n" +
      "A Cooperative meeting has been scheduled:\n" +
      "{{meetingDetails}}\n" +
      "Best regards,\n" +
      "{{orgName}}\n" +
      "Sign In to the Member Portal: {{portalUrl}}",
    sample: {
      memberName: "Ada Okeke",
      meetingTitle: "Monthly Meeting",
      meetingDetails:
        "Monthly Meeting\n06/15/2026 at 7:00 PM (Pacific Time)\nLocation: Cooperative Hall",
    },
  },
  {
    id: "meeting_reminder",
    title: "Meeting Reminder",
    description: "Sent automatically before an announced meeting, if reminder settings are on.",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "meetingTitle", meaning: "Meeting title" },
      { token: "meetingDetails", meaning: "Date, time, location, and agenda" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: Meeting Reminder: {{meetingTitle}}",
    defaultBody:
      "Hello {{memberName}},\n" +
      "Reminder : Cooperative meeting coming up:\n" +
      "{{meetingDetails}}\n" +
      "Best regards,\n" +
      "{{orgName}}\n" +
      "Sign In to the Member Portal: {{portalUrl}}",
    sample: {
      memberName: "Ada Okeke",
      meetingTitle: "Monthly Meeting",
      meetingDetails:
        "Monthly Meeting\n06/15/2026 at 7:00 PM (Pacific Time)\nLocation: Cooperative Hall",
    },
  },
  {
    id: "meeting_cancelled",
    title: "Meeting Cancelled",
    description: "Sent when an announced Cooperative meeting is cancelled.",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "meetingTitle", meaning: "Meeting title" },
      { token: "meetingWhen", meaning: "Meeting date and time" },
    ],
    defaultSubject: "{{orgName}}: Meeting Cancelled: {{meetingTitle}}",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "The following Cooperative meeting has been cancelled:\n\n" +
      "{{meetingTitle}} : {{meetingWhen}}\n\n" +
      "{{orgName}}",
    sample: {
      memberName: "Ada Okeke",
      meetingTitle: "Monthly Meeting",
      meetingWhen: "06/15/2026 at 7:00 PM",
    },
  },
  {
    id: "report_published",
    title: "Status Report Published",
    description: "Sent when the Cooperative monthly status report is published to members.",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "periodLabel", meaning: "Month and year of the report" },
      { token: "asOfDate", meaning: "As-of date on the report" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: Cooperative Status Report Published",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "The Cooperative monthly status report for {{periodLabel}} (as at {{asOfDate}}) is now available on the member portal. " +
      "You can also review your personal account statements there.\n\n" +
      "Sign in: {{portalUrl}}\n\n" +
      "{{orgName}}",
    sample: {
      memberName: "Ada Okeke",
      periodLabel: "June 2026",
      asOfDate: "06/30/2026",
    },
  },
  {
    id: "month_end",
    title: "Month-End Report Reminder",
    description: "Sent on the last day of the month, reminding members to review reports.",
    placeholders: [
      { token: "memberName", meaning: "Member name" },
      { token: "orgName", meaning: "Cooperative name" },
      { token: "periodLabel", meaning: "Month and year ending today" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "{{orgName}}: Review Your Monthly Reports",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "Today is the last day of {{periodLabel}}. Please sign in to the member portal to review your personal account statements and the Cooperative monthly status report.\n\n" +
      "Sign in: {{portalUrl}}\n\n" +
      "{{orgName}}",
    sample: {
      memberName: "Ada Okeke",
      periodLabel: "June 2026",
    },
  },
  {
    id: "inbox_new_message",
    title: "New Portal Message",
    description: "Sent when a new Messages inbox item is waiting (a short tip to sign in and read it).",
    placeholders: [
      { token: "memberName", meaning: "Recipient name" },
      { token: "messageSubject", meaning: "Inbox subject" },
      { token: "messagePreview", meaning: "Short preview of the message" },
      { token: "portalUrl", meaning: "Member portal sign-in link" },
    ],
    defaultSubject: "New Message: {{messageSubject}}",
    defaultBody:
      "Hello {{memberName}},\n\n" +
      "You have a new message in your Cooperative portal.\n\n" +
      "Subject: {{messageSubject}}\n\n" +
      "{{messagePreview}}\n\n" +
      "Sign in to read and reply: {{portalUrl}}",
    sample: {
      memberName: "Ada Okeke",
      messageSubject: "Meeting Minutes",
      messagePreview: "Please review the attached minutes from this month's meeting.",
    },
  },
];

const CATALOG_BY_ID = new Map(CATALOG.map((item) => [item.id, item]));

function getCatalogEntry(id) {
  const entry = CATALOG_BY_ID.get(String(id || ""));
  if (!entry) {
    throw new Error("Unknown automated message.");
  }
  return entry;
}

function readOverride(id) {
  try {
    const raw = getCooperativeSetting(settingKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const subject = sanitizeCopy(parsed?.subject || "").trim();
    const body = sanitizeCopy(parsed?.body || "").trim();
    if (!subject && !body) return null;
    return { subject, body };
  } catch (_) {
    return null;
  }
}

function sharedSampleVars() {
  return {
    orgName: organizationName(),
    portalUrl: portalUrl(),
  };
}

function effectiveCopy(entry) {
  const override = readOverride(entry.id);
  return {
    subject: override?.subject || entry.defaultSubject,
    body: override?.body || entry.defaultBody,
    customized: Boolean(override),
  };
}

function presentTemplate(entry) {
  const copy = effectiveCopy(entry);
  const sampleValues = { ...sharedSampleVars(), ...(entry.sample || {}) };
  const previewSubject = capitalizeCooperativeWording(fillTemplate(copy.subject, sampleValues));
  const previewText = capitalizeCooperativeWording(fillTemplate(copy.body, sampleValues));
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    placeholders: entry.placeholders,
    subject: copy.subject,
    body: copy.body,
    defaultSubject: entry.defaultSubject,
    defaultBody: entry.defaultBody,
    customized: copy.customized,
    sampleValues,
    preview: {
      subject: previewSubject,
      text: previewText,
      html: emailTextToHtml(previewText),
    },
  };
}

function listAutomatedMessages() {
  return CATALOG.map(presentTemplate);
}

function getAutomatedMessage(id) {
  return presentTemplate(getCatalogEntry(id));
}

function saveAutomatedMessage(id, { subject, body } = {}) {
  const entry = getCatalogEntry(id);
  const nextSubject = sanitizeCopy(subject).trim();
  const nextBody = sanitizeCopy(body).trim();
  if (!nextSubject) {
    throw new Error("Subject is required.");
  }
  if (!nextBody) {
    throw new Error("Message is required.");
  }
  if (nextSubject.length > SUBJECT_MAX) {
    throw new Error(`Subject must be ${SUBJECT_MAX} characters or fewer.`);
  }
  if (nextBody.length > BODY_MAX) {
    throw new Error(`Message must be ${BODY_MAX} characters or fewer.`);
  }
  const db = getDb();
  ensureSettingsTable(db);
  setCooperativeSetting(
    db,
    settingKey(entry.id),
    JSON.stringify({ subject: nextSubject, body: nextBody })
  );
  return presentTemplate(entry);
}

function resetAutomatedMessage(id) {
  const entry = getCatalogEntry(id);
  const db = getDb();
  ensureSettingsTable(db);
  db.prepare(`DELETE FROM cooperative_settings WHERE key = ?`).run(settingKey(entry.id));
  return presentTemplate(entry);
}

function renderAutomatedEmail(id, vars = {}) {
  const entry = getCatalogEntry(id);
  const copy = effectiveCopy(entry);
  const merged = {
    orgName: vars.orgName || organizationName(),
    portalUrl: vars.portalUrl || portalUrl(),
    ...vars,
  };
  const subject = capitalizeCooperativeWording(fillTemplate(copy.subject, merged));
  const text = capitalizeCooperativeWording(fillTemplate(copy.body, merged));
  return {
    subject,
    text,
    html: emailTextToHtml(text),
  };
}

module.exports = {
  CATALOG,
  fillTemplate,
  sanitizeCopy,
  emailTextToHtml,
  listAutomatedMessages,
  getAutomatedMessage,
  saveAutomatedMessage,
  resetAutomatedMessage,
  renderAutomatedEmail,
};
