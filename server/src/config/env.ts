import dotenv from "dotenv";
import { ENV_FILE } from "./paths.js";

dotenv.config({ path: ENV_FILE });

/** Render values are sometimes pasted with the quotes from a .env line. */
export function unwrapEnvValue(value: string | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export const env = {
  PORT: Number(process.env.PORT ?? 5000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  MONGODB_URI: process.env.MONGODB_URI ?? "",
  MONGODB_DB: process.env.MONGODB_DB ?? "parkly",
  JWT_SECRET: process.env.JWT_SECRET ?? "",
  CLIENT_URL: process.env.CLIENT_URL ?? "http://localhost:5173",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ?? "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ?? "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  EMAIL_FROM: unwrapEnvValue(process.env.EMAIL_FROM),
  ADMIN_NOTIFICATION_EMAIL: unwrapEnvValue(process.env.ADMIN_NOTIFICATION_EMAIL),
  SMTP_TEST_RECIPIENT: unwrapEnvValue(process.env.SMTP_TEST_RECIPIENT),
  RESEND_API_KEY: unwrapEnvValue(process.env.RESEND_API_KEY),
  SMTP_HOST: unwrapEnvValue(process.env.SMTP_HOST),
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 0),
  SMTP_USER: unwrapEnvValue(process.env.SMTP_USER),
  SMTP_PASS: unwrapEnvValue(process.env.SMTP_PASS),
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? "",
  PAYOUT_ENCRYPTION_KEY: unwrapEnvValue(process.env.PAYOUT_ENCRYPTION_KEY),
};

export const isProd = env.NODE_ENV === "production";

/** Production boot check. Development may omit the webhook secret. Never log the value. */
export function assertRazorpayWebhookSecret(nodeEnv: string, webhookSecret: string) {
  if (nodeEnv === "production" && !String(webhookSecret ?? "").trim()) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is required in production.");
  }
}

const DEV_JWT_FALLBACK = "dev-only-secret-change-me";
if (!env.JWT_SECRET) {
  if (isProd) throw new Error("JWT_SECRET is required in production.");
  env.JWT_SECRET = DEV_JWT_FALLBACK;
  console.warn("[env] JWT_SECRET not set — using an insecure dev default.");
}
if (isProd && (env.JWT_SECRET === DEV_JWT_FALLBACK || env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be a strong unique value in production.");
}
if (isProd && !env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required in production.");
}
if (isProd && (!env.CLIENT_URL || /localhost|127\.0\.0\.1/.test(env.CLIENT_URL))) {
  throw new Error("CLIENT_URL must be the public site origin in production.");
}
if (isProd && (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET)) {
  throw new Error("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required in production.");
}
assertRazorpayWebhookSecret(env.NODE_ENV, env.RAZORPAY_WEBHOOK_SECRET);

/** Production bank-account encryption. Development may keep using the legacy key. Never log the value. */
export function assertPayoutEncryptionKey(nodeEnv: string, key: string) {
  if (nodeEnv !== "production") return;
  if (String(key ?? "").trim().length < 32) {
    throw new Error("PAYOUT_ENCRYPTION_KEY must be at least 32 characters in production.");
  }
}

assertPayoutEncryptionKey(env.NODE_ENV, env.PAYOUT_ENCRYPTION_KEY);
