const { getDb } = require("../db/database");
const {
  getCooperativeSetting,
  setCooperativeSetting,
} = require("./cooperative-settings");

const SETTING_MEMBER_EMAIL_NOTIFICATIONS = "member_email_notifications_enabled";

function memberEmailNotificationsEnabled() {
  return (
    String(getCooperativeSetting(SETTING_MEMBER_EMAIL_NOTIFICATIONS) || "").trim() === "1"
  );
}

function setMemberEmailNotificationsEnabled(enabled) {
  setCooperativeSetting(
    getDb(),
    SETTING_MEMBER_EMAIL_NOTIFICATIONS,
    enabled ? "1" : "0"
  );
  return memberEmailNotificationsEnabled();
}

module.exports = {
  SETTING_MEMBER_EMAIL_NOTIFICATIONS,
  memberEmailNotificationsEnabled,
  setMemberEmailNotificationsEnabled,
};
