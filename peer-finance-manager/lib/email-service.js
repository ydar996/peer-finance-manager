const nodemailer = require("nodemailer");
const { trace } = require("./trace-log");

function isRelayConfigured() {
  return Boolean(
    process.env.EMAIL_RELAY_URL &&
      process.env.EMAIL_RELAY_SECRET &&
      process.env.SMTP_FROM
  );
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function isEmailConfigured() {
  return isRelayConfigured() || isSmtpConfigured();
}

function getSmtpTransport() {
  if (!isSmtpConfigured()) return null;
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

async function sendViaRelay({ to, subject, text, html }) {
  const response = await fetch(process.env.EMAIL_RELAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PFM-Relay-Secret": process.env.EMAIL_RELAY_SECRET,
    },
    body: JSON.stringify({
      to,
      subject,
      text,
      html,
      from: process.env.SMTP_FROM,
      fromName: process.env.SMTP_FROM_NAME || "Peer Finance Manager",
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && payload.error) ||
      `Relay HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || "Relay send failed");
  }

  return { sent: true, to, via: "relay" };
}

async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    trace.warn("Email skipped — not configured", { to, subject });
    return { sent: false, skipped: true, reason: "not_configured" };
  }

  if (isRelayConfigured()) {
    const result = await sendViaRelay({ to, subject, text, html });
    return result;
  }

  const transport = getSmtpTransport();
  await transport.sendMail({
    from: formatFromAddress(),
    to,
    subject,
    text,
    html,
  });
  return { sent: true, to, via: "smtp" };
}

module.exports = {
  isEmailConfigured,
  isRelayConfigured,
  isSmtpConfigured,
  sendEmail,
};
