/**
 * Boots the API for browser tests only.
 * Environment is assigned before the server module loads. dotenv will not
 * replace these values, so this process cannot reach the production database,
 * mail provider, or payment provider.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tempDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.tmp-mongo");
fs.mkdirSync(tempDir, { recursive: true });
process.env.TEMP = tempDir;
process.env.TMP = tempDir;
const blocked = [
  "MONGODB_URI",
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "EMAIL_FROM",
  "ADMIN_NOTIFICATION_EMAIL",
  "SMTP_TEST_RECIPIENT",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ADMIN_CONSOLE_PATH",
  "ADMIN_SESSION_SECRET",
  "ADMIN_TOTP_KEY",
];

for (const key of blocked) process.env[key] = "";

process.env.NODE_ENV = "test";
process.env.PORT = process.env.E2E_PORT || "5055";
process.env.REDIS_URL = " ";
process.env.MONGODB_DB = "parkly-e2e";
process.env.CLIENT_URL = process.env.E2E_CLIENT_ORIGIN || "http://127.0.0.1:4173";
process.env.JWT_SECRET = "e2e-only-jwt-secret-not-for-production-use";
process.env.PAYOUT_ENCRYPTION_KEY = "e2e-only-payout-key-not-for-production";
process.env.E2E_TEST_HOOKS = "1";
process.env.ADMIN_CONSOLE_PATH = "/e2e-console";
process.env.RAZORPAY_KEY_ID = "rzp_test_e2e_local_only";
process.env.RAZORPAY_KEY_SECRET = "e2e-only-checkout-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "e2e-only-webhook-secret";
process.env.RATE_LIMIT_API = "10000";
process.env.RATE_LIMIT_LOGIN = "100";
process.env.RATE_LIMIT_SIGNUP = "100";
process.env.RATE_LIMIT_OTP_VERIFY = "50";
process.env.RATE_LIMIT_OTP_VERIFY_IP = "50";
process.env.RATE_LIMIT_OTP_RESEND = "50";
process.env.RATE_LIMIT_OTP_RESEND_IP = "50";
process.env.RATE_LIMIT_BOOKING = "100";
process.env.RATE_LIMIT_PAYMENT_ORDER = "100";
process.env.RATE_LIMIT_PAYOUT_DETAILS = "100";
process.env.RATE_LIMIT_CONSOLE_LOGIN = "100";
process.env.RATE_LIMIT_CONSOLE_STEP = "100";
process.env.RATE_LIMIT_CONSOLE_RESEND = "50";
process.env.RATE_LIMIT_ACCOUNT_DELETE = "30";

if (process.env.MONGODB_URI) {
  console.error("Refusing to start browser tests with a database URI set.");
  process.exit(1);
}

await import("../server.js");

export {};
