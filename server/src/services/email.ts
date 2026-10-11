import nodemailer from "nodemailer";
import { env, isProd } from "../config/env.js";

export type SmtpAuthConfig = {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  EMAIL_FROM?: string;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function isSmtpConfigured(cfg: SmtpAuthConfig = env): boolean {
  return Boolean(cfg.SMTP_HOST && cfg.SMTP_PORT && cfg.SMTP_USER && cfg.SMTP_PASS);
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

export async function sendMail(
  message: MailMessage,
  deps: { send?: (msg: MailMessage & { from: string }) => Promise<unknown>; cfg?: SmtpAuthConfig } = {}
) {
  const cfg = deps.cfg ?? env;
  if (!isSmtpConfigured(cfg)) throw new Error("SMTP is not configured");
  const from = cfg.EMAIL_FROM || cfg.SMTP_USER;
  const payload = { from, ...message };
  if (deps.send) {
    await deps.send(payload);
    return;
  }
  const transporter = nodemailer.createTransport(smtpTransportOptions(cfg));
  await transporter.sendMail(payload);
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
        { send: deps.send, cfg: deps.cfg }
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
