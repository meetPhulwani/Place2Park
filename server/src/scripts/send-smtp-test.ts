/**
 * Explicit SMTP probe. Does not send unless both --to and --confirm are passed,
 * and --to matches SMTP_TEST_RECIPIENT or ADMIN_NOTIFICATION_EMAIL.
 *
 *   npx tsx src/scripts/send-smtp-test.ts --to you@your-domain --confirm
 *
 * Never run this from boot, CI, or seed. It does not create bookings or payouts.
 */
import { sendSmtpTestMessage } from "../services/email.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const to = argValue("--to");
  const confirm = process.argv.includes("--confirm");
  if (!to || !confirm) {
    console.error("Usage: npx tsx src/scripts/send-smtp-test.ts --to you@your-domain --confirm");
    process.exit(1);
  }
  const result = await sendSmtpTestMessage({ to, confirm: true });
  console.info(`[smtp-test] sent=${result.sent} to=${result.to} from=${result.from}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : "SMTP test failed.";
  console.error(`[smtp-test] ${message}`);
  process.exit(1);
});
