import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { EmailOtpPending } from "../models/EmailOtpPending.js";
import { User } from "../models/User.js";
import { ApiError } from "../middleware/error.js";
import { env } from "../config/env.js";
import { resolveGoogleAccountLink } from "./auth-accounts.js";
import { deliverVerificationCode, type OutboundMailDeps } from "./email.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const EXPIRED = "This verification has expired. Start again.";
const CODE_EXPIRED = "That code has expired.";
const CODE_INCORRECT = "That code is incorrect.";
const TOO_MANY = "Too many incorrect attempts. Request a new code.";
const SIGNUP_UNAVAILABLE = "We couldn't complete signup. Start again.";

export type MailDeps = OutboundMailDeps;

export type VerifiedGoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
};

export type EmailChallenge = {
  kind: "email";
  pendingToken: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
};

export function otpResendWaitMs(sentAt: Date | null | undefined, now = Date.now()) {
  if (!sentAt) return 0;
  const left = OTP_RESEND_MS - (now - sentAt.getTime());
  return left > 0 ? left : 0;
}

export function hashOtp(email: string, code: string, secret = env.JWT_SECRET) {
  return crypto.createHmac("sha256", secret).update(`email-otp:${email}:${code}`).digest("hex");
}

export function generateOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your email";
  const stars = "*".repeat(Math.min(4, Math.max(1, local.length - 1)));
  return `${local.slice(0, 1)}${stars}@${domain}`;
}

function hashPendingToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function challenge(token: string, email: string, sentAt: Date, codeExpiresAt: Date): EmailChallenge {
  return {
    kind: "email",
    pendingToken: token,
    maskedEmail: maskEmail(email),
    expiresAt: codeExpiresAt.toISOString(),
    resendAvailableAt: new Date(sentAt.getTime() + OTP_RESEND_MS).toISOString(),
  };
}

async function sendCode(email: string, code: string, deps?: MailDeps) {
  try {
    await deliverVerificationCode({ email, code }, deps);
  } catch {
    throw new ApiError(503, "We couldn't send the verification code. Try again shortly.");
  }
}

async function loadPending(token: string) {
  const doc = await EmailOtpPending.findOne({ tokenHash: hashPendingToken(token) }).select(
    "+tokenHash +codeHash +passwordHash"
  );
  if (!doc || doc.consumed || doc.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, EXPIRED);
  }
  return doc;
}

async function issuePending(
  fields: {
    purpose: "signup" | "google";
    email: string;
    name: string;
    passwordHash?: string;
    role?: "DRIVER" | "HOST" | "BOTH";
    phone?: string;
    googleSub?: string;
    image?: string;
  },
  deps?: MailDeps,
  options?: { inert?: boolean }
) {
  const token = crypto.randomBytes(32).toString("hex");
  const code = generateOtpCode();
  const sentAt = new Date();
  const codeExpiresAt = new Date(sentAt.getTime() + OTP_TTL_MS);
  await EmailOtpPending.deleteMany({
    consumed: false,
    $or: [
      { email: fields.email, purpose: fields.purpose },
      ...(fields.googleSub ? [{ googleSub: fields.googleSub, purpose: "google" as const }] : []),
    ],
  });
  await EmailOtpPending.create({
    tokenHash: hashPendingToken(token),
    purpose: fields.purpose,
    email: fields.email,
    name: fields.name,
    passwordHash: fields.passwordHash,
    role: fields.role ?? "DRIVER",
    phone: fields.phone ?? "",
    googleSub: fields.googleSub ?? "",
    image: fields.image ?? "",
    codeHash: hashOtp(fields.email, code),
    codeExpiresAt,
    expiresAt: new Date(sentAt.getTime() + PENDING_TTL_MS),
    sentAt,
    attempts: 0,
    consumed: false,
    inert: options?.inert === true,
  });
  if (!options?.inert) {
    try {
      await sendCode(fields.email, code, deps);
    } catch (err) {
      await EmailOtpPending.deleteOne({ tokenHash: hashPendingToken(token) });
      throw err;
    }
  }
  return challenge(token, fields.email, sentAt, codeExpiresAt);
}

function duplicateEmail(purpose: string) {
  return purpose === "signup"
    ? "Invalid email or password."
    : "An account with this email already exists. Sign in with your password.";
}

/** Validates signup fields, stores them server-side, and emails a code. Does not create a user. */
export async function startSignupEmailOtp(
  input: {
    name: string;
    email: string;
    password: string;
    role: "DRIVER" | "HOST" | "BOTH";
    phone: string;
  },
  deps?: MailDeps
) {
  const email = input.email.toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const emailTaken = await User.exists({ email });
  const phoneTaken = await User.exists({ phone: input.phone });
  if (emailTaken || phoneTaken) {
    return issuePending(
      {
        purpose: "signup",
        email,
        name: input.name.slice(0, 80),
        role: input.role,
        phone: input.phone,
      },
      deps,
      { inert: true }
    );
  }
  return issuePending(
    {
      purpose: "signup",
      email,
      name: input.name.slice(0, 80),
      passwordHash,
      role: input.role,
      phone: input.phone,
    },
    deps
  );
}

/** Existing Google accounts sign in. New Google identities must verify an email code first. */
export async function beginGoogleSignIn(identity: VerifiedGoogleIdentity, deps?: MailDeps) {
  if (!identity.emailVerified || !identity.email || !identity.sub) {
    throw new ApiError(401, "Google account email is not verified.");
  }
  const email = identity.email.toLowerCase();

  let user = await User.findOne({ googleId: identity.sub }).select("+passwordHash");
  if (!user) {
    const byEmail = await User.findOne({ email }).select("+googleId +passwordHash");
    const decision = resolveGoogleAccountLink(
      byEmail
        ? { email: byEmail.email, googleId: byEmail.googleId, passwordHash: byEmail.passwordHash }
        : null,
      { sub: identity.sub, email }
    );
    if (decision.action === "conflict" || decision.action === "mismatch") {
      throw new ApiError(409, duplicateEmail("google"));
    }
    if (decision.action === "login" && byEmail) user = byEmail;
  }

  if (user?.status === "SUSPENDED") {
    throw new ApiError(403, "This account has been suspended. Contact support for help.");
  }
  if (user) return { kind: "session" as const, user };

  const pending = await issuePending(
    {
      purpose: "google",
      email,
      name: (identity.name || email.split("@")[0]).slice(0, 80),
      googleSub: identity.sub,
      image: identity.picture ?? "",
    },
    deps
  );
  return pending;
}

export async function resendEmailOtp(pendingToken: string, deps?: MailDeps) {
  const doc = await loadPending(pendingToken);
  if (otpResendWaitMs(doc.sentAt) > 0) {
    throw new ApiError(429, "Wait a minute before requesting another code.");
  }

  const code = generateOtpCode();
  const claimedAt = new Date();
  const claimed = await EmailOtpPending.findOneAndUpdate(
    { _id: doc._id, consumed: false, sentAt: doc.sentAt, expiresAt: { $gt: claimedAt } },
    { $set: { sentAt: claimedAt } }
  );
  if (!claimed) throw new ApiError(400, EXPIRED);

  const codeExpiresAt = new Date(claimedAt.getTime() + OTP_TTL_MS);
  if (!doc.inert) {
    try {
      await sendCode(doc.email, code, deps);
    } catch (err) {
      await EmailOtpPending.updateOne(
        { _id: doc._id, sentAt: claimedAt, consumed: false },
        { $set: { sentAt: doc.sentAt } }
      );
      throw err;
    }
  }

  const saved = await EmailOtpPending.updateOne(
    { _id: doc._id, sentAt: claimedAt, consumed: false },
    { $set: { codeHash: hashOtp(doc.email, code), codeExpiresAt, attempts: 0 } }
  );
  if (!saved.modifiedCount) throw new ApiError(400, EXPIRED);
  return {
    maskedEmail: maskEmail(doc.email),
    expiresAt: codeExpiresAt.toISOString(),
    resendAvailableAt: new Date(claimedAt.getTime() + OTP_RESEND_MS).toISOString(),
  };
}

export async function completeEmailOtp(pendingToken: string, otp: string) {
  const doc = await loadPending(pendingToken);
  if (doc.attempts >= MAX_ATTEMPTS) throw new ApiError(400, TOO_MANY);
  if (doc.codeExpiresAt.getTime() <= Date.now()) throw new ApiError(400, CODE_EXPIRED);

  const expected = Buffer.from(doc.codeHash, "hex");
  const actual = Buffer.from(hashOtp(doc.email, otp), "hex");
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!matches || doc.inert) {
    const updated = await EmailOtpPending.findOneAndUpdate(
      { _id: doc._id, consumed: false },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (updated && updated.attempts >= MAX_ATTEMPTS) throw new ApiError(400, TOO_MANY);
    throw new ApiError(400, CODE_INCORRECT);
  }

  const locked = await EmailOtpPending.findOneAndUpdate(
    {
      _id: doc._id,
      consumed: false,
      expiresAt: { $gt: new Date() },
      codeExpiresAt: { $gt: new Date() },
    },
    { $set: { consumed: true } }
  );
  if (!locked) throw new ApiError(400, EXPIRED);

  const email = doc.email.toLowerCase();
  if (await User.findOne({ email }).select("_id")) {
    throw new ApiError(doc.purpose === "signup" ? 400 : 409, doc.purpose === "signup" ? SIGNUP_UNAVAILABLE : duplicateEmail(doc.purpose));
  }

  try {
    if (doc.purpose === "signup") {
      if (!doc.passwordHash || !/^\+91[6-9]\d{9}$/.test(doc.phone)) throw new ApiError(400, EXPIRED);
      if (await User.findOne({ phone: doc.phone }).select("_id")) {
        throw new ApiError(400, SIGNUP_UNAVAILABLE);
      }
      return await User.create({
        name: doc.name,
        email,
        passwordHash: doc.passwordHash,
        role: doc.role,
        phone: doc.phone,
      });
    }

    return await User.create({
      name: doc.name,
      email,
      googleId: doc.googleSub,
      image: doc.image || undefined,
      role: "DRIVER",
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      if (doc.purpose === "signup") throw new ApiError(400, SIGNUP_UNAVAILABLE);
      throw new ApiError(409, duplicateEmail(doc.purpose));
    }
    throw err;
  }
}
