import type { Response } from "express";
import mongoose from "mongoose";
import { Booking, Payment, Review } from "../models/index.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { cancelBooking, createBooking } from "../services/bookings.js";
import { expireStalePendingBookings, progressBookingStatuses, progressOneBooking } from "../services/availability.js";
import { razorpayConfigured } from "../services/payments.js";
import { redactBooking, revealBookingSecrets } from "../utils/privacy.js";

const withSpace = {
  path: "spaceId",
  select: "title area city locality sublocality district state location images rules covered level",
};
const withSpaceDetail = {
  path: "spaceId",
  select:
    "title area address formattedAddress city locality sublocality district state location images accessInstructions rules covered level",
};

function revealExactForStatus(status: string) {
  return revealBookingSecrets(status);
}

function sanitizeSpace(space: unknown, reveal: boolean) {
  if (!space || typeof space !== "object") return space;
  const raw = space as Record<string, unknown> & { toJSON?: () => Record<string, unknown> };
  const json = typeof raw.toJSON === "function" ? raw.toJSON() : { ...raw };
  if (reveal) return json;
  json.address = "";
  json.formattedAddress = "";
  json.accessInstructions = "";
  json.pincode = "";
  json.postalCode = "";
  json.placeId = "";
  return json;
}

export async function create(req: AuthedRequest, res: Response) {
  const { spaceId, start, durationMins, vehicleType, vehiclePlate } = req.body as {
    spaceId: string;
    start: Date;
    durationMins: number;
    vehicleType: "CAR" | "BIKE";
    vehiclePlate?: string;
  };
  const { booking, order } = await createBooking({
    userId: req.userId,
    spaceId,
    start,
    durationMins,
    vehicleType,
    vehiclePlate,
  });
  res.status(201).json({
    success: true,
    data: {
      bookingId: String(booking._id),
      bookingCode: booking.code,
      amount: booking.totalAmount,
      parkingFee: booking.baseAmount,
      platformFee: booking.serviceFee,
      total: booking.totalAmount,
      status: booking.status,
      paymentStatus: "PAYMENT_PENDING",
      order, // provider MOCK | RAZORPAY (+ keyId when live)
      mockMode: !razorpayConfigured(),
    },
  });
}

export async function listMine(req: AuthedRequest, res: Response) {
  await expireStalePendingBookings();
  await progressBookingStatuses(req.userId);
  const scope =
    req.query.scope === "history" || req.query.scope === "past" || req.query.scope === "cancelled"
      ? String(req.query.scope)
      : "upcoming";
  const now = new Date();

  const filter: Record<string, unknown> = { userId: req.userId };
  if (scope === "upcoming") {
    filter.status = { $in: ["PENDING", "CONFIRMED", "ACTIVE"] };
    filter.end = { $gt: now };
  } else if (scope === "past") {
    filter.status = "COMPLETED";
  } else if (scope === "cancelled") {
    filter.status = { $in: ["CANCELLED", "EXPIRED"] };
  } else {
    filter.status = { $in: ["COMPLETED", "CANCELLED", "EXPIRED"] };
    if (req.query.status && typeof req.query.status === "string" && req.query.status !== "ALL")
      filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.start = {
        ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}),
        ...(req.query.to ? { $lte: new Date(`${req.query.to}T23:59:59`) } : {}),
      };
    }
  }

  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = 10;
  const total = await Booking.countDocuments(filter);
  let query = Booking.find(filter).populate(withSpace);
  query = scope === "upcoming" ? query.sort({ start: 1 }) : query.sort({ start: -1 });

  let bookings = await query.skip((page - 1) * pageSize).limit(pageSize + 1);
  // Text search on populated space title/area (small page — filter in memory).
  if (typeof req.query.q === "string" && req.query.q) {
    const q = req.query.q.toLowerCase();
    bookings = bookings.filter((b) => {
      const s = b.spaceId as unknown as { title?: string; area?: string } | null;
      return (
        b.code.toLowerCase().includes(q) ||
        s?.title?.toLowerCase().includes(q) ||
        s?.area?.toLowerCase().includes(q)
      );
    });
  }
  const hasMore = bookings.length > pageSize;
  if (hasMore) bookings = bookings.slice(0, pageSize);

  // Attach review status for history rows.
  const reviewed = new Set(
    (await Review.find({ bookingId: { $in: bookings.map((b) => b._id) } }).select("bookingId")).map((r) =>
      String(r.bookingId)
    )
  );
  res.json({
    success: true,
    data: {
      bookings: bookings.map((b) => ({
        ...redactBooking(b.toJSON() as Record<string, unknown>),
        reviewed: reviewed.has(String(b._id)),
      })),
      page,
      hasMore,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

export async function detail(req: AuthedRequest, res: Response) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Booking not found.");
  await expireStalePendingBookings();
  await progressOneBooking(req.params.id);
  await progressBookingStatuses(req.userId);
  const booking = await Booking.findById(req.params.id).populate(withSpaceDetail).populate("hostId", "name image hostVerified");
  if (!booking) throw new ApiError(404, "Booking not found.");
  const isOwner = String(booking.userId) === req.userId;
  const isHost = String((booking.hostId as { _id?: unknown })?._id ?? booking.hostId) === req.userId;
  if (!isOwner && !isHost && req.userRole !== "ADMIN") throw new ApiError(403, "Not your booking.");

  const [payment, review] = await Promise.all([
    Payment.findOne({ bookingId: booking._id }),
    Review.findOne({ bookingId: booking._id }),
  ]);
  const reveal = revealExactForStatus(booking.status);
  const bookingJson = redactBooking(booking.toJSON() as Record<string, unknown>);
  bookingJson.spaceId = sanitizeSpace(bookingJson.spaceId, reveal);
  res.json({
    success: true,
    data: {
      booking: bookingJson,
      payment,
      review,
      isOwner,
      revealExactLocation: reveal,
    },
  });
}

export async function cancel(req: AuthedRequest, res: Response) {
  const { refunded, refundStatus } = await cancelBooking(req.params.id, req.userId, req.userRole === "ADMIN");
  res.json({ success: true, data: { refunded, refundStatus } });
}
