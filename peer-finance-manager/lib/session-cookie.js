"use strict";

// Session cookies: HttpOnly + SameSite=Lax keeps tokens out of JS-readable
// storage and out of cross-site POSTs. Bearer/X-Session-Token headers stay
// supported for programmatic clients.

const SESSION_COOKIE = "pfm_session";
const PLATFORM_COOKIE = "pfm_platform";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(req) {
  const header = String(req.headers?.cookie || "");
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch (_) {
      out[name] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(req.secure),
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  };
}

function setAuthCookie(res, req, token, name = SESSION_COOKIE) {
  if (!token) return;
  res.cookie(name, token, cookieOptions(req));
}

function clearAuthCookie(res, req, name = SESSION_COOKIE) {
  const { maxAge, ...opts } = cookieOptions(req);
  res.clearCookie(name, opts);
}

function hasSessionCookie(req, name = SESSION_COOKIE) {
  return Boolean(parseCookies(req)[name]);
}

module.exports = {
  SESSION_COOKIE,
  PLATFORM_COOKIE,
  parseCookies,
  setAuthCookie,
  clearAuthCookie,
  hasSessionCookie,
};
