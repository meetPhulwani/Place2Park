import nodemailer from "nodemailer";
import { env, isProd } from "../config/env.js";

export type SmtpAuthConfig = {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  EMAIL_FROM?: string;
  ADMIN_NOTIFICATION_EMAIL?: string;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailDeliveryReport = {
  sendEnabled: boolean;
  adminNotifyEnabled: boolean;
  adminRecipient: string;
  warnings: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost"]);
const ALWAYS_BLOCKED_TLDS = new Set(["test", "invalid", "localhost"]);
const FIXTURE_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "parkly.dev",
  "parkly.test",
  "parkly.example",
]);

export function extractEmailAddress(value: string): string {
  const trimmed = String(value ?? "").trim();
  const angled = trimmed.match(/<\s*([^>]+)\s*>/);
  return (angled?.[1] ?? trimmed).trim().toLowerCase();
}

function emailDomain(email: string): string {
  return extractEmailAddress(email).split("@")[1] ?? "";
}

function emailTld(email: string): string {
  const parts = emailDomain(email).split(".");
  return parts[parts.length - 1] ?? "";
}

/** Reserved / seed / docs addresses that must never be production recipients or senders. */
export function isPlaceholderEmail(value: string): boolean {
  const email = extractEmailAddress(value);
  if (!email || !EMAIL_RE.test(email)) return true;
  if (RESERVED_TLDS.has(emailTld(email))) return true;
  return FIXTURE_DOMAINS.has(emailDomain(email));
}

function isAlwaysBlockedRecipient(value: string): boolean {
  const email = extractEmailAddress(value);
  if (!email || !EMAIL_RE.test(email)) return true;
  return ALWAYS_BLOCKED_TLDS.has(emailTld(email));
}

export function isSmtpConfigured(cfg: SmtpAuthConfig = env): boolean {
  return Boolean(cfg.SMTP_HOST && cfg.SMTP_PORT && cfg.SMTP_USER && cfg.SMTP_PASS);
}

export function evaluateEmailDeliveryConfig(cfg: SmtpAuthConfig, production: boolean): EmailDeliveryReport {
  const warnings: string[] = [];
  if (!isSmtpConfigured(cfg)) {
    if (production) warnings.push("[smtp] SMTP is not fully configured; outbound email is disabled.");
    return { sendEnabled: false, adminNotifyEnabled: false, adminRecipient: "", warnings };
  }

  const from = extractEmailAddress(cfg.EMAIL_FROM || cfg.SMTP_USER || "");
  let sendEnabled = true;
  if (!from || (production && isPlaceholderEmail(from))) {
    sendEnabled = !production;
    if (production) {
      warnings.push("[smtp] EMAIL_FROM (or SMTP_USER) is missing or a placeholder domain; outbound email is disabled.");
    }
  }

  const admin = extractEmailAddress(cfg.ADMIN_NOTIFICATION_EMAIL || "");
  let adminNotifyEnabled = false;
  let adminRecipient = "";
  if (!admin) {
    if (production) warnings.push("[smtp] ADMIN_NOTIFICATION_EMAIL is not set; admin/payout emails are disabled.");
  } else if (production && isPlaceholderEmail(admin)) {
    warnings.push("[smtp] ADMIN_NOTIFICATION_EMAIL is a placeholder domain; admin/payout emails are disabled.");
  } else if (!isAlwaysBlockedRecipient(admin) && (!production || !isPlaceholderEmail(admin))) {
    adminNotifyEnabled = sendEnabled;
    adminRecipient = admin;
  } else if (production) {
    warnings.push("[smtp] ADMIN_NOTIFICATION_EMAIL is a placeholder domain; admin/payout emails are disabled.");
  }

  return { sendEnabled, adminNotifyEnabled, adminRecipient, warnings };
}

export function smtpTransportOptions(cfg: SmtpAuthConfig) {
  return {
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_PORT === 465,
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS },
  };
}

/** Safe SMTP failure summary — no passwords, tokens, or raw server text. */
export function describeSmtpError(err: unknown): string {
  const e = err as { code?: string; command?: string; responseCode?: number };
  const parts = [e.code, e.command, e.responseCode != null ? String(e.responseCode) : ""].filter(
    (part) => part !== ""
  );
  return parts.length ? `SMTP ${parts.join(" ")}` : "SMTP delivery failed";
}

function warnDelivery(log: (line: string) => void, lines: string[]) {
  for (const line of lines) log(line);
}

export async function sendMail(
  message: MailMessage,
  deps: {
    send?: (msg: MailMessage & { from: string }) => Promise<unknown>;
    cfg?: SmtpAuthConfig;
    isProd?: boolean;
    log?: (msg: string) => void;
  } = {}
) {
  const cfg = deps.cfg ?? env;
  const production = deps.isProd ?? isProd;
  const log = deps.log ?? ((msg: string) => console.warn(msg));
  if (!isSmtpConfigured(cfg)) throw new Error("SMTP is not configured");

  const report = evaluateEmailDeliveryConfig(cfg, production);
  if (production && !report.sendEnabled) {
    warnDelivery(log, report.warnings);
    throw new Error("Email delivery is disabled: sender is not a deliverable production address.");
  }

  const to = extractEmailAddress(message.to);
  if (isAlwaysBlockedRecipient(to) || (production && isPlaceholderEmail(to))) {
    log(`[smtp] skipped undeliverable recipient domain ${emailDomain(to) || "invalid"}`);
    throw new Error("Recipient is not a deliverable production address.");
  }

  const from = cfg.EMAIL_FROM || cfg.SMTP_USER;
  const payload = { from, ...message };
  if (deps.send) {
    await deps.send(payload);
    return;
  }
  const transporter = nodemailer.createTransport(smtpTransportOptions(cfg));
  await transporter.sendMail(payload);
}

export async function notifyAdmin(
  input: { subject: string; text: string },
  deps: {
    send?: (msg: MailMessage) => Promise<unknown>;
    cfg?: SmtpAuthConfig;
    isProd?: boolean;
    log?: (msg: string) => void;
  } = {}
): Promise<"sent" | "skipped"> {
  const cfg = deps.cfg ?? env;
  const production = deps.isProd ?? isProd;
  const log = deps.log ?? ((msg: string) => console.warn(msg));
  const report = evaluateEmailDeliveryConfig(cfg, production);
  if (!report.adminNotifyEnabled || !report.adminRecipient) {
    if (production) warnDelivery(log, report.warnings.length ? report.warnings : ["[smtp] ADMIN_NOTIFICATION_EMAIL is not set; admin/payout emails are disabled."]);
    return "skipped";
  }
  try {
    await sendMail(
      { to: report.adminRecipient, subject: input.subject, text: input.text },
      { send: deps.send, cfg, isProd: production, log }
    );
    return "sent";
  } catch (err) {
    console.error(`[smtp] admin notify failed: ${describeSmtpError(err)}`);
    return "skipped";
  }
}

export async function deliverPasswordResetLink(
  input: { email: string; token: string; clientUrl: string },
  deps: {
    smtpReady?: boolean;
    isProd?: boolean;
    send?: (msg: MailMessage) => Promise<unknown>;
    log?: (msg: string) => void;
    cfg?: SmtpAuthConfig;
  } = {}
): Promise<"sent" | "logged"> {
  const resetUrl = `${input.clientUrl.replace(/\/$/, "")}/reset-password?token=${input.token}`;
  const smtpReady = deps.smtpReady ?? isSmtpConfigured(deps.cfg ?? env);
  const production = deps.isProd ?? isProd;
  const log = deps.log ?? ((msg: string) => console.info(msg));

  if (smtpReady) {
    try {
      await sendMail(
        {
          to: input.email,
          subject: "Reset your Place2Park password",
          text: `Use this link to reset your password. It expires in 30 minutes.\n\n${resetUrl}\n`,
        },
        { send: deps.send, cfg: deps.cfg, isProd: production, log }
      );
    } catch (err) {
      console.error(`[smtp] password-reset failed: ${describeSmtpError(err)}`);
      throw err;
    }
    return "sent";
  }

  if (!production) {
    log(`[password-reset] ${input.email}: ${resetUrl}`);
    return "logged";
  }

  console.error("[smtp] password-reset skipped: SMTP is not configured");
  throw new Error("SMTP is not configured");
}

if (isProd) {
  for (const line of evaluateEmailDeliveryConfig(env, true).warnings) {
    console.warn(line);
  }
}
