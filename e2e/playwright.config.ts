import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.E2E_PORT || "5055";
const webPort = process.env.E2E_WEB_PORT || "4173";
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;

const isolated = {
  NODE_ENV: "test",
  MONGODB_URI: "",
  REDIS_URL: " ",
  RESEND_API_KEY: "",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  EMAIL_FROM: "",
  ADMIN_NOTIFICATION_EMAIL: "",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  ADMIN_CONSOLE_PATH: "",
};

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../playwright-report" }],
  ],
  outputDir: "../test-results",
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      testIgnore: /0(2|3)-.*\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: [
    {
      command: "npm run e2e:api --prefix ../server",
      url: `${apiOrigin}/api/health`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        ...isolated,
        E2E_PORT: apiPort,
        E2E_CLIENT_ORIGIN: webOrigin,
      },
    },
    {
      command: "npm run dev:e2e --prefix ../client",
      url: webOrigin,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...isolated,
        E2E_API_ORIGIN: apiOrigin,
      },
    },
  ],
});
