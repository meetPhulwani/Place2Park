import { ParkingSpace, User } from "../models/index.js";
import { inferredLocationFields } from "./location.js";
import { haversineKm } from "./geo.js";
import { isProd } from "../config/env.js";

/** Populate locality/city/district on existing listings that only have area + city. */
export async function backfillParkingLocations() {
  const spaces = await ParkingSpace.find({
    $or: [{ locality: { $in: [null, ""] } }, { formattedAddress: { $in: [null, ""] } }],
  }).select("address area city state pincode postalCode locality sublocality district formattedAddress");

  let updated = 0;
  for (const s of spaces) {
    const next = inferredLocationFields(s);
    s.formattedAddress = next.formattedAddress;
    s.locality = next.locality;
    s.sublocality = next.sublocality;
    s.district = next.district;
    s.postalCode = next.postalCode || s.pincode || "";
    if (!s.pincode && next.postalCode) s.pincode = next.postalCode;
    await s.save();
    updated += 1;
  }
  if (updated) console.info(`[location] backfilled ${updated} listing location field(s)`);
}

/** Listings pinned while Geocoding was denied stored city=Unknown. Copy names from the nearest named neighbor. */
export async function repairUnknownLocations() {
  const unknown = await ParkingSpace.find({
    $or: [{ city: { $in: ["Unknown", "unknown", ""] } }, { locality: { $in: ["Unknown", "unknown"] } }],
  });
  if (!unknown.length) return;
  const named = await ParkingSpace.find({
    city: { $nin: ["Unknown", "unknown", "", null] },
    locality: { $nin: ["Unknown", "unknown", "", null] },
  }).select("location locality sublocality area city district state postalCode pincode formattedAddress");
  let updated = 0;
  for (const u of unknown) {
    const [lng, lat] = (u.location?.coordinates ?? []) as number[];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    let best: (typeof named)[number] | null = null;
    let bestKm = 5;
    for (const n of named) {
      const [nLng, nLat] = (n.location?.coordinates ?? []) as number[];
      if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) continue;
      const km = haversineKm(lat, lng, nLat, nLng);
      if (km < bestKm) {
        bestKm = km;
        best = n;
      }
    }
    if (!best) continue;
    u.locality = best.locality;
    u.sublocality = best.sublocality || "";
    u.area = best.area;
    u.city = best.city;
    u.district = best.district || "";
    u.state = best.state || u.state;
    u.postalCode = best.postalCode || u.postalCode || "";
    if (!u.formattedAddress || u.formattedAddress.startsWith("Pinned")) {
      u.formattedAddress = [u.address, u.area, u.city, u.state].filter(Boolean).join(", ");
    }
    await u.save();
    updated += 1;
  }
  if (updated) console.info(`[location] repaired ${updated} Unknown listing(s) from nearby named spaces`);
}

const REGIONAL_DEMOS: {
  title: string;
  hostEmail: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  locality: string;
  sublocality: string;
  city: string;
  district: string;
  postalCode: string;
  price: number;
  n: number;
  desc: string;
}[] = [
  {
    title: "Covered society parking, Shahad",
    hostEmail: "rohan@parkly.dev",
    area: "Shahad",
    address: "Green Park CHS, Station Road, Shahad",
    lat: 19.2472,
    lng: 73.1586,
    locality: "Shahad",
    sublocality: "",
    city: "Kalyan",
    district: "Thane",
    postalCode: "421103",
    price: 35,
    n: 1,
    desc: "Covered society slot a short walk from Shahad station, handy for Kalyan and Ulhasnagar.",
  },
  {
    title: "Gated compound parking, Kalyan West",
    hostEmail: "host@parkly.dev",
    area: "Kalyan",
    address: "Sai Residency, Shivaji Chowk, Kalyan West",
    lat: 19.2403,
    lng: 73.1305,
    locality: "Kalyan",
    sublocality: "Kalyan West",
    city: "Kalyan",
    district: "Thane",
    postalCode: "421301",
    price: 40,
    n: 2,
    desc: "Gated compound parking near Kalyan station and the Shivaji Chowk market.",
  },
  {
    title: "Basement slot near Thane station",
    hostEmail: "meera@parkly.dev",
    area: "Thane",
    address: "Naupada Heights, Gokhale Road, Thane West",
    lat: 19.1868,
    lng: 72.975,
    locality: "Thane",
    sublocality: "Thane West",
    city: "Thane",
    district: "Thane",
    postalCode: "400602",
    price: 50,
    n: 3,
    desc: "Basement slot in a residential building near Thane station, self-parking only.",
  },
  {
    title: "Society parking, Vashi sector 17",
    hostEmail: "rohan@parkly.dev",
    area: "Vashi",
    address: "Palm Beach Residency, Sector 17, Vashi",
    lat: 19.0771,
    lng: 72.9986,
    locality: "Vashi",
    sublocality: "Vashi",
    city: "Navi Mumbai",
    district: "Thane",
    postalCode: "400703",
    price: 45,
    n: 4,
    desc: "Open society slot in Vashi, convenient for Navi Mumbai and the Palm Beach Road corridor.",
  },
];

/**
 * On a persistent demo DB, add regional listings so location search can be exercised
 * without wiping existing spaces. Idempotent by title + isDemo.
 */
export async function ensureDemoRegionalSpaces() {
  if (isProd) return;
  let added = 0;
  let patched = 0;
  for (const s of REGIONAL_DEMOS) {
    const locFields = {
      formattedAddress: `${s.address}, ${s.area}, ${s.city}, Maharashtra ${s.postalCode}`,
      locality: s.locality,
      sublocality: s.sublocality,
      area: s.area,
      city: s.city,
      district: s.district,
      state: "Maharashtra",
      pincode: s.postalCode,
      postalCode: s.postalCode,
    };
    const existing = await ParkingSpace.findOne({ title: s.title, isDemo: true });
    if (existing) {
      Object.assign(existing, locFields);
      await existing.save();
      patched += 1;
      continue;
    }
    const host = await User.findOne({ email: s.hostEmail }).select("_id");
    if (!host) continue;
    await ParkingSpace.create({
      hostId: host._id,
      title: s.title,
      description: s.desc,
      propertyType: "RESIDENTIAL_SOCIETY",
      spaceType: "PRIVATE",
      covered: true,
      level: "GROUND",
      vehicleTypes: "CAR,BIKE",
      evCharging: false,
      cctv: true,
      securityGuard: true,
      gated: true,
      address: s.address,
      ...locFields,
      location: { type: "Point", coordinates: [s.lng, s.lat] },
      accessInstructions:
        "Show your Parkly access code at the gate. Park only in the marked slot. Self-parking only — never hand over your keys.",
      rules: ["Self-parking only — never hand over your keys", "No commercial vehicles", "Keep access lanes clear"],
      pricePerHour: s.price * 100,
      minDurationMins: 60,
      maxDurationMins: 1440,
      status: "VERIFIED",
      overnightAllowed: false,
      selfParkingConfirmed: true,
      verified: true,
      isDemo: true,
      images: [
        { url: `/demo/p${s.n}.svg`, alt: s.title, sortOrder: 0 },
        { url: `/demo/p${((s.n + 2) % 8) + 1}.svg`, alt: `${s.title} — angle 2`, sortOrder: 1 },
      ],
      availability: [],
    });
    added += 1;
  }
  if (added || patched) console.info(`[location] regional demos added=${added} patched=${patched}`);
}
