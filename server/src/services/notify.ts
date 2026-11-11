import { Notification, User } from "../models/index.js";
import { normalizeNotifications, notificationChannelAllowed } from "./account-settings.js";
import { env, isProd } from "../config/env.js";
import {
  describeEmailError,
  evaluateEmailDeliveryConfig,
  isEmailConfigured,
  isPlaceholderEmail,
  sendMail,
} from "./email.js";

export type NotificationType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_STARTING_SOON"
  | "PAYMENT_SUCCESS"
  | "HOST_NEW_BOOKING"
  | "REVIEW_REMINDER"
  | "LISTING_APPROVED"
  | "LISTING_REJECTED"
  | "HOST_PAYOUT_PAID"
  | "HOST_PAYOUT_FAILED"
  | "TICKET_UPDATE";

/**
 * Writes an in-app notice unless the recipient turned that type off.
 * Booking, payment, refund, and support notices stay on.
 * Email is sent only when a provider is configured and the recipient allows it.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  const user = await User.findById(userId).select("email notifications");
  const prefs = user ? normalizeNotifications(user.notifications) : undefined;
  if (!user || notificationChannelAllowed(prefs, type, "inApp")) {
    await Notification.create({ userId, type, title, body, data });
  }
  await sendEmailIfConfigured(user, type, title, body);
}

async function sendEmailIfConfigured(
  user: { email?: string; notifications?: unknown } | null,
  type: NotificationType,
  subject: string,
  text: string
) {
  if (!isEmailConfigured()) return;
  const report = evaluateEmailDeliveryConfig(env, isProd);
  if (isProd && !report.sendEnabled) return;
  try {
    if (!user?.email || !notificationChannelAllowed(normalizeNotifications(user.notifications), type, "email")) return;
    if (isPlaceholderEmail(user.email)) {
      console.warn("[email] skipped user notification; stored address uses a placeholder domain");
      return;
    }
    await sendMail({ to: user.email, subject, text });
  } catch (e) {
    console.error(`[email] notify failed: ${describeEmailError(e)}`);
  }
}
