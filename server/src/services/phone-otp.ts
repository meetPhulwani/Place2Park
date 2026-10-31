import crypto from "node:crypto";
import { PhoneOtp } from "../models/PhoneOtp.js";
import { User } from "../models/User.js";
import { ApiError } from "../middleware/error.js";
import { env } from "../config/env.js";
import { deliverSignupOtp } from "./sms.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60 * 1000;

/** Milliseconds until another code can be sent. Zero means a send is allowed. */
export function otpResendWaitMs(sentAt: Date | null | undefined, now = Date.now()) {
  if (!sentAt) return 0;
  const left = OTP_RESEND_MS - (now - sentAt.getTime());
  return left > 0 ? left : 0;
}

export function hashOtp(phone: string, code: string, secret = env.JWT_SECRET) {
  return crypto.createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export function generateOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function issuePhoneOtp(phone: string) {
  const existing = await User.findOne({ phone }).select("_id");
  if (existing) throw new ApiError(409, "An account with this phone number already exists.");

  const current = await PhoneOtp.findOne({ phone }).select("sentAt");
  if (otpResendWaitMs(current?.sentAt) > 0) {
    throw new ApiError(429, "Wait a minute before requesting another code.");
  }

  const code = generateOtpCode();
  await PhoneOtp.findOneAndUpdate(
    { phone },
    { $set: { codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 } },
    { upsert: true }
  );

  try {
    await deliverSignupOtp(phone, code);
  } catch {
    throw new ApiError(503, "We couldn't send the verification code. Try again shortly.");
  }
  await PhoneOtp.updateOne({ phone }, { $set: { sentAt: new Date() } });
}

export async function consumePhoneOtp(phone: string, code: string) {
  const doc = await PhoneOtp.findOne({ phone }).select("+codeHash");
  if (!doc || doc.expiresAt.getTime() <= Date.now() || doc.attempts >= MAX_ATTEMPTS) {
    throw new ApiError(400, "That code is incorrect or has expired.");
  }

  const expected = Buffer.from(doc.codeHash, "hex");
  const actual = Buffer.from(hashOtp(phone, code), "hex");
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!matches) {
    await PhoneOtp.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    throw new ApiError(400, "That code is incorrect or has expired.");
  }

  await PhoneOtp.deleteOne({ _id: doc._id });
}
