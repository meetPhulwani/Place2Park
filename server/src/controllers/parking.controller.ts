import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Booking, Favorite, ParkingSpace, Review, User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { searchSpaces } from "../services/search.js";
import { KNOWN_AREAS } from "../utils/geo.js";
import { getDisplayLocation, locationTextClauses } from "../utils/location.js";
import {
  AVAILABILITY_ERROR_MESSAGES,
  checkAvailability,
  progressSpaceBookings,
} from "../services/availability.js";
import { computeQuote } from "../utils/pricing.js";
import { ALLOWED_DURATIONS_MINS, isBookableStatus } from "../utils/constants.js";
import { boundedText, publicSearchInput } from "../utils/request-input.js";

export async function search(req: Request, res: Response) {
  const input = publicSearchInput(req.query as Record<string, unknown>);
  let { lat, lng } = input;
  let resolvedArea: string | null = null;
  // Coordinates from the client are the search center. A name-only request
  // can fall back to coordinates already stored on matching listings.
  if ((lat == null || lng == null) && input.q) {
    const clauses = locationTextClauses(input.q);
    if (clauses.length) {
      const named = await ParkingSpace.find({
        status: { $in: ["VERIFIED", "ACTIVE"] },
        $or: clauses,
      })
        .select("location")
        .limit(25);
      const coords = named
        .map((s) => s.location?.coordinates as [number, number] | undefined)
        .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2);
      if (coords.length) {
        lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        resolvedArea = input.q;
      }
    }
  } else if (input.q) {
    resolvedArea = input.q;
  }
  const results = await searchSpaces({ ...input, lat, lng });
  res.json({ success: true, data: { results, resolvedArea, center: lat != null && lng != null ? { lat, lng } : null } });
}

export function knownAreas(_req: Request, res: Response) {
  res.json({ success: true, data: { areas: KNOWN_AREAS } });
}

/**
 * Distinct areas that already have public Place2Park listings.
 * Location autocomplete itself comes from Google Places in the browser.
 * Never includes street address or access notes.
 */
export async function suggestPlaces(req: Request, res: Response) {
  const q = boundedText(req.query.q, 120);
  if (q.length < 2) {
    res.json({ success: true, data: { predictions: [] } });
    return;
  }

  const clauses = locationTextClauses(q).filter((clause) => !("formattedAddress" in clause));
  const listingGroups = clauses.length
    ? await ParkingSpace.aggregate<{
        _id: { locality?: string; sublocality?: string; area?: string; city?: string; district?: string; state?: string };
        lng: number;
        lat: number;
      }>([
        { $match: { status: { $in: ["VERIFIED", "ACTIVE"] }, $or: clauses } },
        {
          $group: {
            _id: {
              locality: "$locality",
              sublocality: "$sublocality",
              area: "$area",
              city: "$city",
              district: "$district",
              state: "$state",
            },
            lng: { $avg: { $arrayElemAt: ["$location.coordinates", 0] } },
            lat: { $avg: { $arrayElemAt: ["$location.coordinates", 1] } },
          },
        },
        { $limit: 8 },
      ])
    : [];

  const seen = new Set<string>();
  const fromListings = listingGroups.flatMap((row) => {
    const mainText = getDisplayLocation(row._id).split(",")[0]?.trim() || "";
    const secondaryText = [row._id.city, row._id.district, row._id.state]
      .filter((v): v is string => !!v && v.toLowerCase() !== mainText.toLowerCase())
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 2)
      .join(", ");
    if (!mainText || seen.has(mainText.toLowerCase())) return [];
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return [];
    seen.add(mainText.toLowerCase());
    return [
      {
        id: `listing:${mainText}:${row.lat.toFixed(4)}:${row.lng.toFixed(4)}`,
        mainText,
        secondaryText,
        lat: row.lat,
        lng: row.lng,
        source: "listing" as const,
      },
    ];
  });

  res.json({ success: true, data: { predictions: fromListings.slice(0, 8) } });
}

/** Public landing-page stats. */
export async function stats(_req: Request, res: Response) {
  const agg = await ParkingSpace.aggregate([
    { $match: { status: { $in: ["VERIFIED", "ACTIVE"] } } },
    { $group: { _id: null, count: { $sum: 1 }, avgPrice: { $avg: "$pricePerHour" } } },
  ]);
  res.json({
    success: true,
    data: { count: agg[0]?.count ?? 0, avgPricePerHour: Math.round(agg[0]?.avgPrice ?? 5000) },
  });
}

export async function detail(req: Request, res: Response) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Listing not found.");
  const space = await ParkingSpace.findById(req.params.id);
  if (!space) throw new ApiError(404, "Listing not found.");

  const userId = (req as AuthedRequest).userId as string | undefined;
  const isOwner = userId != null && String(space.hostId) === userId;
  const isAdmin = (req as AuthedRequest).userRole === "ADMIN";
  // Paused, hidden, and draft listings stay visible only to the owner or an admin.
  if (!["VERIFIED", "ACTIVE"].includes(space.status) && !isOwner && !isAdmin)
    throw new ApiError(404, "Listing not found.");

  const spaceId = String(space._id);
  await progressSpaceBookings(spaceId);

  const [host, reviews, favorite, hasConfirmedBooking] = await Promise.all([
    User.findById(space.hostId).select("name image hostVerified createdAt"),
    Review.find({ spaceId: space._id }).sort({ createdAt: -1 }).limit(20).populate("userId", "name image"),
    userId ? Favorite.exists({ userId, spaceId: space._id }) : null,
    userId
      ? Booking.exists({
          spaceId: space._id,
          userId,
          status: { $in: ["CONFIRMED", "ACTIVE", "COMPLETED"] },
        })
      : null,
  ]);

  const revealExactLocation = isOwner || isAdmin || !!hasConfirmedBooking;
  const spaceJson = space.toJSON() as Record<string, unknown>;
  if (!revealExactLocation) {
    spaceJson.address = "";
    spaceJson.formattedAddress = "";
    spaceJson.accessInstructions = "";
    spaceJson.pincode = "";
    spaceJson.postalCode = "";
    spaceJson.placeId = "";
  }

  res.json({
    success: true,
    data: {
      space: spaceJson,
      host: host?.toJSON() ?? null,
      reviews: reviews.map((r) => {
        const u = r.userId as unknown as { name?: string; image?: string } | null;
        return { ...r.toJSON(), user: { name: u?.name ?? "Driver", image: u?.image ?? null } };
      }),
      isOwner,
      isFavorite: !!favorite,
      revealExactLocation,
    },
  });
}

/** Server-authoritative availability + price quote. Frontend estimates are display-only. */
export async function quote(req: Request, res: Response) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, "Listing not found.");
  const startRaw = req.query.start;
  const durationMins = Number(req.query.durationMins);
  if (typeof startRaw !== "string" || !startRaw) throw new ApiError(400, "Start time is required.");
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, "Invalid start time.");
  if (!Number.isInteger(durationMins) || !(ALLOWED_DURATIONS_MINS as readonly number[]).includes(durationMins))
    throw new ApiError(400, "Choose a valid duration.");

  const space = await ParkingSpace.findById(req.params.id).select(
    "status pricePerHour minDurationMins maxDurationMins availability overnightAllowed blockedDates"
  );
  if (!space) throw new ApiError(404, "Listing not found.");
  if (!isBookableStatus(space.status)) throw new ApiError(404, "Listing not found.");

  const end = new Date(start.getTime() + durationMins * 60000);
  const spaceId = String(space._id);
  await progressSpaceBookings(spaceId);
  const check = await checkAvailability(spaceId, start, end);
  const q = computeQuote(space.pricePerHour, durationMins);
  res.json({
    success: true,
    data: {
      available: check.ok,
      error: check.error ?? null,
      message: check.ok ? null : AVAILABILITY_ERROR_MESSAGES[check.error!],
      quote: {
        parkingFee: q.baseAmount,
        platformFee: q.serviceFee,
        total: q.totalAmount,
        durationMins: q.durationMins,
        baseAmount: q.baseAmount,
        serviceFee: q.serviceFee,
        totalAmount: q.totalAmount,
      },
    },
  });
}
