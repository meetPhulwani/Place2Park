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
import { createPaymentOrder } from "./payments.js";
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

/** Marks a booking paid + confirmed (after signature/mock verification). */
export async function confirmBookingPaid(bookingId: string, paymentId: string, signature?: string) {
  const booking = await Booking.findById(bookingId).populate<{ spaceId: { title: string } }>("spaceId", "title");
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (["CONFIRMED", "ACTIVE", "COMPLETED"].includes(booking.status)) {
    await Payment.updateOne(
      { bookingId: booking._id, status: { $ne: "PAID" } },
      { $set: { status: "PAID", paymentId, signature: signature ?? "" } }
    );
    return booking;
  }
  if (booking.status !== "PENDING") throw new ApiError(409, "This booking can no longer be paid.");
  if (booking.expiresAt && booking.expiresAt.getTime() <= Date.now())
    throw new ApiError(409, "This reservation has expired.");

  booking.status = "CONFIRMED";
  booking.expiresAt = undefined;
  await booking.save();
  await Payment.updateOne(
    { bookingId: booking._id },
    { $set: { status: "PAID", paymentId, signature: signature ?? "" } }
  );
  await ParkingSpace.updateOne({ _id: booking.spaceId }, { $inc: { bookingsCount: 1 } });

  const title = (booking.spaceId as unknown as { title: string }).title;
  await notify(String(booking.userId), "BOOKING_CONFIRMED", "Booking confirmed 🎉",
    `Your parking at ${title} is confirmed for ${formatDateTime(booking.start)}.`, { bookingId });
  await notify(String(booking.hostId), "HOST_NEW_BOOKING", "New booking received",
    `${title}: ${formatDateTime(booking.start)} – ${formatDateTime(booking.end)}.`, { bookingId });
  return booking;
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

/** Cancel by the driver (or admin). Refund when outside the cutoff window. */
export async function cancelBooking(bookingId: string, byUserId: string, isAdmin: boolean) {
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(404, "Booking not found.");
  await expireStalePendingBookings();
  const booking = await Booking.findById(bookingId).populate<{ spaceId: { title: string } }>("spaceId", "title");
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (!isAdmin && String(booking.userId) !== byUserId) throw new ApiError(403, "Not your booking.");
  if (!["PENDING", "CONFIRMED"].includes(booking.status))
    throw new ApiError(409, "This booking can't be cancelled anymore.");
  if (booking.status === "CONFIRMED" && booking.start.getTime() <= Date.now())
    throw new ApiError(409, "This booking has already started and can't be cancelled.");

  const paid = await Payment.exists({ bookingId: booking._id, status: "PAID" });
  const refundable = !!paid && booking.start.getTime() - Date.now() > FREE_CANCEL_BEFORE_MINS * 60000;
  booking.status = "CANCELLED";
  booking.cancelledAt = new Date();
  booking.refunded = refundable;
  await booking.save();
  if (refundable) {
    await Payment.updateOne({ bookingId: booking._id, status: "PAID" }, { $set: { status: "REFUNDED" } });
  }

  const title = (booking.spaceId as unknown as { title: string }).title;
  await notify(String(booking.userId), "BOOKING_CANCELLED", "Booking cancelled",
    refundable ? "Your booking was cancelled. A full refund has been initiated." : "Your booking was cancelled.",
    { bookingId });
  await notify(String(booking.hostId), "BOOKING_CANCELLED", "Booking cancelled",
    `${title}: the ${formatDateTime(booking.start)} booking was cancelled.`, { bookingId });
  return { booking, refunded: refundable };
}
