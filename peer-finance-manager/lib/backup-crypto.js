"use strict";

// Passphrase-protected container for peerfinance.db backups.
// Format: MAGIC(8) | salt(16) | iv(12) | authTag(16) | ciphertext
// Key: scrypt(passphrase, salt, 32) at the app's password params.
// AES-256-GCM gives confidentiality + tamper detection: a wrong passphrase
// or a modified file fails authentication instead of restoring corrupt data.

const crypto = require("crypto");

const MAGIC = Buffer.from("PFMENC1\n");
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function isEncryptedBackup(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > MAGIC.length && buffer.subarray(0, MAGIC.length).equals(MAGIC);
}

function encryptBackup(plaintext, passphrase) {
  if (!Buffer.isBuffer(plaintext)) throw new Error("Backup payload must be a buffer.");
  if (!passphrase || String(passphrase).length < 8) {
    throw new Error("Encryption passphrase must be at least 8 characters.");
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(String(passphrase), salt, 32, SCRYPT_PARAMS);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBackup(buffer, passphrase) {
  if (!isEncryptedBackup(buffer)) {
    throw new Error("File is not a PFM encrypted backup.");
  }
  if (!passphrase) throw new Error("This backup is encrypted: enter its passphrase.");
  const salt = buffer.subarray(8, 24);
  const iv = buffer.subarray(24, 36);
  const tag = buffer.subarray(36, 52);
  const key = crypto.scryptSync(String(passphrase), salt, 32, SCRYPT_PARAMS);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(buffer.subarray(52)), decipher.final()]);
  } catch (_) {
    throw new Error("Decryption failed: wrong passphrase or corrupted backup file.");
  }
}

module.exports = { encryptBackup, decryptBackup, isEncryptedBackup };
