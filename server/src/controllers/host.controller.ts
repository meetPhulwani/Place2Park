import type { Response } from "express";
import mongoose from "mongoose";
import { BlockedSlot, Booking, ParkingSpace, Review } from "../models/index.js";
import { summarizeHostEarnings } from "../services/payouts.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { expireStalePendingBookings, hasConflict, progressBookingStatuses } from "../services/availability.js";
import { redactBooking } from "../utils/privacy.js";
import { env } from "../config/env.js";
import type { ListingInput } from "../utils/validation.js";
import { persistListingImages } from "../services/media.js";
import { listingCreateState, statusOnPublish } from "../services/listings.js";

function fmtMin(m: number) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function availabilitySummary(availability: { dayOfWeek: number; startMinute: number; endMinute: number }[]) {
  if (!availability?.length) return "Open 24/7";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return availability
    .map((r) => `${days[r.dayOfWeek]} ${fmtMin(r.startMinute)}–${fmtMin(r.endMinute === 1440 ? 0 : r.endMinute)}`)
    .join(" · ");
}

async function ownedSpace(spaceId: string, hostId: string, isAdmin = false) {
  if (!mongoose.isValidObjectId(spaceId)) throw new ApiError(404, "Listing not found.");
  const space = await ParkingSpace.findById(spaceId);
  if (!space) throw new ApiError(404, "Listing not found.");
  if (String(space.hostId) !== hostId && !isAdmin) throw new ApiError(403, "Not your listing.");
  return space;
}

function listingDataFromInput(input: ListingInput) {
  return {
    title: input.title,
    description: input.description,
    propertyType: input.propertyType,
    spaceType: input.spaceType,
    covered: input.covered,
    level: input.level,
    vehicleTypes: input.vehicleTypes.join(","),
    evCharging: input.evCharging,
    cctv: input.cctv,
    securityGuard: input.securityGuard,
    gated: input.gated,
    lengthFt: input.lengthFt ?? undefined,
    widthFt: input.widthFt ?? undefined,
    heightFt: input.heightFt ?? undefined,
    address: input.address,
    formattedAddress: input.formattedAddress || input.address,
    locality: input.locality || input.city,
    sublocality: input.sublocality || "",
    area: input.area,
    city: input.city,
    district: input.district || "",
    state: input.state ?? "",
    pincode: input.pincode || input.postalCode || "",
    postalCode: input.postalCode || input.pincode || "",
    placeId: input.placeId ?? "",
    location: { type: "Point" as const, coordinates: [input.longitude, input.latitude] },
    accessInstructions: input.accessInstructions,
    vehicleSizeNotes: input.vehicleSizeNotes,
    overnightAllowed: input.overnightAllowed,
    selfParkingConfirmed: input.selfParkingConfirmed,
    rules: input.rules,
    blockedDates: input.blockedDates,
    pricePerHour: input.pricePerHour,
    minDurationMins: input.minDurationMins,
    maxDurationMins: input.maxDurationMins,
    images: input.images.map((img, i) => ({
      url: img.url,
      alt: img.alt,
      sortOrder: i,
      publicId: img.publicId || "",
    })),
    availability: input.availability,
  };
}

export async function overview(req: AuthedRequest, res: Response) {
  await progressBookingStatuses(undefined, req.userId);
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const hostOid = new mongoose.Types.ObjectId(req.userId);

  const [todays, upcoming, monthAgg, listings] = await Promise.all([
    Booking.find({ hostId: req.userId, status: { $in: ["CONFIRMED", "ACTIVE"] }, start: { $lt: dayEnd }, end: { $gt: dayStart } })
      .sort({ start: 1 }).populate("spaceId", "title area").populate("userId", "name"),
    Booking.find({ hostId: req.userId, status: "CONFIRMED", start: { $gt: now } })
      .sort({ start: 1 }).limit(5).populate("spaceId", "title area").populate("userId", "name"),
    Booking.aggregate([
      { $match: { hostId: hostOid, status: { $in: ["CONFIRMED", "ACTIVE", "COMPLETED"] }, start: { $gte: monthStart } } },
      { $group: { _id: null, earning: { $sum: "$hostEarning" }, minutes: { $sum: "$durationMins" }, count: { $sum: 1 } } },
    ]),
    ParkingSpace.find({ hostId: req.userId }).select("title area status pricePerHour images ratingAvg ratingCount"),
  ]);

  const active = listings.filter((l) => l.status === "VERIFIED" || l.status === "ACTIVE").length;
  const pending = listings.filter((l) => l.status === "PENDING_REVIEW").length;
  const daysInMonth = now.getDate();
  const occupancyPct = active > 0
    ? Math.min(100, Math.round(((monthAgg[0]?.minutes ?? 0) / (active * daysInMonth * 1440)) * 100))
    : 0;

  res.json({
    success: true,
    data: {
      todays, upcoming,
      monthEarning: monthAgg[0]?.earning ?? 0,
      monthBookings: monthAgg[0]?.count ?? 0,
      occupancyPct,
      listings: listings.map((l) => l.toJSON()),
      activeListings: active,
      pendingListings: pending,
    },
  });
}

export async function listListings(req: AuthedRequest, res: Response) {
  const listings = await ParkingSpace.find({ hostId: req.userId }).sort({ updatedAt: -1 });
  const counts = await Booking.aggregate([
    { $match: { hostId: new mongoose.Types.ObjectId(req.userId), status: { $in: ["CONFIRMED", "ACTIVE"] } } },
    { $group: { _id: "$spaceId", count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({
    success: true,
    data: {
      listings: listings.map((l) => ({
        ...l.toJSON(),
        upcomingBookings: byId.get(String(l._id)) ?? 0,
        availabilitySummary: availabilitySummary(l.availability as never),
      })),
    },
  });
}

export async function getListing(req: AuthedRequest, res: Response) {
  const space = await ownedSpace(req.params.id, req.userId, req.userRole === "ADMIN");
  res.json({ success: true, data: { listing: space.toJSON() } });
}

export async function createListing(req: AuthedRequest, res: Response) {
  const input = req.body as ListingInput;
  const published = !!input.publish;
  const payload = listingDataFromInput(input);
  const { status, verified } = listingCreateState(published, env.NODE_ENV);
  let space: InstanceType<typeof ParkingSpace> | undefined;
  await persistListingImages([], payload.images, async () => {
    space = await ParkingSpace.create({
      ...payload,
      hostId: req.userId,
      status,
      verified,
    });
  });
  res.status(201).json({ success: true, data: { listing: space!.toJSON() } });
}

export async function updateListing(req: AuthedRequest, res: Response) {
  const space = await ownedSpace(req.params.id, req.userId);
  const input = req.body as ListingInput;
  const previous = (space.images ?? []).map((img) => ({
    url: img.url,
    publicId: img.publicId || undefined,
  }));
  Object.assign(space, listingDataFromInput(input));
  if (input.publish && ["DRAFT", "REJECTED", "PENDING_REVIEW"].includes(space.status)) {
    Object.assign(space, statusOnPublish(env.NODE_ENV));
  }
  await persistListingImages(previous, space.images as { url: string; publicId?: string }[], async () => {
    await space.save();
  });
  res.json({ success: true, data: { listing: space.toJSON() } });
}

export async function setListingStatus(req: AuthedRequest, res: Response) {
  const space = await ownedSpace(req.params.id, req.userId);
  const action = (req.body as { action: string }).action;
  if (action === "pause" && ["ACTIVE", "VERIFIED"].includes(space.status)) space.status = "PAUSED";
  else if (action === "activate" && space.status === "PAUSED") {
    if (space.verified || env.NODE_ENV !== "production") Object.assign(space, statusOnPublish("development"));
    else Object.assign(space, statusOnPublish("production"));
  }
  else if (action === "submit" && ["DRAFT", "REJECTED"].includes(space.status)) {
    Object.assign(space, statusOnPublish(env.NODE_ENV));
  }
  else if (action === "delete") {
    const hasUpcoming = await Booking.exists({
      spaceId: space._id, status: { $in: ["CONFIRMED", "ACTIVE"] }, end: { $gt: new Date() },
    });
    if (hasUpcoming) throw new ApiError(409, "This listing has upcoming bookings and can't be deleted.");
    await space.deleteOne();
    res.json({ success: true, data: { deleted: true } });
    return;
  } else throw new ApiError(400, "Invalid action for the current status.");
  await space.save();
  res.json({ success: true, data: { listing: space.toJSON() } });
}

/** Month view: bookings + blocked slots for one space. */
export async function calendar(req: AuthedRequest, res: Response) {
  const allSpaces = await ParkingSpace.find({ hostId: req.userId, status: { $in: ["VERIFIED", "ACTIVE", "PAUSED"] } })
    .sort({ createdAt: 1 }).select("title status");
  const requested = String(req.query.spaceId ?? "");
  const space = allSpaces.find((s) => String(s._id) === requested) ?? allSpaces[0];
  if (!space) {
    res.json({ success: true, data: { bookings: [], blocked: [], spaces: [], spaceId: null } });
    return;
  }
  const year = Number(req.query.year ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth()); // 0-based
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 1);
  const [bookings, blocked] = await Promise.all([
    Booking.find({
      spaceId: space._id, status: { $in: ["CONFIRMED", "ACTIVE", "COMPLETED"] },
      start: { $lt: to }, end: { $gt: from },
    }).sort({ start: 1 }).populate("userId", "name"),
    BlockedSlot.find({ spaceId: space._id, start: { $lt: to }, end: { $gt: from } }).sort({ start: 1 }),
  ]);
  res.json({
    success: true,
    data: {
      bookings, blocked,
      spaces: allSpaces.map((s) => s.toJSON()),
      spaceId: String(space._id),
    },
  });
}

export async function blockSlot(req: AuthedRequest, res: Response) {
  const { spaceId, start, end, reason } = req.body as { spaceId: string; start: Date; end: Date; reason: string };
  const space = await ownedSpace(spaceId, req.userId);
  if (await hasConflict(spaceId, start, end))
    throw new ApiError(409, "There's already a booking in this period. You can't block it.");
  const slot = await BlockedSlot.create({ spaceId: space._id, start, end, reason });
  res.status(201).json({ success: true, data: { slot } });
}

export async function unblockSlot(req: AuthedRequest, res: Response) {
  const slot = await BlockedSlot.findById(req.params.id);
  if (!slot) throw new ApiError(404, "Block not found.");
  await ownedSpace(String(slot.spaceId), req.userId);
  await slot.deleteOne();
  res.json({ success: true, data: {} });
}

export async function listBookings(req: AuthedRequest, res: Response) {
  await expireStalePendingBookings();
  await progressBookingStatuses(undefined, req.userId);
  const status = typeof req.query.status === "string" && req.query.status !== "ALL" ? req.query.status : undefined;
  const bookings = await Booking.find({ hostId: req.userId, ...(status ? { status } : {}) })
    .sort({ start: -1 }).limit(100)
    .populate("spaceId", "title area").populate("userId", "name");
  res.json({
    success: true,
    data: { bookings: bookings.map((b) => redactBooking(b.toJSON() as Record<string, unknown>)) },
  });
}

export async function earnings(req: AuthedRequest, res: Response) {
  await progressBookingStatuses(undefined, req.userId);
  const data = await summarizeHostEarnings(req.userId);
  res.json({
    success: true,
    data: {
      ...data,
      total: data.calculatedCompleted,
      pending: data.upcomingEarnings,
      pendingCount: data.upcomingCount,
      thisMonth: data.thisMonthCalculated,
    },
  });
}

export async function listReviews(req: AuthedRequest, res: Response) {
  const spaces = await ParkingSpace.find({ hostId: req.userId }).select("_id title");
  const reviews = await Review.find({ spaceId: { $in: spaces.map((s) => s._id) } })
    .sort({ createdAt: -1 }).limit(50).populate("userId", "name image").populate("spaceId", "title");
  res.json({ success: true, data: { reviews } });
}
