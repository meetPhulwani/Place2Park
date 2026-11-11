import type { Request, Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { isTimeoutError } from "../utils/async.js";
import { verifyGoogleIdToken } from "../services/google-identity.js";
import { User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { signToken, type AuthedRequest } from "../middleware/auth.js";
import { env, isProd } from "../config/env.js";
import { deliverPasswordResetLink, isEmailConfigured } from "../services/email.js";
import { beginGoogleSignIn, completeEmailOtp, resendEmailOtp, startSignupEmailOtp } from "../services/email-otp.js";
import { passwordIssue } from "../utils/password.js";
import { emailBelongsToAdmin, rejectAdminPassword } from "../services/admin-auth.js";

function issueToken(user: { _id: unknown; tokenVersion?: number | null }) {
  return signToken(String(user._id), user.tokenVersion ?? 0);
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicUser(u: InstanceType<typeof User>) {
  return u.toJSON();
}

/** Checks the signup fields and emails a code. The account is created only after that code matches. */
export async function signup(req: Request, res: Response) {
  const { name, email, password, role, phone } = req.body as {
    name: string;
    email: string;
    password: string;
    role: "DRIVER" | "HOST" | "BOTH";
    phone: string;
  };
  const challenge = await startSignupEmailOtp({ name, email, password, role, phone });
  res.json({ success: true, data: challenge });
}

export async function requestEmailOtpResend(req: Request, res: Response) {
  const { pendingToken } = req.body as { pendingToken: string };
  const challenge = await resendEmailOtp(pendingToken);
  res.json({ success: true, data: challenge });
}

export async function verifyEmailOtp(req: Request, res: Response) {
  const { pendingToken, otp } = req.body as { pendingToken: string; otp: string };
  const user = await completeEmailOtp(pendingToken, otp);
  res.status(201).json({ success: true, data: { token: issueToken(user), user: publicUser(user) } });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  if (await emailBelongsToAdmin(email)) {
    await rejectAdminPassword(password);
    throw new ApiError(401, "Incorrect email or password.");
  }
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    throw new ApiError(401, "Incorrect email or password.");
  if (user.status === "DELETED") throw new ApiError(401, "Incorrect email or password.");
  if (user.status === "SUSPENDED")
    throw new ApiError(403, "This account has been suspended. Contact support for help.");
  res.json({ success: true, data: { token: issueToken(user), user: publicUser(user) } });
}

/**
 * Google login: the client obtains an ID token via Google Identity Services.
 * Existing accounts receive a session. New Google users must verify an email code first.
 */
export async function googleLogin(req: Request, res: Response) {
  if (!env.GOOGLE_CLIENT_ID) throw new ApiError(503, "Google login isn't configured.");
  const { credential } = req.body as { credential: string };
  let payload;
  try {
    const ticket = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
    payload = ticket.getPayload();
  } catch (err) {
    if (isTimeoutError(err)) throw new ApiError(503, "Google sign-in took too long. Try again.");
    throw new ApiError(401, "Google sign-in failed. Try again.");
  }
  if (!payload?.email || !payload.sub || payload.email_verified !== true)
    throw new ApiError(401, "Google account email is not verified.");
  if (await emailBelongsToAdmin(payload.email)) throw new ApiError(401, "Google sign-in failed. Try again.");

  const result = await beginGoogleSignIn({
    sub: payload.sub,
    email: payload.email,
    emailVerified: true,
    name: payload.name,
    picture: payload.picture,
  });
  if (result.kind === "email") {
    res.json({
      success: true,
      data: {
        emailVerificationRequired: true,
        pendingToken: result.pendingToken,
        maskedEmail: result.maskedEmail,
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt,
      },
    });
    return;
  }
  res.json({ success: true, data: { token: issueToken(result.user), user: publicUser(result.user) } });
}

/** Always responds success when no send is attempted; never reveals whether the email exists. */
export async function forgotPassword(req: Request, res: Response) {
  const email = String((req.body as { email?: string }).email ?? "").toLowerCase().trim();
  if (!isEmailConfigured() && isProd) {
    console.error("[email] password-reset skipped: email is not configured");
    throw new ApiError(503, "We couldn't send the reset email. Try again shortly.");
  }
  if (email && !(await emailBelongsToAdmin(email))) {
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
  const nextPassword = typeof password === "string" ? password : "";
  const issue = passwordIssue(nextPassword);
  if (!token || issue) throw new ApiError(400, issue ?? "This reset link is invalid or has expired.");
  const user = await User.findOne({
    resetToken: hashResetToken(token),
    resetTokenExpires: { $gt: new Date() },
  }).select("+resetToken +resetTokenExpires");
  if (!user) throw new ApiError(400, "This reset link is invalid or has expired.");
  const passwordHash = await bcrypt.hash(nextPassword, 10);
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
