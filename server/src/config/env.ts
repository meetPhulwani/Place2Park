import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

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
};

export const isProd = env.NODE_ENV === "production";

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
