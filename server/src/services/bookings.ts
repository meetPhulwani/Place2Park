import mongoose from "mongoose";
import { Booking, Payment, ParkingSpace } from "../models/index.js";
import { isProd } from "../config/env.js";
import { ApiError } from "../middleware/error.js";
import { computeQuote } from "../utils/pricing.js";
import { bookingCode, accessCode } from "../utils/codes.js";
import { FREE_CANCEL_BEFORE_MINS, PENDING_HOLD_MINS } from "../utils/constants.js";
import {
  AVAILABILITY_ERROR_MESSAGES,
  expireStalePendingBookings,
  hasConflict,
  occupyingOverlapFilter,
  progressSpaceBookings,
  validateWindow,
} from "./availability.js";
import {
  cancelUnpaidRazorpayOrder,
  createPaymentOrder,
  listRazorpayRefunds,
  refundRazorpayPayment,
  reconcileExpiredPaymentHolds,
  type CancelOrderFn,
  type ListRefundsFn,
  type RefundPaymentFn,
} from "./payments.js";
import { markBookingRefunded } from "./payouts.js";
import { notify } from "./notify.js";
import { formatDateTime } from "../utils/format.js";

interface CreateBookingInput {
  userId: string;
  spaceId: string;
  start: Date;
  durationMins: number;
  vehicleType: "CAR" | "BIKE";
  vehiclePlate?: string;
}

function isTxnUnsupported(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /Transaction numbers are only allowed|replica set|not supported/i.test(msg);
}

function raceFilter(spaceId: string, bookingId: unknown, start: Date, end: Date) {
  return {
    _id: { $lt: bookingId },
    spaceId,
    start: { $lt: end },
    end: { $gt: start },
    ...occupyingOverlapFilter(),
  };
}

type BookingDoc = InstanceType<typeof Booking>;

/** After commit, keep the oldest overlapping hold and delete the rest. */
export async function assertSoleOccupant(spaceId: string, start: Date, end: Date, bookingId: unknown) {
  const oldest = await Booking.findOne({
    spaceId,
    start: { $lt: end },
    end: { $gt: start },
    ...occupyingOverlapFilter(),
  })
    .sort({ _id: 1 })
    .select("_id");
  if (oldest && String(oldest._id) !== String(bookingId)) {
    await Booking.deleteOne({ _id: bookingId });
    throw new ApiError(409, AVAILABILITY_ERROR_MESSAGES.CONFLICT);
  }
}

/** Insert + conflict re-check. Uses a Mongo transaction when the cluster supports it. */
async function insertBookingAtomically(
  spaceId: string,
  start: Date,
  end: Date,
  payload: Record<string, unknown>
): Promise<BookingDoc> {
  const session = await mongoose.startSession();
  try {
    const created = await session.withTransaction(async () => {
      await ParkingSpace.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(spaceId) },
        { $inc: { __bookLock: 1 } },
        { session }
      );
      if (await hasConflict(spaceId, start, end, undefined, session)) {
        throw new ApiError(409, AVAILABILITY_ERROR_MESSAGES.CONFLICT);
      }
      const doc = new Booking(payload);
      await doc.save({ session });
      const raced = await Booking.exists(raceFilter(spaceId, doc._id, start, end)).session(session);
      if (raced) throw new ApiError(409, AVAILABILITY_ERROR_MESSAGES.CONFLICT);
      return doc;
    });
    if (!created) throw new ApiError(500, "Could not create booking.");
    return created;
  } catch (err) {
    if (!isTxnUnsupported(err)) throw err;
  } finally {
    await session.endSession();
  }

  const booking = new Booking(payload);
  await booking.save();
  const raced = await Booking.exists(raceFilter(spaceId, booking._id, start, end));
  if (raced) {
    await booking.deleteOne();
    throw new ApiError(409, AVAILABILITY_ERROR_MESSAGES.CONFLICT);
  }
  return booking;
}

/**
 * Creates a PENDING booking (payment hold) after full server-side validation.
 * Double-booking safety: conflict check before insert AND an optimistic
 * re-check after insert (delete own booking if an earlier one overlaps).
 */
export async function createBooking(input: CreateBookingInput) {
  if (!mongoose.isValidObjectId(input.spaceId)) throw new ApiError(404, "Listing not found.");
  const space = await ParkingSpace.findById(input.spaceId);
  if (!space) throw new ApiError(404, "Listing not found.");
  if (String(space.hostId) === input.userId) throw new ApiError(400, "You can't book your own listing.");

  const end = new Date(input.start.getTime() + input.durationMins * 60000);

  const expiredIds = await expireStalePendingBookings(input.spaceId);
  await reconcileExpiredPaymentHolds({}, expiredIds);
  await progressSpaceBookings(input.spaceId);
  const windowCheck = validateWindow(space, input.start, end);
  if (!windowCheck.ok) throw new ApiError(409, AVAILABILITY_ERROR_MESSAGES[windowCheck.error!]);
  if (await hasConflict(input.spaceId, input.start, end))
    throw new ApiError(409, AVAILABILITY_ERROR_MESSAGES.CONFLICT);

  const quote = computeQuote(space.pricePerHour, input.durationMins);
  const payload = {
    code: bookingCode(),
    userId: input.userId,
    spaceId: space._id,
    hostId: space.hostId,
    start: input.start,
    end,
    durationMins: input.durationMins,
    status: "PENDING" as const,
    expiresAt: new Date(Date.now() + PENDING_HOLD_MINS * 60000),
    vehicleType: input.vehicleType,
    vehiclePlate: input.vehiclePlate ?? "",
    accessCode: accessCode(),
    baseAmount: quote.baseAmount,
    serviceFee: quote.serviceFee,
    totalAmount: quote.totalAmount,
    platformFee: quote.platformFee,
    hostEarning: quote.hostEarning,
  };

  const booking = await insertBookingAtomically(String(space._id), input.start, end, payload);
  await assertSoleOccupant(String(space._id), input.start, end, booking._id);

  let order: Awaited<ReturnType<typeof createPaymentOrder>> | {
    provider: "MOCK";
    orderId: string;
    amount: number;
    currency: string;
  };
  try {
    order = await createPaymentOrder(String(booking._id), quote.totalAmount);
  } catch {
    // Reservation still holds; Pay Now can create the Razorpay order later.
    order = { provider: "MOCK", orderId: "", amount: quote.totalAmount, currency: "INR" };
  }
  await Payment.create({
    bookingId: booking._id,
    provider: order.provider,
    orderId: order.orderId,
    amount: quote.totalAmount,
    status: "CREATED",
  });

  return { booking, order };
}

export interface ConfirmBookingPaidDeps {
  notify?: typeof notify;
}

export interface CaptureSettlementDeps extends ConfirmBookingPaidDeps {
  refundPayment?: RefundPaymentFn;
  listRefunds?: ListRefundsFn;
  cancelOrder?: CancelOrderFn;
}

export type RefundStatus = "PENDING" | "PROCESSED" | "FAILED";

export type CaptureOutcome = "confirmed" | "already_paid" | "refunded" | "refund_pending";

export type CaptureSettlement = {
  outcome: CaptureOutcome;
  bookingId: string;
  refunded: boolean;
  refundStatus: RefundStatus | null;
};

function isHoldExpired(booking: { status: string; expiresAt?: Date | null }) {
  return (
    booking.status === "EXPIRED" ||
    (booking.status === "PENDING" && !!booking.expiresAt && booking.expiresAt.getTime() <= Date.now())
  );
}

const PAID_BOOKING_STATUSES = ["CONFIRMED", "ACTIVE", "COMPLETED"] as const;

function isPaidBookingStatus(status: string) {
  return (PAID_BOOKING_STATUSES as readonly string[]).includes(status);
}

async function markPaymentPaid(bookingId: unknown, paymentId: string, signature: string) {
  await Payment.updateOne(
    { bookingId, status: { $in: ["CREATED", "FAILED"] } },
    { $set: { status: "PAID", paymentId, signature } }
  );
}

const pendingConfirmFilter = (bookingId: unknown) => ({
  _id: bookingId,
  status: "PENDING" as const,
  $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

/** Claim PENDING → CONFIRMED and apply payment + bookingsCount in one unit of work. */
async function claimPaidConfirmation(bookingId: unknown, paymentId: string, signature: string) {
  const update = { $set: { status: "CONFIRMED" }, $unset: { expiresAt: 1 } };

  async function write(session?: mongoose.ClientSession) {
    const claimed = await Booking.findOneAndUpdate(pendingConfirmFilter(bookingId), update, {
      new: true,
      session,
    });
    if (!claimed) return null;
    await Payment.updateOne(
      { bookingId: claimed._id, status: { $in: ["CREATED", "FAILED"] } },
      { $set: { status: "PAID", paymentId, signature } },
      { session }
    );
    await ParkingSpace.updateOne({ _id: claimed.spaceId }, { $inc: { bookingsCount: 1 } }, { session });
    return claimed;
  }

  const session = await mongoose.startSession();
  try {
    const claimed = await session.withTransaction(async () => write(session));
    return claimed ?? null;
  } catch (err) {
    if (!isTxnUnsupported(err)) throw err;
  } finally {
    await session.endSession();
  }
  return write();
}

/**
 * Confirms a PENDING hold after the caller has verified the payment.
 * Exactly one concurrent caller wins `PENDING → CONFIRMED` and increments
 * `bookingsCount`. Notifications run only on that winning path (at most once
 * per confirmation attempt in this process — not an outbox).
 */
export async function confirmBookingPaid(
  bookingId: string,
  paymentId: string,
  signature?: string,
  deps: ConfirmBookingPaidDeps = {}
) {
  const send = deps.notify ?? notify;
  const sig = signature ?? "";
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");

  if (isPaidBookingStatus(booking.status)) {
    await markPaymentPaid(booking._id, paymentId, sig);
    return booking.populate<{ spaceId: { title: string } }>("spaceId", "title");
  }
  if (booking.status !== "PENDING") throw new ApiError(409, "This booking can no longer be paid.");
  if (booking.expiresAt && booking.expiresAt.getTime() <= Date.now())
    throw new ApiError(409, "This reservation has expired.");

  const claimed = await claimPaidConfirmation(booking._id, paymentId, sig);
  if (!claimed) {
    const latest = await Booking.findById(booking._id);
    if (latest && isPaidBookingStatus(latest.status)) {
      await markPaymentPaid(latest._id, paymentId, sig);
      return latest.populate<{ spaceId: { title: string } }>("spaceId", "title");
    }
    if (latest?.status === "PENDING" && latest.expiresAt && latest.expiresAt.getTime() <= Date.now())
      throw new ApiError(409, "This reservation has expired.");
    throw new ApiError(409, "This booking can no longer be paid.");
  }

  await claimed.populate<{ spaceId: { title: string } }>("spaceId", "title");
  const title = (claimed.spaceId as unknown as { title: string }).title;
  await send(
    String(claimed.userId),
    "BOOKING_CONFIRMED",
    "Booking confirmed 🎉",
    `Your parking at ${title} is confirmed for ${formatDateTime(claimed.start)}.`,
    { bookingId }
  );
  await send(
    String(claimed.hostId),
    "HOST_NEW_BOOKING",
    "New booking received",
    `${title}: ${formatDateTime(claimed.start)} – ${formatDateTime(claimed.end)}.`,
    { bookingId }
  );
  return claimed;
}

/** Revive an expired hold only when the slot is still free. Never confirm over a later booking. */
async function claimLateConfirmation(bookingId: unknown, paymentId: string, signature: string) {
  const update = { $set: { status: "CONFIRMED" as const }, $unset: { expiresAt: 1 } };
  const filter = { _id: bookingId, status: { $in: ["PENDING", "EXPIRED"] } };

  async function write(session?: mongoose.ClientSession) {
    const claimed = await Booking.findOneAndUpdate(filter, update, { new: true, session });
    if (!claimed) return null;
    if (await hasConflict(String(claimed.spaceId), claimed.start, claimed.end, String(claimed._id), session)) {
      throw new ApiError(409, AVAILABILITY_ERROR_MESSAGES.CONFLICT);
    }
    await Payment.updateOne(
      { bookingId: claimed._id, status: { $in: ["CREATED", "FAILED"] } },
      { $set: { status: "PAID", paymentId, signature } },
      { session }
    );
    await ParkingSpace.updateOne({ _id: claimed.spaceId }, { $inc: { bookingsCount: 1 } }, { session });
    return claimed;
  }

  const session = await mongoose.startSession();
  try {
    const claimed = await session.withTransaction(async () => write(session));
    return claimed ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return null;
    if (!isTxnUnsupported(err)) throw err;
  } finally {
    await session.endSession();
  }

  try {
    return await write();
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      await Booking.updateOne({ _id: bookingId, status: "CONFIRMED" }, { $set: { status: "EXPIRED" } });
      return null;
    }
    throw err;
  }
}

async function notifyConfirmed(booking: BookingDoc, bookingId: string, send: typeof notify) {
  await booking.populate<{ spaceId: { title: string } }>("spaceId", "title");
  const title = (booking.spaceId as unknown as { title: string }).title;
  await send(
    String(booking.userId),
    "BOOKING_CONFIRMED",
    "Booking confirmed 🎉",
    `Your parking at ${title} is confirmed for ${formatDateTime(booking.start)}.`,
    { bookingId }
  );
  await send(
    String(booking.hostId),
    "HOST_NEW_BOOKING",
    "New booking received",
    `${title}: ${formatDateTime(booking.start)} – ${formatDateTime(booking.end)}.`,
    { bookingId }
  );
}

/**
 * After a verified capture: confirm when possible, otherwise refund the stored amount.
 * A paid driver always ends with a confirmed booking or a tracked refund state.
 */
export async function settleCapturedPayment(
  bookingId: string,
  paymentId: string,
  signature?: string,
  deps: CaptureSettlementDeps = {}
): Promise<CaptureSettlement> {
  const sig = signature ?? "";
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");

  if (isPaidBookingStatus(booking.status)) {
    await markPaymentPaid(booking._id, paymentId, sig);
    return { outcome: "already_paid", bookingId, refunded: false, refundStatus: null };
  }

  const livePending = booking.status === "PENDING" && !isHoldExpired(booking);
  if (livePending) {
    try {
      await confirmBookingPaid(bookingId, paymentId, sig, { notify: deps.notify });
      return { outcome: "confirmed", bookingId, refunded: false, refundStatus: null };
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 409) throw err;
    }
  }

  if (isHoldExpired(booking)) {
    const conflict = await hasConflict(String(booking.spaceId), booking.start, booking.end, String(booking._id));
    if (!conflict) {
      const claimed = await claimLateConfirmation(booking._id, paymentId, sig);
      if (claimed) {
        await notifyConfirmed(claimed, bookingId, deps.notify ?? notify);
        return { outcome: "confirmed", bookingId, refunded: false, refundStatus: null };
      }
      const latest = await Booking.findById(booking._id);
      if (latest && isPaidBookingStatus(latest.status)) {
        await markPaymentPaid(latest._id, paymentId, sig);
        return { outcome: "already_paid", bookingId, refunded: false, refundStatus: null };
      }
    }
    if (booking.status === "PENDING") {
      await Booking.updateOne({ _id: booking._id, status: "PENDING" }, { $set: { status: "EXPIRED" } });
    }
  }

  const settled = await settlePaidRefund(booking, deps, { force: true, paymentId });
  if (settled.refundStatus === "PROCESSED") {
    return { outcome: "refunded", bookingId, refunded: true, refundStatus: "PROCESSED" };
  }
  if (settled.refundStatus === "PENDING") {
    return { outcome: "refund_pending", bookingId, refunded: true, refundStatus: "PENDING" };
  }
  throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
}

/** Expire a stale hold and cancel its unpaid Razorpay order when the official API supports it. */
export async function releaseExpiredPaymentHold(bookingId: string, deps: CaptureSettlementDeps = {}) {
  if (!mongoose.isValidObjectId(bookingId)) return;
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (!isHoldExpired(booking) && booking.status !== "EXPIRED") return;
  if (booking.status === "PENDING") {
    await Booking.updateOne({ _id: booking._id, status: "PENDING" }, { $set: { status: "EXPIRED" } });
  }
  const payment = await Payment.findOne({ bookingId: booking._id, status: "CREATED" });
  if (!payment?.orderId) return;
  if (payment.orderCancelStatus === "cancelled" || payment.orderCancelStatus === "unsupported") return;
  const result = await cancelUnpaidRazorpayOrder(payment.orderId, deps.cancelOrder);
  await Payment.updateOne(
    { _id: payment._id, status: "CREATED" },
    { $set: { orderCancelStatus: result, orderCancelAttemptedAt: new Date() } }
  );
}

/** Marks the payment failed. Booking stays PENDING so the driver can retry before the hold expires. */
export async function failBookingPayment(bookingId: string) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");
  await Payment.updateOne(
    { bookingId: booking._id, status: { $in: ["CREATED", "FAILED"] } },
    { $set: { status: "FAILED" } }
  );
  return booking;
}

export interface CancelBookingDeps extends CaptureSettlementDeps {}

function isUncertainRefundError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network|unavailable/i.test(msg);
}

async function listRefundsSafe(paymentId: string, deps: CancelBookingDeps) {
  if (!paymentId) return [];
  if (deps.listRefunds) return deps.listRefunds(paymentId).catch(() => []);
  if (!isProd) return [];
  return listRazorpayRefunds(paymentId).catch(() => []);
}

function isRefundWindow(start: Date) {
  return start.getTime() - Date.now() > FREE_CANCEL_BEFORE_MINS * 60000;
}

export type RefundSettlement = {
  refunded: boolean;
  refundStatus: RefundStatus | null;
};

function settlement(refundStatus: RefundStatus | null): RefundSettlement {
  return { refunded: refundStatus === "PENDING" || refundStatus === "PROCESSED", refundStatus };
}

async function persistRefundResult(
  bookingId: unknown,
  paymentId: unknown,
  amount: number,
  result: { refundId: string; processed: boolean }
) {
  if (result.processed) {
    await Payment.updateOne(
      { _id: paymentId },
      {
        $set: {
          status: "REFUNDED",
          refundStatus: "PROCESSED",
          refundId: result.refundId,
          refundAmount: amount,
          refundProcessedAt: new Date(),
          refundInFlight: false,
        },
      }
    );
    await markBookingRefunded(bookingId);
    return settlement("PROCESSED");
  }
  await Payment.updateOne(
    { _id: paymentId, status: { $ne: "REFUNDED" } },
    { $set: { refundStatus: "PENDING", refundId: result.refundId, refundAmount: amount, refundInFlight: false } }
  );
  return settlement("PENDING");
}

async function completeRefundAfterClaim(
  booking: { _id: unknown },
  claimed: { _id: unknown; paymentId?: string | null; amount: number },
  deps: CancelBookingDeps
): Promise<RefundSettlement> {
  const paymentId = claimed.paymentId ?? "";
  if (!paymentId) {
    await Payment.updateOne(
      { _id: claimed._id, status: { $ne: "REFUNDED" } },
      { $set: { refundStatus: "FAILED", refundFailedAt: new Date(), refundInFlight: false } }
    );
    throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  }

  const listed = await listRefundsSafe(paymentId, deps);
  const existing = listed.find((row) => row.refundId);
  if (existing) return persistRefundResult(booking._id, claimed._id, claimed.amount, existing);

  try {
    const result = await refundRazorpayPayment(paymentId, claimed.amount, deps.refundPayment);
    return persistRefundResult(booking._id, claimed._id, claimed.amount, result);
  } catch (err) {
    const afterError = await listRefundsSafe(paymentId, deps);
    const found = afterError.find((row) => row.refundId);
    if (found) return persistRefundResult(booking._id, claimed._id, claimed.amount, found);
    if (isUncertainRefundError(err)) {
      await Payment.updateOne(
        { _id: claimed._id, status: { $ne: "REFUNDED" } },
        { $set: { refundStatus: "PENDING", refundAmount: claimed.amount, refundInFlight: false } }
      );
      throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
    }
    await Payment.updateOne(
      { _id: claimed._id, status: { $ne: "REFUNDED" } },
      { $set: { refundStatus: "FAILED", refundFailedAt: new Date(), refundInFlight: false } }
    );
    throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  }
}

/** Claim PAID → refund in-flight, call Razorpay, persist id/state. Never mark REFUNDED on request alone. */
async function settlePaidRefund(
  booking: { _id: unknown; start: Date },
  deps: CancelBookingDeps,
  opts: { force?: boolean; paymentId?: string } = {}
): Promise<RefundSettlement> {
  const payment = await Payment.findOne({ bookingId: booking._id });
  if (!payment) return settlement(null);
  if (opts.paymentId && !payment.paymentId) {
    payment.paymentId = opts.paymentId;
    await Payment.updateOne({ _id: payment._id, paymentId: { $in: [null, "", undefined] } }, { $set: { paymentId: opts.paymentId } });
  }
  if (payment.status === "REFUNDED" || payment.refundStatus === "PROCESSED") {
    await markBookingRefunded(booking._id);
    return settlement("PROCESSED");
  }
  if (payment.refundStatus === "PENDING" && payment.refundId) return settlement("PENDING");
  const payable = payment.status === "PAID" || (opts.force && payment.status === "CREATED");
  if (!payable || (!opts.force && !isRefundWindow(booking.start))) return settlement(null);

  const claimed = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      status: opts.force ? { $in: ["CREATED", "PAID"] } : "PAID",
      $or: [
        { refundStatus: { $exists: false } },
        { refundStatus: null },
        { refundStatus: "FAILED" },
        {
          refundStatus: "PENDING",
          refundInFlight: { $ne: true },
          $or: [{ refundId: { $exists: false } }, { refundId: null }, { refundId: "" }],
        },
      ],
    },
    {
      $set: {
        ...(opts.force ? { status: "PAID", paymentId: opts.paymentId || payment.paymentId } : {}),
        refundStatus: "PENDING",
        refundInFlight: true,
        refundAmount: payment.amount,
        refundRequestedAt: new Date(),
      },
      $unset: { refundFailedAt: 1 },
    },
    { new: true }
  );
  if (!claimed) {
    const latest = await Payment.findById(payment._id);
    if (latest?.status === "REFUNDED" || latest?.refundStatus === "PROCESSED") return settlement("PROCESSED");
    if (latest?.refundStatus === "PENDING") {
      if (latest.refundId) return settlement("PENDING");
      const listed = await listRefundsSafe(latest.paymentId || opts.paymentId || "", deps);
      const found = listed.find((row) => row.refundId);
      if (found) return persistRefundResult(booking._id, latest._id, latest.amount, found);
      return settlement("PENDING");
    }
    return settlement(null);
  }
  return completeRefundAfterClaim(
    booking,
    { _id: claimed._id, paymentId: claimed.paymentId || opts.paymentId, amount: claimed.amount },
    deps
  );
}

/** Cancel by the driver (or admin). Refund eligible paid bookings through Razorpay. */
export async function cancelBooking(
  bookingId: string,
  byUserId: string,
  isAdmin: boolean,
  deps: CancelBookingDeps = {}
) {
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(404, "Booking not found.");
  const expiredIds = await expireStalePendingBookings();
  await reconcileExpiredPaymentHolds(deps, expiredIds);
  const booking = await Booking.findById(bookingId).populate<{ spaceId: { title: string } }>("spaceId", "title");
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (!isAdmin && String(booking.userId) !== byUserId) throw new ApiError(403, "Not your booking.");

  const send = deps.notify ?? notify;
  if (booking.status === "CANCELLED") {
    const settled = await settlePaidRefund(booking, deps);
    if (settled.refunded) return { booking, ...settled };
    throw new ApiError(409, "This booking can't be cancelled anymore.");
  }
  if (!["PENDING", "CONFIRMED"].includes(booking.status))
    throw new ApiError(409, "This booking can't be cancelled anymore.");
  if (booking.status === "CONFIRMED" && booking.start.getTime() <= Date.now())
    throw new ApiError(409, "This booking has already started and can't be cancelled.");

  const claimed = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      $or: [{ status: "PENDING" }, { status: "CONFIRMED", start: { $gt: new Date() } }],
    },
    { $set: { status: "CANCELLED", cancelledAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    const latest = await Booking.findById(booking._id);
    if (latest?.status === "CANCELLED") {
      const settled = await settlePaidRefund(latest, deps);
      if (settled.refunded) return { booking: latest, ...settled };
    }
    throw new ApiError(409, "This booking can't be cancelled anymore.");
  }

  const settled = await settlePaidRefund(claimed, deps);
  if (!settled.refunded) {
    const unpaid = await Payment.findOne({ bookingId: claimed._id, status: "CREATED" });
    if (unpaid?.orderId) await cancelUnpaidRazorpayOrder(unpaid.orderId, deps.cancelOrder);
  }

  const title = (booking.spaceId as unknown as { title: string }).title;
  await send(
    String(booking.userId),
    "BOOKING_CANCELLED",
    "Booking cancelled",
    settled.refunded
      ? "Your booking was cancelled. A refund has been requested; it can take a few days to appear."
      : "Your booking was cancelled.",
    { bookingId }
  );
  await send(
    String(booking.hostId),
    "BOOKING_CANCELLED",
    "Booking cancelled",
    `${title}: the ${formatDateTime(booking.start)} booking was cancelled.`,
    { bookingId }
  );
  return { booking: claimed, ...settled };
}
