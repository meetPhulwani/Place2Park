import type { Request, Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { signToken, type AuthedRequest } from "../middleware/auth.js";
import { env, isProd } from "../config/env.js";
import { deliverPasswordResetLink, isEmailConfigured } from "../services/email.js";
import { resolveGoogleAccountLink } from "../services/auth-accounts.js";
import { consumePhoneOtp, issuePhoneOtp } from "../services/phone-otp.js";

function issueToken(user: { _id: unknown; tokenVersion?: number | null }) {
  return signToken(String(user._id), user.tokenVersion ?? 0);
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicUser(u: InstanceType<typeof User>) {
  return u.toJSON();
}

export async function requestPhoneOtp(req: Request, res: Response) {
  const { phone } = req.body as { phone: string };
  await issuePhoneOtp(phone);
  res.json({ success: true, data: {} });
}

export async function signup(req: Request, res: Response) {
  const { name, email, password, role, phone, otp } = req.body as {
    name: string;
    email: string;
    password: string;
    role: "DRIVER" | "HOST" | "BOTH";
    phone: string;
    otp: string;
  };
  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, "An account with this email already exists.");
  const existingPhone = await User.findOne({ phone });
  if (existingPhone) throw new ApiError(409, "An account with this phone number already exists.");
  await consumePhoneOtp(phone, otp);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role, phone, phoneVerified: true });
  res.status(201).json({ success: true, data: { token: issueToken(user), user: publicUser(user) } });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    throw new ApiError(401, "Incorrect email or password.");
  if (user.status === "SUSPENDED")
    throw new ApiError(403, "This account has been suspended. Contact support for help.");
  res.json({ success: true, data: { token: issueToken(user), user: publicUser(user) } });
}

/**
 * Google login: the client obtains an ID token via Google Identity Services and
 * posts it here; we verify it and create/authenticate the user, then issue our JWT.
 */
export async function googleLogin(req: Request, res: Response) {
  if (!env.GOOGLE_CLIENT_ID) throw new ApiError(503, "Google login isn't configured.");
  const { credential } = req.body as { credential: string };
  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, "Google sign-in failed. Try again.");
  }
  if (!payload?.email || payload.email_verified !== true)
    throw new ApiError(401, "Google account email is not verified.");

  let user = await User.findOne({ googleId: payload.sub });
  if (!user) {
    const byEmail = await User.findOne({ email: payload.email }).select("+googleId +passwordHash");
    const decision = resolveGoogleAccountLink(
      byEmail
        ? { email: byEmail.email, googleId: byEmail.googleId, passwordHash: byEmail.passwordHash }
        : null,
      { sub: payload.sub, email: payload.email }
    );
    if (decision.action === "conflict" || decision.action === "mismatch") {
      throw new ApiError(409, "An account with this email already exists. Sign in with your password.");
    }
    if (decision.action === "login" && byEmail) {
      user = byEmail;
    } else {
      user = await User.create({
        name: payload.name ?? payload.email.split("@")[0],
        email: payload.email,
        googleId: payload.sub,
        image: payload.picture,
        role: "DRIVER",
      });
    }
  }
  if (user.status === "SUSPENDED")
    throw new ApiError(403, "This account has been suspended. Contact support for help.");
  res.json({ success: true, data: { token: issueToken(user), user: publicUser(user) } });
}

/** Always responds success when no send is attempted; never reveals whether the email exists. */
export async function forgotPassword(req: Request, res: Response) {
  const email = String((req.body as { email?: string }).email ?? "").toLowerCase().trim();
  if (!isEmailConfigured() && isProd) {
    console.error("[email] password-reset skipped: email is not configured");
    throw new ApiError(503, "We couldn't send the reset email. Try again shortly.");
  }
  if (email) {
    const user = await User.findOne({ email });
    if (user) {
      const token = crypto.randomBytes(24).toString("hex");
      await User.updateOne(
        { _id: user._id },
        { $set: { resetToken: hashResetToken(token), resetTokenExpires: new Date(Date.now() + 30 * 60000) } }
      );
      try {
        await deliverPasswordResetLink({ email, token, clientUrl: env.CLIENT_URL });
      } catch {
        throw new ApiError(503, "We couldn't send the reset email. Try again shortly.");
      }
    }
  }
  res.json({ success: true, data: {} });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password || password.length < 8)
    throw new ApiError(400, "Use a password with at least 8 characters.");
  const user = await User.findOne({
    resetToken: hashResetToken(token),
    resetTokenExpires: { $gt: new Date() },
  }).select("+resetToken +resetTokenExpires");
  if (!user) throw new ApiError(400, "This reset link is invalid or has expired.");
  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await User.updateOne(
    { _id: user._id, resetToken: hashResetToken(token), resetTokenExpires: { $gt: new Date() } },
    {
      $set: { passwordHash, resetToken: null, resetTokenExpires: null },
      $inc: { tokenVersion: 1 },
    }
  );
  if (!updated.modifiedCount) throw new ApiError(400, "This reset link is invalid or has expired.");
  res.json({ success: true, data: {} });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById((req as AuthedRequest).userId);
  if (!user) throw new ApiError(401, "Account not found.");
  res.json({ success: true, data: { user: publicUser(user) } });
}
