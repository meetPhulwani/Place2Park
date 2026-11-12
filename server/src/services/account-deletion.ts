import { isTimeoutError } from "../utils/async.js";
import { verifyGoogleIdToken } from "./google-identity.js";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/error.js";
import {
  AdminAudit,
  Booking,
  BlockedSlot,
  EmailOtpPending,
  FaqFeedback,
  Favorite,
  HostPayout,
  Notification,
  ParkingSpace,
  Payment,
  PendingUpload,
  Report,
  Review,
  SupportEvidence,
  SupportTicket,
  TicketMessage,
  User,
  UserReport,
  Vehicle,
} from "../models/index.js";
import { emailBelongsToAdmin } from "./admin-auth.js";
import { sendMail } from "./email.js";
import { OPEN_PAYOUT_STATUSES } from "../utils/constants.js";

const CONFIRMATION = "CONFIRM";

export type DeleteAccountInput = {
  confirmation?: string;
  password?: string;
  credential?: string;
};

type DeleteDeps = {
  verifyGoogleSub?: (credential: string) => Promise<string>;
  sendNotice?: (to: string) => Promise<void>;
};

async function defaultGoogleSub(credential: string) {
  if (!env.GOOGLE_CLIENT_ID) throw new ApiError(503, "Google confirmation isn't available.");
  try {
    const ticket = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
    const payload = ticket.getPayload();
    if (!payload?.sub || payload.email_verified !== true) {
      throw new ApiError(401, "Google confirmation didn't match this account.");
    }
    return payload.sub;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isTimeoutError(err)) throw new ApiError(503, "Google confirmation took too long. Try again.");
    throw new ApiError(401, "Google confirmation didn't match this account.");
  }
}

export async function accountSecurity(userId: string) {
  const user = await User.findById(userId).select("+passwordHash googleId status");
  if (!user || user.status === "DELETED") throw new ApiError(401, "Your session has expired. Please log in again.");
  const hasPassword = Boolean(user.passwordHash);
  return { hasPassword, googleOnly: Boolean(user.googleId) && !hasPassword };
}

export async function deleteOwnAccount(userId: string, input: DeleteAccountInput, deps: DeleteDeps = {}) {
  if (input.confirmation !== CONFIRMATION) {
    throw new ApiError(400, "Type CONFIRM to confirm.");
  }
  const user = await User.findById(userId).select("+passwordHash +resetToken googleId email name role status");
  if (!user) throw new ApiError(404, "Account not found.");
  if (user.status === "DELETED") return { deleted: true, already: true };

  if (user.role === "ADMIN" || (user.email && (await emailBelongsToAdmin(user.email)))) {
    throw new ApiError(403, "This account can't be deleted here.");
  }

  if (!user.passwordHash && user.googleId) {
    if (!input.credential) throw new ApiError(400, "Confirm with Google before deleting this account.");
    const sub = await (deps.verifyGoogleSub ?? defaultGoogleSub)(input.credential);
    if (sub !== user.googleId) throw new ApiError(401, "Google confirmation didn't match this account.");
  }

  const blockers = await deletionBlockers(userId);
  if (blockers.length) {
    throw new ApiError(409, blockers[0]!);
  }

  const noticeTo = user.email;
  try {
    if (deps.sendNotice) await deps.sendNotice(noticeTo);
    else {
      await sendMail({
        to: noticeTo,
        subject: "Your Place2Park account was deleted",
        text: "Your Place2Park account has been deleted. Booking and payment records needed for accounting, fraud checks, or disputes are retained without your personal details.",
      });
    }
  } catch {
    // Deletion still proceeds. The notice address is not written to the audit log.
  }

  await User.updateOne(
    { _id: userId, status: { $nin: ["DELETED"] } },
    { $set: { status: "DELETION_PENDING", deletionRequestedAt: new Date() } }
  );
  await anonymizeOwnedData(userId);
  const deletedEmail = `deleted.${userId}@users.place2park.invalid`;
  const updated = await User.updateOne(
    { _id: userId, status: { $ne: "DELETED" } },
    {
      $set: {
        name: "Deleted user",
        email: deletedEmail,
        phone: "",
        image: "",
        status: "DELETED",
        deletedAt: new Date(),
        notifyEmail: false,
        notifyReminders: false,
        "privacy.marketingEmail": false,
        "privacy.showPublicHostName": false,
      },
      $unset: {
        passwordHash: 1,
        googleId: 1,
        resetToken: 1,
        resetTokenExpires: 1,
        payoutProfile: 1,
        notifications: 1,
      },
      $inc: { tokenVersion: 1 },
    }
  );
  if (updated.matchedCount === 0) return { deleted: true, already: true };
  await EmailOtpPending.deleteMany({ email: noticeTo });
  await AdminAudit.create({
    action: "ACCOUNT_DELETED",
    actorId: userId,
    hostId: userId,
    accountLast4: "",
  });
  return { deleted: true, already: false };
}

async function deletionBlockers(userId: string) {
  const blockers: string[] = [];
  const active = await Booking.exists({
    $or: [{ userId }, { hostId: userId }],
    status: { $in: ["PENDING", "CONFIRMED", "ACTIVE"] },
  });
  if (active) {
    blockers.push("You have an active booking. Finish or cancel it before deleting your account.");
  }

  const related = await Booking.find({ $or: [{ userId }, { hostId: userId }] }).select("_id");
  const relatedIds = related.map((booking) => booking._id);
  if (relatedIds.length) {
    const refund = await Payment.exists({ bookingId: { $in: relatedIds }, refundStatus: "PENDING" });
    if (refund) blockers.push("A refund is still in progress. Wait until it finishes before deleting your account.");
  }

  const openPayout = await HostPayout.exists({ hostId: userId, status: { $in: [...OPEN_PAYOUT_STATUSES] } });
  if (openPayout) blockers.push("A host payout is still processing. Wait until it is paid or closed.");

  const completed = await Booking.find({
    hostId: userId,
    status: "COMPLETED",
    refunded: { $ne: true },
    hostEarning: { $gt: 0 },
  }).select("_id payoutId");
  if (completed.length) {
    const payments = await Payment.find({
      bookingId: { $in: completed.map((booking) => booking._id) },
      status: "PAID",
      refundStatus: { $nin: ["PENDING", "PROCESSED"] },
    }).select("bookingId");
    const paidBookingIds = new Set(payments.map((payment) => String(payment.bookingId)));
    const payoutIds = completed.map((booking) => booking.payoutId).filter(Boolean);
    const settled = await HostPayout.find({ _id: { $in: payoutIds }, status: "PAID" }).select("_id");
    const settledIds = new Set(settled.map((payout) => String(payout._id)));
    const unpaid = completed.some(
      (booking) => paidBookingIds.has(String(booking._id)) && !settledIds.has(String(booking.payoutId))
    );
    if (unpaid) blockers.push("Host earnings are still unpaid. Wait until the payout is completed.");
  }
  return blockers;
}

async function anonymizeOwnedData(userId: string) {
  await Vehicle.deleteMany({ userId });
  await Favorite.deleteMany({ userId });
  await Notification.deleteMany({ userId });
  await PendingUpload.deleteMany({ hostId: userId });
  await FaqFeedback.deleteMany({ userId });
  await SupportEvidence.deleteMany({ userId });
  await Review.updateMany({ userId }, { $set: { comment: "" } });
  await Booking.updateMany({ userId }, { $set: { vehiclePlate: "", accessCode: "" } });
  await Report.updateMany({ reporterId: userId }, { $set: { details: "" } });
  await UserReport.updateMany({ reporterId: userId }, { $set: { description: "Removed.", evidence: [] } });
  await SupportTicket.updateMany(
    { userId },
    { $set: { description: "Removed.", subject: "Removed", evidence: [] } }
  );
  const ticketIds = await SupportTicket.find({ userId }).select("_id");
  const reportIds = await UserReport.find({
    $or: [{ reporterId: userId }, { reportedUserId: userId }],
  }).select("_id");
  await TicketMessage.updateMany(
    { authorId: userId },
    { $set: { body: "Removed." } }
  );
  await TicketMessage.updateMany(
    { ticketId: { $in: [...ticketIds.map((row) => row._id), ...reportIds.map((row) => row._id)] }, authorId: userId },
    { $set: { body: "Removed." } }
  );
  const spaces = await ParkingSpace.find({ hostId: userId }).select("_id");
  const spaceIds = spaces.map((space) => space._id);
  if (spaceIds.length) await BlockedSlot.deleteMany({ spaceId: { $in: spaceIds } });
  await ParkingSpace.updateMany(
    { hostId: userId },
    {
      $set: {
        status: "HIDDEN",
        title: "Removed listing",
        description: "",
        address: "Removed",
        formattedAddress: "",
        accessInstructions: "",
        images: [],
      },
    }
  );
}
