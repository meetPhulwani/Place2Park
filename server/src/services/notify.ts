import { Notification, User } from "../models/index.js";
import { env, isProd } from "../config/env.js";
import {
  describeSmtpError,
  evaluateEmailDeliveryConfig,
  isPlaceholderEmail,
  isSmtpConfigured,
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
  | "HOST_PAYOUT_FAILED";

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
  if (!isSmtpConfigured()) return;
  const report = evaluateEmailDeliveryConfig(env, isProd);
  if (isProd && !report.sendEnabled) return;
  try {
    const user = await User.findById(userId).select("email notifyEmail");
    if (!user?.email || user.notifyEmail === false) return;
    if (isPlaceholderEmail(user.email)) {
      console.warn(`[smtp] skipped user notification; stored address uses a placeholder domain`);
      return;
    }
    await sendMail({ to: user.email, subject, text });
  } catch (e) {
    console.error(`[smtp] notify failed: ${describeSmtpError(e)}`);
  }
}
