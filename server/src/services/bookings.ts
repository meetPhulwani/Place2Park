import mongoose from "mongoose";
import { Booking, Payment, ParkingSpace } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { computeQuote } from "../utils/pricing.js";
import { bookingCode, accessCode } from "../utils/codes.js";
import { FREE_CANCEL_BEFORE_MINS, PENDING_HOLD_MINS } from "../utils/constants.js";
import {
  AVAILABILITY_ERROR_MESSAGES,
  expireStalePendingBookings,
  hasConflict,
  validateWindow,
} from "./availability.js";
import { createPaymentOrder, refundRazorpayPayment, type RefundPaymentFn } from "./payments.js";
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
    status: { $in: ["PENDING", "CONFIRMED", "ACTIVE"] },
    start: { $lt: end },
    end: { $gt: start },
    $or: [{ status: { $ne: "PENDING" } }, { expiresAt: { $gt: new Date() } }],
  };
}

type BookingDoc = InstanceType<typeof Booking>;

/** After commit, keep the oldest overlapping hold and delete the rest. */
async function assertSoleOccupant(spaceId: string, start: Date, end: Date, bookingId: unknown) {
  const oldest = await Booking.findOne({
    spaceId,
    status: { $in: ["PENDING", "CONFIRMED", "ACTIVE"] },
    start: { $lt: end },
    end: { $gt: start },
    $or: [{ status: { $ne: "PENDING" } }, { expiresAt: { $gt: new Date() } }],
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

  await expireStalePendingBookings(input.spaceId);
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

const PAID_BOOKING_STATUSES = ["CONFIRMED", "ACTIVE", "COMPLETED"] as const;

function isPaidBookingStatus(status: string) {
  return (PAID_BOOKING_STATUSES as readonly string[]).includes(status);
}

async function markPaymentPaid(bookingId: unknown, paymentId: string, signature: string) {
  await Payment.updateOne(
    { bookingId, status: { $ne: "PAID" } },
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
      { bookingId: claimed._id },
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

export interface CancelBookingDeps {
  notify?: typeof notify;
  refundPayment?: RefundPaymentFn;
}

function isRefundWindow(start: Date) {
  return start.getTime() - Date.now() > FREE_CANCEL_BEFORE_MINS * 60000;
}

/** Claim PAID → refund in-flight, call Razorpay, persist id/state. Never mark REFUNDED on request alone. */
async function settlePaidRefund(
  booking: { _id: unknown; start: Date },
  deps: CancelBookingDeps
): Promise<boolean> {
  const payment = await Payment.findOne({ bookingId: booking._id });
  if (!payment) return false;
  if (payment.status === "REFUNDED" || payment.refundStatus === "PROCESSED") {
    await Booking.updateOne({ _id: booking._id }, { $set: { refunded: true } });
    return true;
  }
  if (payment.refundStatus === "PENDING" && payment.refundId) return true;
  if (payment.status !== "PAID" || !isRefundWindow(booking.start)) return false;

  const claimed = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      status: "PAID",
      $or: [{ refundStatus: { $exists: false } }, { refundStatus: null }, { refundStatus: "FAILED" }],
    },
    { $set: { refundStatus: "PENDING" } },
    { new: true }
  );
  if (!claimed) {
    const latest = await Payment.findById(payment._id);
    if (latest?.status === "REFUNDED" || latest?.refundStatus === "PROCESSED") return true;
    if (latest?.refundStatus === "PENDING") return true;
    return false;
  }
  if (!claimed.paymentId) {
    await Payment.updateOne({ _id: claimed._id, status: { $ne: "REFUNDED" } }, { $set: { refundStatus: "FAILED" } });
    throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  }

  try {
    const result = await refundRazorpayPayment(claimed.paymentId, claimed.amount, deps.refundPayment);
    if (result.processed) {
      await Payment.updateOne(
        { _id: claimed._id },
        { $set: { status: "REFUNDED", refundStatus: "PROCESSED", refundId: result.refundId } }
      );
      await Booking.updateOne({ _id: booking._id }, { $set: { refunded: true } });
      return true;
    }
    await Payment.updateOne(
      { _id: claimed._id, status: { $ne: "REFUNDED" } },
      { $set: { refundStatus: "PENDING", refundId: result.refundId } }
    );
    return true;
  } catch {
    await Payment.updateOne({ _id: claimed._id, status: { $ne: "REFUNDED" } }, { $set: { refundStatus: "FAILED" } });
    throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  }
}

/** Cancel by the driver (or admin). Refund eligible paid bookings through Razorpay. */
export async function cancelBooking(
  bookingId: string,
  byUserId: string,
  isAdmin: boolean,
  deps: CancelBookingDeps = {}
) {
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(404, "Booking not found.");
  await expireStalePendingBookings();
  const booking = await Booking.findById(bookingId).populate<{ spaceId: { title: string } }>("spaceId", "title");
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (!isAdmin && String(booking.userId) !== byUserId) throw new ApiError(403, "Not your booking.");

  const send = deps.notify ?? notify;
  if (booking.status === "CANCELLED") {
    const refunded = await settlePaidRefund(booking, deps);
    if (refunded) return { booking, refunded: true };
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
      const refunded = await settlePaidRefund(latest, deps);
      if (refunded) return { booking: latest, refunded: true };
    }
    throw new ApiError(409, "This booking can't be cancelled anymore.");
  }

  const refunded = await settlePaidRefund(claimed, deps);

  const title = (booking.spaceId as unknown as { title: string }).title;
  await send(
    String(booking.userId),
    "BOOKING_CANCELLED",
    "Booking cancelled",
    refunded ? "Your booking was cancelled. A full refund has been initiated." : "Your booking was cancelled.",
    { bookingId }
  );
  await send(
    String(booking.hostId),
    "BOOKING_CANCELLED",
    "Booking cancelled",
    `${title}: the ${formatDateTime(booking.start)} booking was cancelled.`,
    { bookingId }
  );
  return { booking: claimed, refunded };
}
