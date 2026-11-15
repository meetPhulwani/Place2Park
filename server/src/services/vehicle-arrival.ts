import crypto from "node:crypto";
import mongoose from "mongoose";
import { AdminAudit, Booking, VehicleCheck } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { notify } from "./notify.js";
import { assertCanTransact } from "./reviews.js";

export const RISK_ACKNOWLEDGEMENT = "I ACCEPT THE RISK";

export function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

function codesMatch(stored: string, given: string) {
  const left = Buffer.from(stored);
  const right = Buffer.from(given.trim());
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function ownedBooking(bookingId: string, hostId: string) {
  if (!hostId) throw new ApiError(401, "Sign in to continue.");
  const booking = await Booking.findById(bookingId);
  if (!booking || String(booking.hostId) !== hostId) throw new ApiError(404, "Booking not found.");
  return booking;
}

export async function recordVehicleCheck(input: {
  hostId: string;
  bookingId: string;
  decision: "MATCH" | "MISMATCH_DECLINED" | "MISMATCH_OVERRIDE";
  acknowledgement?: string;
}) {
  const booking = await ownedBooking(input.bookingId, input.hostId);
  if (!["CONFIRMED", "ACTIVE"].includes(booking.status)) {
    throw new ApiError(409, "This booking is not ready for arrival.");
  }
  const vehiclePlate = normalizePlate(booking.vehiclePlate || "");
  if (!vehiclePlate) throw new ApiError(409, "This booking has no vehicle number to check.");

  if (input.decision === "MISMATCH_OVERRIDE") {
    if (input.acknowledgement !== RISK_ACKNOWLEDGEMENT) {
      throw new ApiError(400, "Confirm the risk in a separate step before continuing.");
    }
    const existing = await VehicleCheck.findOne({
      bookingId: booking._id,
      hostId: input.hostId,
      vehiclePlate,
      decision: "MISMATCH_OVERRIDE",
    });
    if (existing) return existing;
    const created = await VehicleCheck.create({
      bookingId: booking._id,
      hostId: input.hostId,
      vehiclePlate,
      decision: "MISMATCH_OVERRIDE",
    });
    await AdminAudit.create({
      action: "VEHICLE_MISMATCH_OVERRIDE",
      actorId: input.hostId,
      hostId: input.hostId,
      bookingId: booking._id,
      vehiclePlate,
      note: "mismatch_override",
    });
    await notify(
      String(booking.userId),
      "VEHICLE_MISMATCH",
      "Vehicle number did not match",
      "The host reported that the arriving vehicle number did not match the booking. They chose to continue.",
      { bookingId: String(booking._id) }
    );
    return created;
  }

  return VehicleCheck.create({
    bookingId: booking._id,
    hostId: input.hostId,
    vehiclePlate,
    decision: input.decision,
  });
}

/** Access-code check. Does not change the booking status. */
export async function verifyArrivalCode(hostId: string, bookingId: string, code: string) {
  if (!mongoose.isValidObjectId(hostId)) throw new ApiError(401, "Sign in to continue.");
  await assertCanTransact(hostId);
  const booking = await ownedBooking(bookingId, hostId);
  if (!["CONFIRMED", "ACTIVE"].includes(booking.status)) {
    throw new ApiError(409, "This booking is not ready for arrival.");
  }
  const vehiclePlate = normalizePlate(booking.vehiclePlate || "");
  const latest = await VehicleCheck.findOne({ bookingId: booking._id, hostId, vehiclePlate }).sort({ createdAt: -1 });
  if (!latest || (latest.decision !== "MATCH" && latest.decision !== "MISMATCH_OVERRIDE")) {
    throw new ApiError(409, "Confirm the arriving vehicle before entering the code.");
  }
  if (!codesMatch(booking.accessCode, code)) throw new ApiError(400, "That code does not match this booking.");
  return { bookingId: String(booking._id), verified: true };
}
