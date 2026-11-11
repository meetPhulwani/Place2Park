import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { env, isProd, unwrapEnvValue } from "../config/env.js";
import { timeouts } from "../config/timeouts.js";
import { isTimeoutError, withTimeout } from "../utils/async.js";
import { parseRetryAfter, retryOperation } from "../utils/retry.js";
import { e2eHooksEnabled } from "../testing/e2e-gate.js";
import { rememberTestCode } from "../testing/e2e-mailbox.js";

export type SmtpAuthConfig = {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  EMAIL_FROM?: string;
  ADMIN_NOTIFICATION_EMAIL?: string;
  SMTP_TEST_RECIPIENT?: string;
  RESEND_API_KEY?: string;
};

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
export const RESEND_TIMEOUT_MS = timeouts.resendMs;

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

export function isResendConfigured(cfg: SmtpAuthConfig = env): boolean {
  return Boolean(String(cfg.RESEND_API_KEY ?? "").trim());
}

/** Resend HTTPS is preferred; SMTP remains a fallback when no API key is set. */
export function isEmailConfigured(cfg: SmtpAuthConfig = env): boolean {
  return isResendConfigured(cfg) || isSmtpConfigured(cfg);
}

export function evaluateEmailDeliveryConfig(cfg: SmtpAuthConfig, production: boolean): EmailDeliveryReport {
  const warnings: string[] = [];
  if (!isEmailConfigured(cfg)) {
    if (production) warnings.push("[email] outbound email is disabled (set RESEND_API_KEY or SMTP_*).");
    return { sendEnabled: false, adminNotifyEnabled: false, adminRecipient: "", warnings };
  }

  const from = extractEmailAddress(cfg.EMAIL_FROM || cfg.SMTP_USER || "");
  let sendEnabled = true;
  if (production && isResendSandboxSender(from)) {
    warnings.push(
      "[email] EMAIL_FROM is the Resend sandbox domain. Verification codes can only be delivered to the Resend account address until EMAIL_FROM uses a verified domain."
    );
  }
  if (!from || (production && isPlaceholderEmail(from))) {
    sendEnabled = !production;
    if (production) {
      warnings.push("[email] EMAIL_FROM (or SMTP_USER) is missing or a placeholder domain; outbound email is disabled.");
    }
  }

  const admin = extractEmailAddress(cfg.ADMIN_NOTIFICATION_EMAIL || "");
  let adminNotifyEnabled = false;
  let adminRecipient = "";
  if (!admin) {
    if (production) warnings.push("[email] ADMIN_NOTIFICATION_EMAIL is not set; admin/payout emails are disabled.");
  } else if (production && isPlaceholderEmail(admin)) {
    warnings.push("[email] ADMIN_NOTIFICATION_EMAIL is a placeholder domain; admin/payout emails are disabled.");
  } else if (!isAlwaysBlockedRecipient(admin) && (!production || !isPlaceholderEmail(admin))) {
    adminNotifyEnabled = sendEnabled;
    adminRecipient = admin;
  } else if (production) {
    warnings.push("[email] ADMIN_NOTIFICATION_EMAIL is a placeholder domain; admin/payout emails are disabled.");
  }

  return { sendEnabled, adminNotifyEnabled, adminRecipient, warnings };
}

export function smtpTransportOptions(cfg: SmtpAuthConfig) {
  return {
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_PORT === 465,
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS },
    connectionTimeout: timeouts.smtpMs,
    greetingTimeout: timeouts.smtpMs,
    socketTimeout: timeouts.smtpMs,
  };
}

function redactEmailSecrets(value: string): string {
  return value
    .replace(/re_[A-Za-z0-9]+/g, "re_[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

/** Safe SMTP failure summary — no passwords, tokens, or raw server text. */
export function describeSmtpError(err: unknown): string {
  const e = err as { code?: string; command?: string; responseCode?: number };
  const parts = [e.code, e.command, e.responseCode != null ? String(e.responseCode) : ""].filter(
    (part) => part !== ""
  );
  return parts.length ? `SMTP ${parts.join(" ")}` : "SMTP delivery failed";
}

/** Resend's onboarding sender (*.resend.dev) delivers only to the account address. */
export function isResendSandboxSender(value: string): boolean {
  return emailDomain(value) === "resend.dev";
}

export type EmailFailureEvent = {
  requestId: string;
  stage: "configuration" | "recipient" | "provider";
  provider: "resend" | "smtp" | "none";
  providerStatus: number | null;
  category: string;
  config: {
    resendKey: boolean;
    emailFrom: boolean;
    sandboxSender: boolean;
    smtp: boolean;
  };
};

export function emailConfigPresence(cfg: SmtpAuthConfig = env): EmailFailureEvent["config"] {
  const from = cfg.EMAIL_FROM || cfg.SMTP_USER || "";
  return {
    resendKey: isResendConfigured(cfg),
    emailFrom: Boolean(extractEmailAddress(from)),
    sandboxSender: isResendSandboxSender(from),
    smtp: isSmtpConfigured(cfg),
  };
}

/** Maps a Resend error body to a fixed category. The provider message is not returned. */
export function resendFailureCategory(status: number, name: string, message: string): string {
  const label = `${name} ${message}`;
  if (/only send testing emails/i.test(label)) return "sandbox_recipient";
  if (/verify a domain|domain is not verified|not verified/i.test(label)) return "domain_not_verified";
  if (/invalid [`']?from[`']?/i.test(label)) return "invalid_sender";
  if (/invalid [`']?to[`']?/i.test(label)) return "invalid_recipient";
  if (status === 401 || (status === 403 && /restricted_api_key|unauthorized|invalid api key/i.test(label))) {
    return "unauthorized";
  }
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  if (status === 422) return "validation_error";
  return "provider_rejected";
}

export function buildEmailFailureEvent(requestId: string, err: unknown, cfg: SmtpAuthConfig = env): EmailFailureEvent {
  const e = err as {
    provider?: string;
    status?: number;
    name?: string;
    code?: string;
    message?: string;
    category?: string;
    responseCode?: number;
  };
  const message = e.message ?? "";
  const config = emailConfigPresence(cfg);
  if (/not configured/i.test(message)) {
    return { requestId, stage: "configuration", provider: "none", providerStatus: null, category: "missing_provider", config };
  }
  if (/disabled|placeholder/i.test(message)) {
    return {
      requestId,
      stage: "configuration",
      provider: "none",
      providerStatus: null,
      category: /placeholder/i.test(message) ? "placeholder_sender" : "sender_disabled",
      config,
    };
  }
  if (/Recipient is not/i.test(message)) {
    return {
      requestId,
      stage: "recipient",
      provider: "none",
      providerStatus: null,
      category: "undeliverable_recipient",
      config,
    };
  }
  const resend = e.provider === "resend" || /resend/i.test(`${e.provider ?? ""} ${message} ${e.name ?? ""}`);
  if (resend) {
    const timedOut = /timeout|abort|ETIMEDOUT/i.test(`${message} ${e.code ?? ""} ${e.name ?? ""}`);
    return {
      requestId,
      stage: "provider",
      provider: "resend",
      providerStatus: typeof e.status === "number" ? e.status : null,
      category: timedOut ? "timeout" : e.category || "provider_rejected",
      config,
    };
  }
  return {
    requestId,
    stage: "provider",
    provider: "smtp",
    providerStatus: typeof e.responseCode === "number" ? e.responseCode : null,
    category: "smtp_failure",
    config,
  };
}

/** Safe provider failure summary — status/code only; never keys or message bodies. */
export function describeEmailError(err: unknown): string {
  const e = err as {
    provider?: string;
    status?: number;
    name?: string;
    code?: string;
    message?: string;
  };
  const combined = `${e.provider ?? ""} ${e.message ?? ""} ${e.name ?? ""}`;
  if (e.provider === "resend" || /resend/i.test(combined)) {
    const timedOut = /timeout|abort|ETIMEDOUT/i.test(`${e.message ?? ""} ${e.code ?? ""} ${e.name ?? ""}`);
    const parts = ["Resend", e.status != null ? String(e.status) : "", timedOut ? "timeout" : e.name || ""].filter(
      (part) => part !== ""
    );
    return redactEmailSecrets(parts.join(" "));
  }
  return describeSmtpError(err);
}

function warnDelivery(log: (line: string) => void, lines: string[]) {
  for (const line of lines) log(line);
}

type EmailFetch = (input: string, init: RequestInit) => Promise<Response>;

export type MailDelivery = {
  provider: "resend" | "smtp" | "delegate";
  providerStatus: number | null;
};

async function deliverViaResend(
  payload: MailMessage & { from: string },
  apiKey: string,
  deps: { fetch?: EmailFetch; timeoutMs?: number; idempotencyKey?: string }
): Promise<number> {
  const fetchFn = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? RESEND_TIMEOUT_MS;
  const idempotencyKey = deps.idempotencyKey || randomUUID();
  const res = await retryOperation(
    async () => {
      try {
        return await withTimeout(
          fetchFn(RESEND_EMAILS_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
              from: payload.from,
              to: [extractEmailAddress(payload.to)],
              subject: payload.subject,
              text: payload.text,
              ...(payload.html ? { html: payload.html } : {}),
            }),
            signal: AbortSignal.timeout(timeoutMs),
          }),
          timeoutMs,
          "timeout contacting Resend"
        );
      } catch (err) {
        if (isTimeoutError(err)) {
          throw Object.assign(new Error("timeout contacting Resend"), { provider: "resend", code: "ETIMEDOUT" });
        }
        const code = err && typeof err === "object" ? String((err as { code?: string }).code ?? "") : "";
        if (code) throw Object.assign(err instanceof Error ? err : new Error("Resend request failed"), { provider: "resend", code });
        throw Object.assign(err instanceof Error ? err : new Error("Resend request failed"), { provider: "resend" });
      }
    },
    {
      service: "resend",
      operation: "send",
      maxAttempts: timeouts.emailAttempts,
      deadlineMs: timeoutMs * timeouts.emailAttempts + timeouts.retryMaxDelayMs,
      retryCategories: ["timeout", "transient_network", "server", "rate_limited"],
      retryableResult: (response) => {
        if (response.ok || response.status < 500) {
          if (response.status !== 408 && response.status !== 429) return null;
        }
        return {
          status: response.status,
          retryAfterMs: parseRetryAfter(response.headers?.get?.("retry-after")) ?? undefined,
        };
      },
    }
  );

  if (!res.ok) {
    let errorName = "";
    let errorMessage = "";
    try {
      const body = (await res.json()) as { name?: string; message?: string };
      errorName = String(body?.name ?? "").slice(0, 80);
      errorMessage = String(body?.message ?? "");
    } catch {
      errorName = "";
      errorMessage = "";
    }
    const category = resendFailureCategory(res.status, errorName, errorMessage);
    throw Object.assign(new Error(`Resend ${res.status}${errorName ? ` ${errorName}` : ""}`), {
      provider: "resend",
      status: res.status,
      name: errorName,
      category,
    });
  }
  return res.status;
}

export type OutboundMailDeps = {
  send?: (msg: MailMessage & { from: string }) => Promise<unknown>;
  cfg?: SmtpAuthConfig;
  isProd?: boolean;
  log?: (msg: string) => void;
  logFailure?: (event: EmailFailureEvent) => void;
  fetch?: EmailFetch;
  timeoutMs?: number;
  requestId?: string;
};

export async function sendMail(message: MailMessage, deps: OutboundMailDeps = {}): Promise<MailDelivery> {
  const cfg = deps.cfg ?? env;
  const requestId = deps.requestId ?? randomUUID();
  const logFailure =
    deps.logFailure ??
    ((event: EmailFailureEvent) => {
      console.error("[email] delivery_failed", event);
    });
  try {
    return await deliverOutboundMail(message, { ...deps, cfg, requestId });
  } catch (err) {
    try {
      logFailure(buildEmailFailureEvent(requestId, err, cfg));
    } catch {
      /* a logger failure must not hide the delivery error */
    }
    throw err;
  }
}

async function deliverOutboundMail(
  message: MailMessage,
  deps: OutboundMailDeps & { cfg: SmtpAuthConfig; requestId: string }
): Promise<MailDelivery> {
  const cfg = deps.cfg;
  const production = deps.isProd ?? isProd;
  const log = deps.log ?? ((msg: string) => console.warn(msg));
  if (!deps.send && !isEmailConfigured(cfg)) throw new Error("Email is not configured");

  const report = evaluateEmailDeliveryConfig(cfg, production);
  if (production && !report.sendEnabled) {
    warnDelivery(log, report.warnings);
    throw new Error("Email delivery is disabled: sender is not a deliverable production address.");
  }

  const to = extractEmailAddress(message.to);
  if (isAlwaysBlockedRecipient(to) || (production && isPlaceholderEmail(to))) {
    log(`[email] skipped undeliverable recipient domain ${emailDomain(to) || "invalid"}`);
    throw new Error("Recipient is not a deliverable production address.");
  }

  const from = unwrapEnvValue(cfg.EMAIL_FROM || cfg.SMTP_USER || "");
  const payload = { from, ...message };
  if (deps.send) {
    await deps.send(payload);
    return { provider: "delegate", providerStatus: null };
  }
  if (isResendConfigured(cfg)) {
    console.info("[email] sending via Resend", { toDomain: emailDomain(to) || "invalid" });
    const providerStatus = await deliverViaResend(payload, String(cfg.RESEND_API_KEY), {
      fetch: deps.fetch,
      timeoutMs: deps.timeoutMs,
      idempotencyKey: deps.requestId,
    });
    console.info("[email] Resend accepted", { toDomain: emailDomain(to) || "invalid", providerStatus });
    return { provider: "resend", providerStatus };
  }
  const transporter = nodemailer.createTransport(smtpTransportOptions(cfg));
  await withTimeout(transporter.sendMail(payload), timeouts.smtpMs, "timeout contacting the mail server");
  return { provider: "smtp", providerStatus: null };
}

export function configuredSmtpTestRecipient(cfg: SmtpAuthConfig = env): string {
  const explicit = extractEmailAddress(cfg.SMTP_TEST_RECIPIENT || "");
  if (explicit && !isPlaceholderEmail(explicit)) return explicit;
  const admin = extractEmailAddress(cfg.ADMIN_NOTIFICATION_EMAIL || "");
  if (admin && !isPlaceholderEmail(admin)) return admin;
  return "";
}

/**
 * Sends one SMTP probe to the configured test inbox. Never looks up users.
 * Requires confirm: true and an exact match to SMTP_TEST_RECIPIENT or ADMIN_NOTIFICATION_EMAIL.
 */
export async function sendSmtpTestMessage(
  input: { to?: string; confirm?: boolean },
  deps: {
    send?: (msg: MailMessage & { from: string }) => Promise<unknown>;
    cfg?: SmtpAuthConfig;
    isProd?: boolean;
    log?: (msg: string) => void;
  } = {}
): Promise<{ sent: true; to: string; from: string }> {
  if (input.confirm !== true) {
    throw new Error("SMTP test messages require confirm: true.");
  }
  const cfg = deps.cfg ?? env;
  const allowed = configuredSmtpTestRecipient(cfg);
  if (!allowed) {
    throw new Error("Set SMTP_TEST_RECIPIENT or ADMIN_NOTIFICATION_EMAIL to a deliverable test inbox.");
  }
  const to = extractEmailAddress(input.to || allowed);
  if (to !== allowed) {
    throw new Error("Recipient must match the configured test recipient.");
  }
  if (isPlaceholderEmail(to)) {
    throw new Error("Recipient is not a deliverable production address.");
  }
  const from = cfg.EMAIL_FROM || cfg.SMTP_USER || "";
  await sendMail(
    {
      to,
      subject: "Place2Park SMTP test",
      text: "This is an explicit Place2Park SMTP configuration test. No booking, payment, or payout was created.",
    },
    deps
  );
  return { sent: true, to, from: extractEmailAddress(from) };
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
    if (production) warnDelivery(log, report.warnings.length ? report.warnings : ["[email] ADMIN_NOTIFICATION_EMAIL is not set; admin/payout emails are disabled."]);
    return "skipped";
  }
  try {
    await sendMail(
      { to: report.adminRecipient, subject: input.subject, text: input.text },
      { send: deps.send, cfg, isProd: production, log }
    );
    return "sent";
  } catch (err) {
    console.error(`[email] admin notify failed: ${describeEmailError(err)}`);
    return "skipped";
  }
}

/** Emails a signup or Google verification code. The code is never written to logs. */
export async function deliverVerificationCode(
  input: { email: string; code: string },
  deps: OutboundMailDeps = {}
): Promise<MailDelivery> {
  if (e2eHooksEnabled()) {
    rememberTestCode(input.email, input.code);
    return { provider: "delegate", providerStatus: null };
  }
  return sendMail(
    {
      to: input.email,
      subject: "Your Place2Park verification code",
      text: `Your Place2Park verification code is ${input.code}. It expires in 5 minutes.\n`,
    },
    deps
  );
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
  const emailReady = deps.smtpReady ?? isEmailConfigured(deps.cfg ?? env);
  const production = deps.isProd ?? isProd;
  const log = deps.log ?? ((msg: string) => console.info(msg));

  if (emailReady) {
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
      console.error(`[email] password-reset failed: ${describeEmailError(err)}`);
      throw err;
    }
    return "sent";
  }

  if (!production) {
    log(`[password-reset] ${input.email}: ${resetUrl}`);
    return "logged";
  }

  console.error("[email] password-reset skipped: email is not configured");
  throw new Error("Email is not configured");
}

if (isProd) {
  for (const line of evaluateEmailDeliveryConfig(env, true).warnings) {
    console.warn(line);
  }
}
