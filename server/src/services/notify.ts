import { Notification, User } from "../models/index.js";

export type NotificationType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_STARTING_SOON"
  | "PAYMENT_SUCCESS"
  | "HOST_NEW_BOOKING"
  | "REVIEW_REMINDER"
  | "LISTING_APPROVED"
  | "LISTING_REJECTED";

/**
 * Notification abstraction: always persists in-app; sends email only when
 * SMTP credentials are configured (provider-agnostic boundary).
 */
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  await Notification.create({ userId, type, title, body, data });
  await sendEmailIfConfigured(userId, title, body);
}

async function sendEmailIfConfigured(userId: string, subject: string, text: string) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return; // email disabled
  try {
    const user = await User.findById(userId).select("email notifyEmail");
    if (!user?.email || user.notifyEmail === false) return;
    // Integration boundary: plug an SMTP/transactional provider here.
    console.info(`[email→${user.email}] ${subject}: ${text}`);
  } catch (e) {
    console.error("notify email failed", e);
  }
}
