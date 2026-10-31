import { env, isProd } from "../config/env.js";
import { withTimeout } from "../utils/async.js";

export const SMS_TIMEOUT_MS = 10_000;

export type SmsConfig = {
  MSG91_AUTH_KEY?: string;
  MSG91_TEMPLATE_ID?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
};

export function isMsg91Configured(cfg: SmsConfig = env): boolean {
  return Boolean(String(cfg.MSG91_AUTH_KEY ?? "").trim() && String(cfg.MSG91_TEMPLATE_ID ?? "").trim());
}

export function isTwilioConfigured(cfg: SmsConfig = env): boolean {
  return Boolean(
    String(cfg.TWILIO_ACCOUNT_SID ?? "").trim() &&
      String(cfg.TWILIO_AUTH_TOKEN ?? "").trim() &&
      String(cfg.TWILIO_FROM ?? "").trim()
  );
}

export function isSmsConfigured(cfg: SmsConfig = env): boolean {
  return isMsg91Configured(cfg) || isTwilioConfigured(cfg);
}

async function sendMsg91(phone: string, code: string, cfg: SmsConfig) {
  const mobile = phone.replace(/^\+/, "");
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("template_id", String(cfg.MSG91_TEMPLATE_ID).trim());
  url.searchParams.set("mobile", mobile);
  url.searchParams.set("otp", code);
  url.searchParams.set("otp_expiry", "5");
  const authkey = String(cfg.MSG91_AUTH_KEY).trim();
  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey },
      body: JSON.stringify({ OTP: code }),
    }),
    SMS_TIMEOUT_MS,
    "SMS provider timed out"
  );
  if (!res.ok) {
    console.error(`[sms] provider rejected the message (${res.status})`);
    throw new Error("SMS provider rejected the message");
  }
}

async function sendTwilio(phone: string, code: string, cfg: SmsConfig) {
  const sid = String(cfg.TWILIO_ACCOUNT_SID).trim();
  const token = String(cfg.TWILIO_AUTH_TOKEN).trim();
  const body = new URLSearchParams({
    To: phone,
    From: String(cfg.TWILIO_FROM).trim(),
    Body: `Your Place2Park verification code is ${code}. It expires in 5 minutes.`,
  });
  const res = await withTimeout(
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }),
    SMS_TIMEOUT_MS,
    "SMS provider timed out"
  );
  if (!res.ok) {
    console.error(`[sms] provider rejected the message (${res.status})`);
    throw new Error("SMS provider rejected the message");
  }
}

/** Sends the signup code. Development without SMS credentials logs it on the server only. */
export async function deliverSignupOtp(
  phone: string,
  code: string,
  deps: {
    cfg?: SmsConfig;
    isProd?: boolean;
    send?: (phone: string, code: string) => Promise<unknown>;
    log?: (msg: string) => void;
  } = {}
): Promise<"sent" | "logged"> {
  const cfg = deps.cfg ?? env;
  const production = deps.isProd ?? isProd;
  const log = deps.log ?? ((msg: string) => console.info(msg));
  const ready = deps.send ? true : isSmsConfigured(cfg);

  if (ready) {
    if (deps.send) await deps.send(phone, code);
    else if (isMsg91Configured(cfg)) await sendMsg91(phone, code, cfg);
    else await sendTwilio(phone, code, cfg);
    return "sent";
  }

  if (!production) {
    log(`[phone-otp] ${phone}: ${code}`);
    return "logged";
  }

  console.error("[sms] signup OTP skipped: SMS is not configured");
  throw new Error("SMS is not configured");
}

if (isProd && !isSmsConfigured()) {
  console.warn("[sms] signup OTP is not configured. Set MSG91 or Twilio credentials.");
}
