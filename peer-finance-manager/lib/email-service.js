const nodemailer = require("nodemailer");
const { trace } = require("./trace-log");

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getSmtpTransport() {
  if (!isEmailConfigured()) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

function formatFromAddress() {
  const address = process.env.SMTP_FROM;
  const name = process.env.SMTP_FROM_NAME || "Peer Finance Manager";
  return `"${name.replace(/"/g, "")}" <${address}>`;
}

async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    trace.warn("Email skipped — SMTP not configured", { to, subject });
    return { sent: false, skipped: true, reason: "not_configured" };
  }
  const transport = getSmtpTransport();
  await transport.sendMail({
    from: formatFromAddress(),
    to,
    subject,
    text,
    html,
  });
  return { sent: true, to };
}

module.exports = {
  isEmailConfigured,
  sendEmail,
};
