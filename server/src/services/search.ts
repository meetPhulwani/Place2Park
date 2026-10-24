import { Booking, BlockedSlot, ParkingSpace } from "../models/index.js";
import { haversineKm } from "../utils/geo.js";
import { getDisplayLocation, locationTextClauses } from "../utils/location.js";
import { coversWindow, expireStalePendingBookings, occupyingOverlapFilter } from "./availability.js";
import { reconcileExpiredPaymentHolds } from "./payments.js";
import { isProd } from "../config/env.js";

export interface SpaceSummary {
  id: string;
  title: string;
  area: string;
  city: string;
  locality: string;
  sublocality: string;
  district: string;
  displayLocation: string;
  latitude: number;
  longitude: number;
  pricePerHour: number; // paise
  ratingAvg: number;
  ratingCount: number;
  covered: boolean;
  evCharging: boolean;
  cctv: boolean;
  verified: boolean;
  vehicleTypes: string;
  level: string;
  propertyType: string;
  imageUrl: string | null;
  distanceKm: number | null;
  available: boolean | null; // null = no window requested
}

export function spaceToSummary(
  s: InstanceType<typeof ParkingSpace>,
  extras?: { distanceKm?: number | null; available?: boolean | null }
): SpaceSummary {
  const [lng, lat] = (s.location?.coordinates ?? [0, 0]) as [number, number];
  return {
    id: String(s._id),
    title: s.title,
    area: s.area,
    city: s.city,
    locality: s.locality ?? "",
    sublocality: s.sublocality ?? "",
    district: s.district ?? "",
    displayLocation: getDisplayLocation(s),
    latitude: lat,
    longitude: lng,
    pricePerHour: s.pricePerHour,
    ratingAvg: s.ratingAvg,
    ratingCount: s.ratingCount,
    covered: s.covered,
    evCharging: s.evCharging,
    cctv: s.cctv,
    verified: s.verified,
    vehicleTypes: s.vehicleTypes,
    level: s.level,
    propertyType: s.propertyType,
    imageUrl: s.images[0]?.url ?? null,
    distanceKm: extras?.distanceKm ?? null,
    available: extras?.available ?? null,
  };
}

export interface SearchQuery {
  q?: string;
  lat?: number;
  lng?: number;
  start?: Date;
  durationMins?: number;
  maxPriceRupees?: number;
  maxDistanceKm?: number;
  covered?: boolean;
  ev?: boolean;
  vehicleType?: "CAR" | "BIKE";
  minRating?: number;
  sort?: "closest" | "cheapest" | "rating";
}

const EARTH_RADIUS_KM = 6371;

function geoWithin(lng: number, lat: number, radiusKm: number) {
  return {
    $geoWithin: {
      $centerSphere: [[lng, lat], radiusKm / EARTH_RADIUS_KM],
    },
  };
}

export async function searchSpaces(q: SearchQuery): Promise<SpaceSummary[]> {
  await reconcileExpiredPaymentHolds({}, await expireStalePendingBookings());

  const lat = q.lat != null && Number.isFinite(q.lat) ? q.lat : undefined;
  const lng = q.lng != null && Number.isFinite(q.lng) ? q.lng : undefined;
  const radiusKm = q.maxDistanceKm && q.maxDistanceKm > 0 ? q.maxDistanceKm : 8;
  const textQuery = q.q?.trim() ?? "";
  const textClauses = locationTextClauses(textQuery);
  const hasGeo = lat != null && lng != null;

  const base: Record<string, unknown> = {
    status: { $in: ["VERIFIED", "ACTIVE"] },
    ...(q.maxPriceRupees ? { pricePerHour: { $lte: q.maxPriceRupees * 100 } } : {}),
    ...(q.covered ? { covered: true } : {}),
    ...(q.ev ? { evCharging: true } : {}),
    ...(q.vehicleType ? { vehicleTypes: { $regex: q.vehicleType } } : {}),
    ...(q.minRating ? { ratingAvg: { $gte: q.minRating } } : {}),
  };

  // Geospatial search is primary whenever a center exists.
  // Text match is only a fallback when no coordinates could be resolved.
  const filter: Record<string, unknown> = { ...base };
  if (hasGeo) {
    filter.location = geoWithin(lng, lat, radiusKm);
  } else if (textClauses.length) {
    filter.$or = textClauses;
  }

  let spaces = await ParkingSpace.find(filter).limit(100);

  // Text-only: also include nearby listings around the matched cluster
  // (e.g. "Kalyan" should pick up adjoining localities that omit the name).
  if (!hasGeo && textClauses.length && spaces.length > 0) {
    const found = new Set(spaces.map((s) => String(s._id)));
    const coords = spaces
      .map((s) => s.location?.coordinates as [number, number] | undefined)
      .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2);
    if (coords.length) {
      const avgLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
      const avgLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
      const nearby = await ParkingSpace.find({
        ...base,
        _id: { $nin: spaces.map((s) => s._id) },
        location: geoWithin(avgLng, avgLat, radiusKm),
      }).limit(50);
      for (const s of nearby) {
        if (!found.has(String(s._id))) {
          found.add(String(s._id));
          spaces.push(s);
        }
      }
    }
  }

  // Availability flags for the requested window — do not drop rows; UI shows availability.
  let unavailableIds = new Set<string>();
  let end: Date | null = null;
  if (q.start && q.durationMins) {
    end = new Date(q.start.getTime() + q.durationMins * 60000);
    const ids = spaces.map((s) => s._id);
    const now = new Date();
    const [conflicts, blocked] = await Promise.all([
      Booking.find({
        spaceId: { $in: ids },
        start: { $lt: end },
        end: { $gt: q.start },
        ...occupyingOverlapFilter(now),
      }).select("spaceId"),
      BlockedSlot.find({ spaceId: { $in: ids }, start: { $lt: end }, end: { $gt: q.start } }).select("spaceId"),
    ]);
    unavailableIds = new Set([...conflicts, ...blocked].map((c) => String(c.spaceId)));
  }

  const results = spaces.map((s) => {
    const [sLng, sLat] = (s.location?.coordinates ?? [0, 0]) as [number, number];
    const distanceKm = lat != null && lng != null ? haversineKm(lat, lng, sLat, sLng) : null;
    let available: boolean | null = null;
    if (q.start && end) {
      available = !unavailableIds.has(String(s._id)) && coversWindow(s.availability, q.start, end);
    }
    return spaceToSummary(s, { distanceKm, available });
  });

  const sort = q.sort ?? "closest";
  results.sort((a, b) => {
    if (sort === "cheapest") return a.pricePerHour - b.pricePerHour;
    if (sort === "rating") return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
    if (a.distanceKm == null || b.distanceKm == null) return a.pricePerHour - b.pricePerHour;
    return a.distanceKm - b.distanceKm;
  });

  if (!isProd) {
    console.info(
      `[search] q="${textQuery || "—"}" center=${lat ?? "—"},${lng ?? "—"} radiusKm=${radiusKm} matches=${results.length}` +
        (results[0] ? ` nearest=${results[0].displayLocation} ${results[0].distanceKm?.toFixed(2) ?? "—"}km` : "")
    );
  }

  return results;
}
