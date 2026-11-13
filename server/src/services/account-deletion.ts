import mongoose, { type ClientSession } from "mongoose";
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
  TicketAudit,
  TicketMessage,
  User,
  UserReport,
  Vehicle,
} from "../models/index.js";
import { emailBelongsToAdmin } from "./admin-auth.js";
import { sendMail } from "./email.js";
import { discardOwnedMedia, type DestroyListingImageFn } from "./media.js";
import { OPEN_PAYOUT_STATUSES } from "../utils/constants.js";

const CONFIRMATION = "CONFIRM";
const REMOVAL_INTERRUPTED = "We couldn't finish deleting this account. Try again shortly.";

export type DeleteAccountInput = {
  confirmation?: string;
  password?: string;
  credential?: string;
};

type DeleteDeps = {
  sendNotice?: (to: string) => Promise<void>;
  destroyImage?: DestroyListingImageFn;
  /** Test hook. Runs after the account is locked and before records are removed. */
  beforeRemove?: () => Promise<void> | void;
};

export async function accountSecurity(userId: string) {
  const user = await User.findById(userId).select("+passwordHash googleId status");
  if (!user || user.status === "DELETED" || user.status === "DELETION_PENDING") {
    throw new ApiError(401, "Your session has expired. Please log in again.");
  }
  const hasPassword = Boolean(user.passwordHash);
  return { hasPassword, googleOnly: Boolean(user.googleId) && !hasPassword };
}

export async function deleteOwnAccount(userId: string, input: DeleteAccountInput, deps: DeleteDeps = {}) {
  if (input.confirmation !== CONFIRMATION) {
    throw new ApiError(400, "Type CONFIRM to confirm.");
  }
  const user = await User.findById(userId).select("email role status");
  if (!user) return finishIfAlreadyRemoved(userId);

  if (user.role === "ADMIN" || (user.email && (await emailBelongsToAdmin(user.email)))) {
    throw new ApiError(403, "This account can't be deleted here.");
  }

  const resuming = user.status === "DELETION_PENDING" || user.status === "DELETED";
  if (!resuming) {
    if (user.status !== "ACTIVE" && user.status !== "SUSPENDED") {
      throw new ApiError(403, "This account can't be deleted here.");
    }
    const blockers = await deletionBlockers(userId);
    if (blockers.length) throw new ApiError(409, blockers.join(" "));
    const locked = await User.updateOne(
      { _id: userId, status: user.status },
      { $set: { status: "DELETION_PENDING", deletionRequestedAt: new Date() }, $inc: { tokenVersion: 1 } }
    );
    if (locked.modifiedCount === 0) {
      const again = await User.findById(userId).select("status");
      if (!again) return finishIfAlreadyRemoved(userId);
      if (again.status !== "DELETION_PENDING" && again.status !== "DELETED") {
        throw new ApiError(503, REMOVAL_INTERRUPTED);
      }
    } else {
      await sendDeletionNotice(user.email, deps);
    }
  }

  if (deps.beforeRemove) await deps.beforeRemove();

  try {
    const assets = await ownedAssets(userId);
    await discardOwnedMedia(userId, assets, { destroy: deps.destroyImage });
    await purgeAccount(userId, user.email);
  } catch (err) {
    if (await removalFinished(userId)) return { deleted: true, already: true };
    if (err instanceof ApiError) throw err;
    throw new ApiError(503, REMOVAL_INTERRUPTED);
  }
  return { deleted: true, already: false };
}

async function sendDeletionNotice(email: string, deps: DeleteDeps) {
  try {
    if (deps.sendNotice) await deps.sendNotice(email);
    else {
      await sendMail({
        to: email,
        subject: "Your Place2Park account was deleted",
        text: "Your Place2Park account has been deleted. Booking and payment records needed for accounting, fraud checks, or disputes are retained without your personal details.",
      });
    }
  } catch {
    // Deletion still proceeds. The notice address is not written to the audit log.
  }
}

async function finishIfAlreadyRemoved(userId: string) {
  if (await removalFinished(userId)) return { deleted: true, already: true };
  throw new ApiError(404, "Account not found.");
}

async function removalFinished(userId: string) {
  const [user, audit] = await Promise.all([
    User.exists({ _id: userId }),
    AdminAudit.exists({ action: "ACCOUNT_DELETED", actorId: userId }),
  ]);
  return !user && Boolean(audit);
}

async function ownedAssets(userId: string) {
  const [user, spaces, uploads, evidence, tickets, reports] = await Promise.all([
    User.findById(userId).select("image"),
    ParkingSpace.find({ hostId: userId }).select("images"),
    PendingUpload.find({ hostId: userId }).select("url publicId"),
    SupportEvidence.find({ userId }).select("url publicId"),
    SupportTicket.find({ userId }).select("evidence"),
    UserReport.find({ reporterId: userId }).select("evidence"),
  ]);
  const assets: { url?: string; publicId?: string }[] = [];
  if (user?.image) assets.push({ url: user.image });
  for (const space of spaces) {
    for (const image of space.images ?? []) assets.push(image);
  }
  for (const row of uploads) assets.push(row);
  for (const row of evidence) assets.push(row);
  for (const ticket of tickets) {
    for (const item of ticket.evidence ?? []) assets.push(item);
  }
  for (const report of reports) {
    for (const item of report.evidence ?? []) assets.push(item);
  }
  return assets;
}

function transactionsUnsupported(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /Transaction numbers are only allowed|replica set/i.test(message);
}

async function purgeAccount(userId: string, email: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await commitRemoval(userId, email, session);
    });
    return;
  } catch (err) {
    if (!transactionsUnsupported(err)) throw err;
  } finally {
    await session.endSession();
  }
  await commitRemoval(userId, email);
}

async function commitRemoval(userId: string, email: string, session?: ClientSession) {
  await removePersonalData(userId, email, session);
  await writeDeletionAudit(userId, session);
  await User.deleteOne({ _id: userId }, session ? { session } : {});
}

async function writeDeletionAudit(userId: string, session?: ClientSession) {
  const query = AdminAudit.countDocuments({ action: "ACCOUNT_DELETED", actorId: userId });
  const prior = session ? await query.session(session) : await query;
  if (prior > 0) return;
  await AdminAudit.create(
    [{ action: "ACCOUNT_DELETED", actorId: userId, hostId: userId, accountLast4: "" }],
    session ? { session } : undefined
  );
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

async function removePersonalData(userId: string, email: string, session?: ClientSession) {
  const opts = session ? { session } : {};
  await Vehicle.deleteMany({ userId }, opts);
  await Favorite.deleteMany({ userId }, opts);
  await Notification.deleteMany({ userId }, opts);
  await PendingUpload.deleteMany({ hostId: userId }, opts);
  await FaqFeedback.deleteMany({ userId }, opts);
  await SupportEvidence.deleteMany({ userId }, opts);
  await EmailOtpPending.deleteMany({ $or: [{ email }, { userId }] }, opts);
  await Review.updateMany({ userId }, { $set: { comment: "" } }, opts);
  await Booking.updateMany({ userId }, { $set: { vehiclePlate: "", accessCode: "" } }, opts);
  await Report.updateMany({ reporterId: userId }, { $set: { details: "" } }, opts);
  await UserReport.updateMany({ reporterId: userId }, { $set: { description: "Removed.", evidence: [] } }, opts);
  await SupportTicket.updateMany(
    { userId },
    { $set: { description: "Removed.", subject: "Removed", evidence: [] } },
    opts
  );
  await TicketMessage.updateMany({ authorId: userId }, { $set: { body: "Removed." } }, opts);
  await TicketAudit.updateMany({ actorId: userId }, { $set: { note: "" } }, opts);
  const spacesQuery = ParkingSpace.find({ hostId: userId }).select("_id");
  const spaces = session ? await spacesQuery.session(session) : await spacesQuery;
  const spaceIds = spaces.map((space) => space._id);
  if (spaceIds.length) await BlockedSlot.deleteMany({ spaceId: { $in: spaceIds } }, opts);
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
    },
    opts
  );
}
