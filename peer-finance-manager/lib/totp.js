"use strict";

// RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits) + base32 secrets.
// Dependency-free: crypto only. Compatible with Google Authenticator,
// Microsoft Authenticator, Authy, 1Password, etc.

const crypto = require("crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(str) {
  const clean = String(str || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  // 160-bit secret: standard for TOTP, encodes to 32 base32 chars.
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, "0");
}

function totp(secretBase32, timestampMs = Date.now()) {
  return hotp(secretBase32, Math.floor(timestampMs / 30000));
}

/** Constant-work verify: checks current step plus one step each side. */
function verifyTotp(secretBase32, code, { window = 1, timestampMs = Date.now() } = {}) {
  const given = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return false;
  const counter = Math.floor(timestampMs / 30000);
  for (let drift = -window; drift <= window; drift++) {
    const expected = hotp(secretBase32, counter + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

function buildOtpauthUri({ secret, account, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  generateSecret,
  totp,
  verifyTotp,
  buildOtpauthUri,
  base32Encode,
  base32Decode,
};
