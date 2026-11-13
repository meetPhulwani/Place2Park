/**
 * Runs the existing node:test files with mail, payment, and database
 * credentials cleared first. dotenv does not override variables that are
 * already set, so the real .env cannot point this process at production.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.resolve(root, "..", ".tmp-mongo");
fs.mkdirSync(tempDir, { recursive: true });

const UNIT = [
  "src/utils/pricing.test.ts",
  "src/utils/async.test.ts",
  "src/utils/retry.test.ts",
  "src/app-root.test.ts",
  "src/shutdown.test.ts",
  "src/middleware/request-timeout.test.ts",
  "src/utils/rate-limit.test.ts",
  "src/utils/listing-schema.test.ts",
  "src/utils/signup-credentials.test.ts",
  "src/utils/privacy.test.ts",
  "src/utils/console-asset.test.ts",
  "src/config/env.test.ts",
  "src/testing/e2e-gate.test.ts",
  "src/config/vercel-rewrite.test.ts",
  "src/config/cors.test.ts",
  "src/models/user-public.test.ts",
  "src/services/payments.test.ts",
  "src/services/email.test.ts",
  "src/services/availability.test.ts",
];

const INTEGRATION = [
  "src/services/bookings-cancel.test.ts",
  "src/services/bookings-confirm.test.ts",
  "src/services/bookings-late-payment.test.ts",
  "src/utils/indexes.test.ts",
  "src/utils/legacy-payout-keys.test.ts",
  "src/services/media.test.ts",
  "src/services/listings-moderation.test.ts",
  "src/services/payouts.test.ts",
  "src/services/refunds-occupancy.test.ts",
  "src/services/auth-security.test.ts",
  "src/services/email-otp.test.ts",
  "src/services/security-remediation.test.ts",
  "src/services/support.test.ts",
  "src/services/faqs.test.ts",
  "src/services/input-validation.test.ts",
  "src/services/admin-console.test.ts",
  "src/services/admin-remediation.test.ts",
  "src/services/admin-otp-delivery.test.ts",
  "src/services/account-deletion.test.ts",
  "src/services/account-settings.test.ts",
];

const args = process.argv.slice(2);
const coverage = args.includes("--coverage");
const suiteFlag = args.indexOf("--suite");
const suite = suiteFlag >= 0 ? args[suiteFlag + 1] : "all";
const files = suite === "unit" ? UNIT : suite === "integration" ? INTEGRATION : [...UNIT, ...INTEGRATION];

if (!files.length || (suite !== "unit" && suite !== "integration" && suite !== "all")) {
  console.error("Usage: node ./scripts/run-node-tests.mjs [--coverage] [--suite unit|integration|all]");
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: "test",
  E2E_TEST_HOOKS: "",
  TEMP: tempDir,
  TMP: tempDir,
  MONGODB_URI: "",
  REDIS_URL: " ",
  RESEND_API_KEY: "",
  SMTP_HOST: "",
  SMTP_PORT: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  EMAIL_FROM: "",
  ADMIN_NOTIFICATION_EMAIL: "",
  SMTP_TEST_RECIPIENT: "",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
};

const nodeArgs = [];
if (coverage) {
  nodeArgs.push("--experimental-test-coverage", "--test-coverage-exclude=src/**/*.test.ts");
}
nodeArgs.push("--import", "tsx", "--test", "--test-concurrency=1", ...files);

const child = spawn(process.execPath, nodeArgs, { cwd: root, env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
