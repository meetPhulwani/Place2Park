import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { AdminAudit, EmailOtpPending, User, Vehicle, Favorite, Booking, Payment, HostPayout, Notification } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { signToken } from "../middleware/auth.js";
import { deliverVerificationCode, type OutboundMailDeps } from "./email.js";
import { generateOtpCode, hashOtp, maskEmail } from "./email-otp.js";
import { emailBelongsToAdmin } from "./admin-auth.js";
import { passwordIssue } from "../utils/password.js";
import { normalizeIndianMobile } from "../utils/phone.js";
import type { NotificationType } from "./notify.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;

export const NOTIFICATION_KEYS = [
  "bookingConfirmed",
  "bookingCancelled",
  "bookingReminder",
  "payment",
  "refund",
  "hostRequest",
  "hostStatus",
  "payout",
  "promo",
  "product",
] as const;

export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

const LOCKED: NotificationKey[] = ["bookingConfirmed", "bookingCancelled", "payment", "refund"];

const TYPE_KEY: Partial<Record<NotificationType, NotificationKey>> = {
  BOOKING_CONFIRMED: "bookingConfirmed",
  BOOKING_CANCELLED: "bookingCancelled",
  BOOKING_STARTING_SOON: "bookingReminder",
  PAYMENT_SUCCESS: "payment",
  HOST_NEW_BOOKING: "hostRequest",
  REVIEW_REMINDER: "bookingReminder",
  LISTING_APPROVED: "hostStatus",
  LISTING_REJECTED: "hostStatus",
  HOST_PAYOUT_PAID: "payout",
  HOST_PAYOUT_FAILED: "payout",
};

type ChannelPrefs = Record<NotificationKey, boolean>;

export type NotificationPrefs = { email: ChannelPrefs; inApp: ChannelPrefs };

function channel(optionalOff: NotificationKey[] = []): ChannelPrefs {
  return Object.fromEntries(NOTIFICATION_KEYS.map((key) => [key, !optionalOff.includes(key)])) as ChannelPrefs;
}

export function defaultNotifications(): NotificationPrefs {
  return { email: channel(["promo", "product"]), inApp: channel(["promo", "product"]) };
}

export function normalizeNotifications(input: unknown): NotificationPrefs {
  const base = defaultNotifications();
  const source = input && typeof input === "object" ? (input as { email?: Record<string, unknown>; inApp?: Record<string, unknown> }) : {};
  for (const key of NOTIFICATION_KEYS) {
    if (LOCKED.includes(key)) {
      base.email[key] = true;
      base.inApp[key] = true;
      continue;
    }
    if (typeof source.email?.[key] === "boolean") base.email[key] = source.email[key];
    if (typeof source.inApp?.[key] === "boolean") base.inApp[key] = source.inApp[key];
  }
  return base;
}

export function notificationChannelAllowed(
  prefs: NotificationPrefs | undefined,
  type: NotificationType,
  channelName: "email" | "inApp"
) {
  if (type === "TICKET_UPDATE") return true;
  const key = TYPE_KEY[type];
  if (!key) return true;
  const resolved = normalizeNotifications(prefs);
  if (LOCKED.includes(key)) return true;
  return resolved[channelName][key];
}

type ChangeDeps = OutboundMailDeps & {
  code?: string;
  deliver?: (input: { email: string; code: string }) => Promise<void>;
};

function hashPendingToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueChange(input: {
  userId: string;
  purpose: "email-change" | "phone-change";
  email: string;
  phone: string;
  name: string;
}, deps: ChangeDeps = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const code = deps.code ?? generateOtpCode();
  const sentAt = new Date();
  await EmailOtpPending.deleteMany({ userId: input.userId, purpose: input.purpose, consumed: false });
  await EmailOtpPending.create({
    tokenHash: hashPendingToken(token),
    purpose: input.purpose,
    userId: input.userId,
    email: input.email,
    name: input.name.slice(0, 80) || "Place2Park user",
    phone: input.phone,
    codeHash: hashOtp(input.email, code),
    codeExpiresAt: new Date(sentAt.getTime() + OTP_TTL_MS),
    expiresAt: new Date(sentAt.getTime() + PENDING_TTL_MS),
    sentAt,
    attempts: 0,
    consumed: false,
  });
  try {
    if (deps.deliver) await deps.deliver({ email: input.email, code });
    else await deliverVerificationCode({ email: input.email, code }, deps);
  } catch {
    await EmailOtpPending.deleteOne({ tokenHash: hashPendingToken(token) });
    throw new ApiError(503, "We couldn't send the verification code. Try again shortly.");
  }
  return {
    pendingToken: token,
    maskedEmail: maskEmail(input.email),
    expiresAt: new Date(sentAt.getTime() + OTP_TTL_MS).toISOString(),
  };
}

async function loadChange(token: string, userId: string, purpose: "email-change" | "phone-change") {
  const doc = await EmailOtpPending.findOne({ tokenHash: hashPendingToken(token), purpose }).select("+codeHash");
  if (!doc || doc.consumed || String(doc.userId) !== userId || doc.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, "This verification has expired. Start again.");
  }
  return doc;
}

async function checkCode(doc: { email: string; codeHash?: string; attempts: number; codeExpiresAt: Date; save: () => Promise<unknown> }, otp: string) {
  if (doc.codeExpiresAt.getTime() <= Date.now()) throw new ApiError(400, "That code has expired.");
  if (doc.attempts >= 5) throw new ApiError(400, "Too many incorrect attempts. Request a new code.");
  if (doc.codeHash !== hashOtp(doc.email, otp)) {
    doc.attempts += 1;
    await doc.save();
    throw new ApiError(400, "That code is incorrect.");
  }
}

export async function getAccountSettings(userId: string) {
  const user = await User.findById(userId).select("+passwordHash googleId privacy notifications createdAt role status");
  if (!user || user.status === "DELETED") throw new ApiError(401, "Your session has expired. Please log in again.");
  return {
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    image: user.image ?? "",
    role: user.role,
    status: user.status,
    joinedAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
    googleConnected: Boolean(user.googleId),
    notifications: normalizeNotifications(user.notifications),
    privacy: {
      showPublicHostName: user.privacy?.showPublicHostName !== false,
      marketingEmail: Boolean(user.privacy?.marketingEmail),
    },
    sessions: {
      mode: "token" as const,
      description: "Place2Park keeps a signed login on this browser. It does not store a separate device list. Logging out everywhere invalidates every current login.",
    },
  };
}

export async function updateAccountName(userId: string, name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) throw new ApiError(400, "Enter your name.");
  const user = await User.findOneAndUpdate({ _id: userId, status: { $ne: "DELETED" } }, { $set: { name: trimmed } }, { new: true });
  if (!user) throw new ApiError(404, "Account not found.");
  return { name: user.name };
}

export async function requestEmailChange(userId: string, email: string, deps: ChangeDeps = {}) {
  const next = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) || next.length > 254) throw new ApiError(400, "Enter a valid email.");
  const user = await User.findById(userId);
  if (!user || user.status === "DELETED") throw new ApiError(404, "Account not found.");
  if (user.email === next) throw new ApiError(400, "That is already your email.");
  if (await User.exists({ email: next })) throw new ApiError(409, "That email is already in use.");
  if (await emailBelongsToAdmin(next)) throw new ApiError(400, "Enter a valid email.");
  return issueChange({ userId, purpose: "email-change", email: next, phone: "", name: user.name }, deps);
}

export async function confirmEmailChange(userId: string, pendingToken: string, otp: string) {
  const doc = await loadChange(pendingToken, userId, "email-change");
  await checkCode(doc, otp);
  if (await User.exists({ email: doc.email, _id: { $ne: userId } })) throw new ApiError(409, "That email is already in use.");
  doc.consumed = true;
  await doc.save();
  const user = await User.findOneAndUpdate({ _id: userId, status: { $ne: "DELETED" } }, { $set: { email: doc.email } }, { new: true });
  if (!user) throw new ApiError(404, "Account not found.");
  await AdminAudit.create({ action: "EMAIL_CHANGED", actorId: userId, hostId: userId, accountLast4: "" });
  return { email: user.email };
}

export async function requestPhoneChange(userId: string, phone: string, deps: ChangeDeps = {}) {
  const next = normalizeIndianMobile(phone);
  if (!next) throw new ApiError(400, "Enter a valid 10-digit mobile number.");
  const user = await User.findById(userId);
  if (!user || user.status === "DELETED") throw new ApiError(404, "Account not found.");
  if (user.phone === next) throw new ApiError(400, "That is already your phone number.");
  if (await User.exists({ phone: next, _id: { $ne: userId } })) throw new ApiError(409, "That phone number is already in use.");
  return issueChange({ userId, purpose: "phone-change", email: user.email, phone: next, name: user.name }, deps);
}

export async function confirmPhoneChange(userId: string, pendingToken: string, otp: string) {
  const doc = await loadChange(pendingToken, userId, "phone-change");
  await checkCode(doc, otp);
  if (await User.exists({ phone: doc.phone, _id: { $ne: userId } })) throw new ApiError(409, "That phone number is already in use.");
  doc.consumed = true;
  await doc.save();
  const user = await User.findOneAndUpdate(
    { _id: userId, status: { $ne: "DELETED" } },
    { $set: { phone: doc.phone, phoneVerified: true } },
    { new: true }
  );
  if (!user) throw new ApiError(404, "Account not found.");
  await AdminAudit.create({ action: "PHONE_CHANGED", actorId: userId, hostId: userId, accountLast4: "" });
  return { phone: user.phone };
}

export async function changePassword(userId: string, currentPassword: string, nextPassword: string) {
  const issue = passwordIssue(nextPassword);
  if (issue) throw new ApiError(400, issue);
  const user = await User.findById(userId).select("+passwordHash tokenVersion");
  if (!user || user.status === "DELETED") throw new ApiError(404, "Account not found.");
  if (!user.passwordHash) throw new ApiError(400, "Set a password from the recovery link before changing it here.");
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw new ApiError(401, "That password doesn't match.");
  if (await bcrypt.compare(nextPassword, user.passwordHash)) {
    throw new ApiError(400, "Choose a password you have not used before.");
  }
  const tokenVersion = (user.tokenVersion ?? 0) + 1;
  user.passwordHash = await bcrypt.hash(nextPassword, 10);
  user.tokenVersion = tokenVersion;
  await user.save();
  await AdminAudit.create({ action: "PASSWORD_CHANGED", actorId: userId, hostId: userId, accountLast4: "" });
  return { token: signToken(userId, tokenVersion) };
}

export async function revokeAllSessions(userId: string) {
  const user = await User.findOneAndUpdate(
    { _id: userId, status: { $ne: "DELETED" } },
    { $inc: { tokenVersion: 1 } },
    { new: true }
  );
  if (!user) throw new ApiError(404, "Account not found.");
  await AdminAudit.create({ action: "SESSIONS_REVOKED", actorId: userId, hostId: userId, accountLast4: "" });
  return { revoked: true };
}

export async function updateNotificationPrefs(userId: string, input: unknown) {
  const notifications = normalizeNotifications(input);
  const user = await User.findOneAndUpdate(
    { _id: userId, status: { $ne: "DELETED" } },
    { $set: { notifications, notifyReminders: notifications.email.bookingReminder, notifyEmail: true } },
    { new: true }
  );
  if (!user) throw new ApiError(404, "Account not found.");
  return { notifications: normalizeNotifications(user.notifications) };
}

export async function updatePrivacyPrefs(userId: string, input: { showPublicHostName?: boolean; marketingEmail?: boolean }) {
  const user = await User.findById(userId);
  if (!user || user.status === "DELETED") throw new ApiError(404, "Account not found.");
  user.privacy = {
    showPublicHostName: input.showPublicHostName !== false,
    marketingEmail: input.marketingEmail === true,
  };
  const notifications = normalizeNotifications(user.notifications);
  notifications.email.promo = input.marketingEmail === true;
  notifications.inApp.promo = input.marketingEmail === true;
  user.notifications = notifications;
  user.markModified("notifications");
  await user.save();
  return {
    privacy: user.privacy,
    notifications,
  };
}

export async function setAccountPhoto(userId: string, image: string) {
  const user = await User.findOneAndUpdate(
    { _id: userId, status: { $ne: "DELETED" } },
    { $set: { image } },
    { new: true }
  );
  if (!user) throw new ApiError(404, "Account not found.");
  return { image: user.image ?? "" };
}

export async function exportOwnData(userId: string) {
  const user = await User.findById(userId).select("name email phone image role status createdAt notifications privacy hostVerified");
  if (!user || user.status === "DELETED") throw new ApiError(404, "Account not found.");
  const [vehicles, favorites, bookings, notifications, payouts] = await Promise.all([
    Vehicle.find({ userId }).select("type make model plate"),
    Favorite.find({ userId }).select("spaceId"),
    Booking.find({ $or: [{ userId }, { hostId: userId }] }).select("code status start end totalAmount hostEarning userId hostId"),
    Notification.find({ userId }).select("type title createdAt").limit(100),
    HostPayout.find({ hostId: userId }).select("amount status reference paidAt createdAt"),
  ]);
  const bookingIds = bookings.map((booking) => booking._id);
  const payments = await Payment.find({ bookingId: { $in: bookingIds } }).select("bookingId amount status refundStatus");
  return {
    exportedAt: new Date().toISOString(),
    account: {
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      image: user.image ?? "",
      role: user.role,
      joinedAt: user.createdAt,
      notifications: normalizeNotifications(user.notifications),
      privacy: user.privacy ?? { showPublicHostName: true, marketingEmail: false },
    },
    vehicles: vehicles.map((vehicle) => ({ type: vehicle.type, make: vehicle.make, model: vehicle.model, plate: vehicle.plate })),
    favorites: favorites.map((favorite) => String(favorite.spaceId)),
    bookings: bookings.map((booking) => ({
      code: booking.code,
      status: booking.status,
      start: booking.start,
      end: booking.end,
      totalAmount: booking.totalAmount,
      hostEarning: String(booking.hostId) === userId ? booking.hostEarning : undefined,
      role: String(booking.userId) === userId ? "driver" : "host",
    })),
    payments: payments.map((payment) => ({ amount: payment.amount, status: payment.status, refundStatus: payment.refundStatus ?? null })),
    payouts: payouts.map((payout) => ({ amount: payout.amount, status: payout.status, reference: payout.reference ? "recorded" : "", paidAt: payout.paidAt ?? null })),
    notifications: notifications.map((item) => ({ type: item.type, title: item.title, createdAt: item.createdAt })),
  };
}
