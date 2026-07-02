#!/usr/bin/env node
/**
 * Ensure the platform super-admin account exists in registry.db.
 * Defaults: ydaramola@gmail.com / 12345678 (override with env vars on production).
 */
const { initPaths } = require("../lib/paths");
const { ensurePlatformAdminUser, DEFAULT_PLATFORM_ADMIN_EMAIL } = require("../lib/platform-auth-service");

initPaths();

const email = process.env.PLATFORM_ADMIN_EMAIL || DEFAULT_PLATFORM_ADMIN_EMAIL;
const password = process.env.PLATFORM_ADMIN_PASSWORD || "12345678";

try {
  const result = ensurePlatformAdminUser({ email, password });
  console.log(
    result.created
      ? `Created platform admin ${result.email} (id ${result.id})`
      : `Updated platform admin ${result.email} (id ${result.id})`
  );
  console.log("Sign in at /platform with this email and password.");
  if (!process.env.PLATFORM_ADMIN_PASSWORD) {
    console.log("Set PLATFORM_ADMIN_PASSWORD on Render for production and change this password after first login.");
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
