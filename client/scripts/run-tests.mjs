/**
 * Runs the existing client node:test files. No network, database, or secrets.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coverage = process.argv.includes("--coverage");

const files = [
  "src/lib/media-url.test.ts",
  "src/lib/payout-reveal.test.ts",
  "src/lib/demo-accounts.test.ts",
  "src/lib/cancel-booking.test.ts",
  "src/lib/space-coords.test.ts",
  "src/lib/recent-places.test.ts",
  "src/lib/booking-timeline.test.ts",
  "src/lib/destination.test.ts",
  "src/lib/google-auth.test.ts",
  "src/lib/api-base.test.ts",
  "src/lib/search-summary.test.ts",
  "src/lib/map-camera.test.ts",
  "src/lib/suggestion-menu.test.ts",
  "src/lib/faq-search.test.ts",
  "src/lib/safe-next.test.ts",
  "src/lib/http-error.test.ts",
  "src/lib/request-timeout.test.ts",
  "src/lib/retry.test.ts",
  "src/lib/analytics.test.ts",
  "src/lib/confirm-deletion.test.ts",
  "src/services/api-auth.test.ts",
  "src/lib/account-nav.test.ts",
];

const nodeArgs = [];
if (coverage) {
  nodeArgs.push("--experimental-test-coverage", "--test-coverage-exclude=src/**/*.test.ts");
}
nodeArgs.push(
  "--import",
  "../server/node_modules/tsx/dist/loader.mjs",
  "--test",
  "--test-concurrency=1",
  ...files
);

const child = spawn(process.execPath, nodeArgs, {
  cwd: root,
  env: { ...process.env, NODE_ENV: "test" },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
