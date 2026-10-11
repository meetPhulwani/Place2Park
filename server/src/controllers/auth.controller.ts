import type { Request, Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { signToken, type AuthedRequest } from "../middleware/auth.js";
import { env, isProd } from "../config/env.js";

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicUser(u: InstanceType<typeof User>) {
  return u.toJSON();
}

export async function signup(req: Request, res: Response) {
  const { name, email, password, role } = req.body as {
    name: string; email: string; password: string; role: "DRIVER" | "HOST" | "BOTH";
  };
  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, "An account with this email already exists.");
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role });
  res.status(201).json({ success: true, data: { token: signToken(String(user._id)), user: publicUser(user) } });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    throw new ApiError(401, "Incorrect email or password.");
  if (user.status === "SUSPENDED")
    throw new ApiError(403, "This account has been suspended. Contact support for help.");
  res.json({ success: true, data: { token: signToken(String(user._id)), user: publicUser(user) } });
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
  if (!payload?.email || payload.email_verified === false)
    throw new ApiError(401, "Google account email is not verified.");

  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email }] });
  if (!user) {
    user = await User.create({
      name: payload.name ?? payload.email.split("@")[0],
      email: payload.email,
      googleId: payload.sub,
      image: payload.picture,
      role: "DRIVER",
    });
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    if (!user.image && payload.picture) user.image = payload.picture;
    await user.save();
  }
  if (user.status === "SUSPENDED")
    throw new ApiError(403, "This account has been suspended. Contact support for help.");
  res.json({ success: true, data: { token: signToken(String(user._id)), user: publicUser(user) } });
}

/** Always responds success; never reveals whether the email exists. */
export async function forgotPassword(req: Request, res: Response) {
  const email = String((req.body as { email?: string }).email ?? "").toLowerCase().trim();
  if (email) {
    const user = await User.findOne({ email });
    if (user) {
      const token = crypto.randomBytes(24).toString("hex");
      await User.updateOne(
        { _id: user._id },
        { $set: { resetToken: hashResetToken(token), resetTokenExpires: new Date(Date.now() + 30 * 60000) } }
      );
      if (!isProd) {
        console.info(`[password-reset] ${email}: ${env.CLIENT_URL}/reset-password?token=${token}`);
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
  user.passwordHash = await bcrypt.hash(password, 10);
  user.resetToken = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  res.json({ success: true, data: {} });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById((req as AuthedRequest).userId);
  if (!user) throw new ApiError(401, "Account not found.");
  res.json({ success: true, data: { user: publicUser(user) } });
}
