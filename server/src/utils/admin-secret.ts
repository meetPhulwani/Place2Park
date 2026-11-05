import crypto from "node:crypto";
import { unwrapEnvValue } from "../config/env.js";

const DEV_FALLBACK = "dev-only-admin-session-secret-change-me";
const DENIED_PATHS = new Set(["/admin", "/administrator", "/superadmin", "/admin-login", "/login", "/api"]);

export function adminSessionSecret() {
  const value = unwrapEnvValue(process.env.ADMIN_SESSION_SECRET);
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters in production.");
  }
  return DEV_FALLBACK;
}

export function assertAdminSessionSecret(nodeEnv: string, secret: string) {
  if (nodeEnv !== "production") return;
  if (secret.trim().length < 32 || secret === DEV_FALLBACK) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters in production.");
  }
}

export function adminConsolePath() {
  const value = unwrapEnvValue(process.env.ADMIN_CONSOLE_PATH);
  if (!value) return "";
  return value.startsWith("/") ? value.replace(/\/+$/, "") : `/${value.replace(/\/+$/, "")}`;
}

export function assertAdminConsolePath(nodeEnv: string, path: string) {
  if (nodeEnv !== "production") return;
  const value = path.trim().toLowerCase();
  if (
    path.trim().length < 24 ||
    !path.startsWith("/") ||
    path.includes("..") ||
    path.includes("//") ||
    DENIED_PATHS.has(value) ||
    value.includes("admin")
  ) {
    throw new Error("ADMIN_CONSOLE_PATH must be a long random path in production.");
  }
}

const DEV_TOTP_KEY = "dev-only-admin-totp-key-change-me!!";

export function assertTotpKey(nodeEnv: string, key: string, sessionSecret: string, jwtSecret: string) {
  if (nodeEnv !== "production") return;
  const value = key.trim();
  if (value.length < 32 || value === sessionSecret.trim() || value === jwtSecret.trim()) {
    throw new Error("ADMIN_TOTP_KEY must be a distinct 32+ character value in production.");
  }
}

export function sealSecret(plain: string) {
  return sealWithVersion(plain, currentKeyVersion());
}

export function openSecret(payload: string) {
  const versioned = /^v(\d+)\.(.+)$/.exec(payload);
  if (versioned) return decryptRaw(versioned[2], keyFor(Number(versioned[1])));
  return decryptRaw(payload, legacySessionKey());
}

/** Decrypts with the key version stored on the ciphertext, checks the plaintext, then seals with the current key. */
export function reencryptSecret(payload: string) {
  const plain = openSecret(payload);
  const next = sealSecret(plain);
  if (openSecret(next) !== plain) throw new Error("TOTP re-encryption check failed.");
  return next;
}

function sealWithVersion(plain: string, version = currentKeyVersion()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFor(version), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}.${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

function decryptRaw(payload: string, key: Buffer) {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function currentKeyVersion() {
  const version = Number(process.env.ADMIN_TOTP_KEY_VERSION || 1);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function keyFor(version: number) {
  return crypto.createHash("sha256").update(`totp-v${version}:${materialFor(version)}`).digest();
}

function materialFor(version: number) {
  if (version === currentKeyVersion()) return currentTotpKey();
  if (version === currentKeyVersion() - 1) return previousTotpKey();
  throw new Error("Unknown TOTP key version.");
}

function currentTotpKey() {
  const value = unwrapEnvValue(process.env.ADMIN_TOTP_KEY);
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_TOTP_KEY must be a distinct 32+ character value in production.");
  }
  return DEV_TOTP_KEY;
}

function previousTotpKey() {
  const value = unwrapEnvValue(process.env.ADMIN_TOTP_KEY_PREVIOUS);
  if (!value) throw new Error("ADMIN_TOTP_KEY_PREVIOUS is required to read the previous TOTP key.");
  return value;
}

function legacySessionKey() {
  return crypto.createHash("sha256").update(`admin-seal:${adminSessionSecret()}`).digest();
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
