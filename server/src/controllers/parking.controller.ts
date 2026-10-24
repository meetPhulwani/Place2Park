import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Booking, Favorite, ParkingSpace, Review, User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { searchSpaces } from "../services/search.js";
import { geocodeKnownArea, KNOWN_AREAS } from "../utils/geo.js";
import { getDisplayLocation, locationTextClauses } from "../utils/location.js";
import {
  AVAILABILITY_ERROR_MESSAGES,
  checkAvailability,
  expireStalePendingBookings,
  progressSpaceBookings,
} from "../services/availability.js";
import { reconcileExpiredPaymentHolds } from "../services/payments.js";
import { computeQuote } from "../utils/pricing.js";
import { ALLOWED_DURATIONS_MINS } from "../utils/constants.js";

function finiteNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export async function search(req: Request, res: Response) {
  const q = req.query;
  let lat = finiteNumber(q.lat, q.latitude);
  let lng = finiteNumber(q.lng, q.longitude);
  if (lat != null && (lat < -90 || lat > 90)) lat = undefined;
  if (lng != null && (lng < -180 || lng > 180)) lng = undefined;
  let resolvedArea: string | null = null;
  // Resolve a search center so geospatial $geoWithin is the primary query.
  // KNOWN_AREAS is the demo fallback (e.g. Juhu). If that misses, use coordinates
  // already stored on matching listings — not a hardcoded place list.
  if ((lat == null || lng == null) && typeof q.q === "string" && q.q) {
    const area = geocodeKnownArea(q.q);
    if (area) {
      lat = area.lat;
      lng = area.lng;
      resolvedArea = area.name;
    } else {
      const clauses = locationTextClauses(q.q);
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
          resolvedArea = q.q;
        }
      }
    }
  } else if (typeof q.q === "string" && q.q) {
    resolvedArea = geocodeKnownArea(q.q)?.name ?? q.q;
  }
  const results = await searchSpaces({
    q: typeof q.q === "string" ? q.q : undefined,
    lat,
    lng,
    start: typeof q.start === "string" && q.start ? new Date(q.start) : undefined,
    durationMins: q.durationMins ? Number(q.durationMins) : undefined,
    maxPriceRupees: q.maxPrice ? Number(q.maxPrice) : undefined,
    maxDistanceKm: finiteNumber(q.maxDistanceKm, q.radius, q.radiusKm),
    covered: q.covered === "true" || q.covered === "1",
    ev: q.ev === "true" || q.ev === "1",
    vehicleType: q.vehicleType === "CAR" || q.vehicleType === "BIKE" ? q.vehicleType : undefined,
    minRating: q.minRating ? Number(q.minRating) : undefined,
    sort: q.sort === "cheapest" || q.sort === "rating" ? q.sort : "closest",
  });
  res.json({ success: true, data: { results, resolvedArea, center: lat != null && lng != null ? { lat, lng } : null } });
}

export function knownAreas(_req: Request, res: Response) {
  res.json({ success: true, data: { areas: KNOWN_AREAS } });
}

/**
 * Public place suggestions for driver/host autocomplete.
 * Returns catalog localities plus distinct public-listing areas.
 * Never includes street address, access notes, or coordinates as labels.
 */
export async function suggestPlaces(req: Request, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    res.json({ success: true, data: { predictions: [] } });
    return;
  }
  const needle = q.toLowerCase();
  const catalog = KNOWN_AREAS.filter((a) => a.name.toLowerCase().includes(needle)).slice(0, 8).map((a) => ({
    id: `catalog:${a.name}`,
    mainText: a.name,
    secondaryText: secondaryForArea(a.name),
    lat: a.lat,
    lng: a.lng,
    source: "catalog" as const,
  }));

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

  const seen = new Set(catalog.map((p) => p.mainText.toLowerCase()));
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

  res.json({ success: true, data: { predictions: [...catalog, ...fromListings].slice(0, 8) } });
}

function secondaryForArea(name: string) {
  if (/shahad/i.test(name)) return "Kalyan, Maharashtra";
  if (/kalyan/i.test(name)) return "Thane, Maharashtra";
  if (/thane|vashi|nerul/i.test(name)) return "Navi Mumbai / Thane, Maharashtra";
  if (/phoenix|kurla/i.test(name)) return "Kurla, Mumbai";
  return "Mumbai, Maharashtra";
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
  // Hidden/draft listings are only visible to their owner or admins.
  if (!["VERIFIED", "ACTIVE", "PAUSED"].includes(space.status) && !isOwner && !isAdmin)
    throw new ApiError(404, "Listing not found.");

  const spaceId = String(space._id);
  await reconcileExpiredPaymentHolds({}, await expireStalePendingBookings(spaceId));
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
  if (typeof startRaw !== "string" || !startRaw) throw new ApiError(422, "Start time is required.");
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) throw new ApiError(422, "Invalid start time.");
  if (!Number.isInteger(durationMins) || !(ALLOWED_DURATIONS_MINS as readonly number[]).includes(durationMins))
    throw new ApiError(422, "Choose a valid duration.");

  const space = await ParkingSpace.findById(req.params.id).select(
    "status pricePerHour minDurationMins maxDurationMins availability overnightAllowed blockedDates"
  );
  if (!space) throw new ApiError(404, "Listing not found.");

  const end = new Date(start.getTime() + durationMins * 60000);
  const spaceId = String(space._id);
  await reconcileExpiredPaymentHolds({}, await expireStalePendingBookings(spaceId));
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
