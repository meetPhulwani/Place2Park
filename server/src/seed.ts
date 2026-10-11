/**
 * Parkly development seed — DEMO DATA ONLY.
 * Locations are Mumbai-inspired but fictional; all records are marked isDemo.
 * Run: npm run seed   (auto-runs when the in-memory dev DB is used)
 */
import bcrypt from "bcryptjs";
import {
  BlockedSlot, Booking, Favorite, HostPayout, Notification, ParkingSpace, Payment, Report, Review, User, Vehicle,
} from "./models/index.js";

const PASSWORD = "password123";
const paise = (rupees: number) => rupees * 100;
const code = (i: number) => `PK-DEMO${String(i).padStart(2, "0")}`;

function quote(pricePerHour: number, mins: number) {
  const baseAmount = Math.round((pricePerHour * mins) / 60);
  const serviceFee = Math.round(baseAmount * 0.05);
  const platformFee = Math.round(baseAmount * 0.15);
  return { baseAmount, serviceFee, totalAmount: baseAmount + serviceFee, platformFee, hostEarning: baseAmount - platformFee };
}
function at(daysFromNow: number, hour: number, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, min, 0, 0);
  return d;
}

function demoPlace(s: {
  address: string;
  area: string;
  locality?: string;
  sublocality?: string;
  cityName?: string;
  district?: string;
  pincode?: string;
}) {
  const city = s.cityName || "Mumbai";
  const pin = s.pincode || "400050";
  const locality = s.locality || city;
  const sublocality = s.sublocality ?? (s.area !== city ? s.area : "");
  return {
    address: s.address,
    formattedAddress: `${s.address}, ${s.area}, ${city}, Maharashtra ${pin}`,
    locality,
    sublocality,
    area: s.area,
    city,
    district: s.district || "Mumbai Suburban",
    state: "Maharashtra",
    pincode: pin,
    postalCode: pin,
  };
}

export async function seed() {
  console.log("Seeding demo data…");
  await Promise.all([
    Notification.deleteMany({}), Report.deleteMany({}), Review.deleteMany({}), Payment.deleteMany({}),
    Booking.deleteMany({}), Favorite.deleteMany({}), BlockedSlot.deleteMany({}), ParkingSpace.deleteMany({}),
    HostPayout.deleteMany({}), Vehicle.deleteMany({}), User.deleteMany({}),
  ]);
  await ParkingSpace.syncIndexes();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const [_admin, driver, host1, host2, host3, extra1, extra2] = await User.create([
    { name: "Parkly Admin", email: "admin@parkly.dev", role: "ADMIN", passwordHash: hash },
    { name: "Aarav Mehta", email: "driver@parkly.dev", role: "DRIVER", passwordHash: hash },
    { name: "Priya Sharma", email: "host@parkly.dev", role: "BOTH", hostVerified: true, passwordHash: hash },
    { name: "Rohan Kulkarni", email: "rohan@parkly.dev", role: "HOST", hostVerified: true, passwordHash: hash },
    { name: "Meera Iyer", email: "meera@parkly.dev", role: "HOST", passwordHash: hash },
    { name: "Kabir Anand", email: "kabir@parkly.dev", role: "DRIVER", passwordHash: hash },
    { name: "Sneha Patil", email: "sneha@parkly.dev", role: "DRIVER", passwordHash: hash },
  ]);

  await Vehicle.create({ userId: driver._id, type: "CAR", make: "Hyundai", model: "i20", plate: "MH02AB1234" });

  const img = (n: number, alt: string) => [
    { url: `/demo/p${n}.svg`, alt, sortOrder: 0 },
    { url: `/demo/p${((n + 2) % 8) + 1}.svg`, alt: `${alt} — angle 2`, sortOrder: 1 },
    { url: `/demo/p${((n + 4) % 8) + 1}.svg`, alt: `${alt} — entrance`, sortOrder: 2 },
  ];

  const spacesData = [
    { host: host1, title: "Covered basement spot near Bandra Linking Road", propertyType: "RESIDENTIAL_SOCIETY", covered: true, level: "BASEMENT", area: "Bandra West", address: "Sea Breeze CHS, 24th Road, off Linking Road", lat: 19.0607, lng: 72.8329, price: 60, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [5, 4, 5, 4], verified: true, n: 1, desc: "Well-lit basement slot in a gated society, two minutes from Linking Road shopping. Wide ramp, easy reverse parking." },
    { host: host1, title: "Gated society parking, Pali Hill", propertyType: "RESIDENTIAL_SOCIETY", covered: false, level: "GROUND", area: "Bandra West", address: "Hillcrest Residency, Pali Hill Road", lat: 19.0664, lng: 72.8262, price: 50, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR,BIKE", rating: [4, 5], verified: true, n: 2, desc: "Open slot inside a quiet gated compound on Pali Hill. Security on duty around the clock." },
    { host: host1, title: "Office tower podium parking, BKC", propertyType: "OFFICE", covered: true, level: "PODIUM", area: "Bandra Kurla Complex (BKC)", address: "Crescent Business Park, G Block, BKC", lat: 19.0662, lng: 72.8656, price: 100, ev: true, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [5, 5, 4, 5, 4], verified: true, n: 3, desc: "Premium podium-level slot in a commercial tower, ideal for BKC meetings. EV charging point available on request.", weekday: true },
    { host: host2, title: "Private driveway spot, Andheri West", propertyType: "INDIVIDUAL", covered: false, level: "GROUND", area: "Andheri West", address: "Bungalow 7, Four Bungalows, Andheri West", lat: 19.1247, lng: 72.8272, price: 40, ev: false, cctv: false, guard: false, gated: false, vehicles: "CAR,BIKE", rating: [4, 4, 3], verified: true, n: 4, desc: "Simple driveway spot outside an independent bungalow. Easy in-and-out, close to Versova metro." },
    { host: host2, title: "Covered stack parking near Infinity Mall", propertyType: "COMMERCIAL", covered: true, level: "GROUND", area: "Andheri West", address: "Trade Point Annexe, New Link Road", lat: 19.1409, lng: 72.8332, price: 55, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [4, 5, 4], verified: true, n: 5, desc: "Managed covered parking a short walk from Infinity Mall. Attendant on site; you park the car yourself." },
    { host: host2, title: "Hotel visitor parking, Andheri East", propertyType: "HOTEL", covered: true, level: "BASEMENT", area: "Andheri East", address: "The Meridian Suites, Marol Maroshi Road", lat: 19.1187, lng: 72.8794, price: 80, ev: true, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [5, 4], verified: true, n: 6, desc: "Basement slots in a business hotel near the airport corridor. EV charger, CCTV and valet-free self parking." },
    { host: host3, title: "Society spot facing Powai Lake", propertyType: "RESIDENTIAL_SOCIETY", covered: false, level: "GROUND", area: "Powai", address: "Lakeview Heights, Central Avenue, Powai", lat: 19.1201, lng: 72.9053, price: 45, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR,BIKE", rating: [4, 4, 5, 4], verified: true, n: 7, desc: "Open society slot with a short walk to Hiranandani Galleria. Guarded gate, visitor sticker provided." },
    { host: host3, title: "Tech park weekend parking, Powai", propertyType: "OFFICE", covered: true, level: "PODIUM", area: "Powai", address: "Orbit Tech Park, Saki Vihar Road", lat: 19.1108, lng: 72.8994, price: 65, ev: true, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [5], verified: false, n: 8, desc: "Office podium slots open to the public on evenings and weekends. EV charging bays on P2.", weekend: true },
    { host: host1, title: "Mill compound parking, Lower Parel", propertyType: "COMMERCIAL", covered: false, level: "GROUND", area: "Lower Parel", address: "Phoenix Annexe Yard, Senapati Bapat Marg", lat: 18.9936, lng: 72.8262, price: 70, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR,BIKE", rating: [4, 3, 4, 4], verified: true, n: 1, desc: "Large open yard two minutes from High Street Phoenix. Well suited for mall visits and office days." },
    { host: host2, title: "Residential basement slot, Dadar East", propertyType: "RESIDENTIAL_SOCIETY", covered: true, level: "BASEMENT", area: "Dadar", address: "Shree Siddhi CHS, Dadasaheb Phalke Road", lat: 19.0186, lng: 72.8494, price: 40, ev: false, cctv: true, guard: false, gated: true, vehicles: "CAR", rating: [4, 5], verified: true, n: 2, desc: "Compact basement slot near Dadar station — best for hatchbacks and compact sedans." },
    { host: host3, title: "Sea-facing building parking, Worli", propertyType: "RESIDENTIAL_SOCIETY", covered: false, level: "GROUND", area: "Worli", address: "Ocean Crest, Worli Sea Face Road", lat: 19.0145, lng: 72.8156, price: 75, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [5, 5], verified: true, n: 3, desc: "Guarded ground-level slot on the Worli sea face, ten minutes from Lotus Signal and Atria Mall." },
    { host: host3, title: "Bike parking bay, Juhu beach lane", propertyType: "INDIVIDUAL", covered: true, level: "GROUND", area: "Juhu", address: "Silver Sands Villa, Juhu Tara Road", lat: 19.0968, lng: 72.8266, price: 15, ev: false, cctv: false, guard: false, gated: true, vehicles: "BIKE", rating: [4, 4], verified: false, n: 4, desc: "Sheltered two-wheeler bay a short walk from Juhu beach. Fits scooters and motorcycles." },
    { host: host2, title: "Covered villa driveway, Juhu Tara Road", propertyType: "INDIVIDUAL", covered: true, level: "GROUND", area: "Juhu", address: "Palm Grove Villa, Juhu Tara Road", lat: 19.1079, lng: 72.8271, price: 70, ev: false, cctv: true, guard: false, gated: true, vehicles: "CAR,BIKE", rating: [5, 4, 4], verified: true, n: 7, desc: "Covered driveway slot on Juhu Tara Road, a short walk from the beach and Prithvi Theatre. Self-parking only." },
    { host: host1, title: "Society parking, JVPD Scheme", propertyType: "RESIDENTIAL_SOCIETY", covered: false, level: "GROUND", area: "Juhu", address: "Sagar Sangam CHS, 10th Road, JVPD Scheme", lat: 19.1124, lng: 72.8298, price: 55, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [4, 5], verified: true, n: 8, desc: "Open gated-society slot in JVPD, handy for Juhu and Andheri West. Guard at the gate; visitor sticker provided." },
    { host: host1, title: "Weekend slot near Dadar flower market", propertyType: "INDIVIDUAL", covered: false, level: "STREET_LEVEL", area: "Dadar", address: "Kesar Niwas, Ranade Road, Dadar West", lat: 19.0227, lng: 72.8419, price: 35, ev: false, cctv: false, guard: false, gated: false, vehicles: "CAR,BIKE", rating: [] as number[], verified: false, n: 5, status: "PAUSED", desc: "Street-level private spot, available most weekends." },
    { host: host3, title: "New basement slot, BKC edge", propertyType: "RESIDENTIAL_SOCIETY", covered: true, level: "BASEMENT", area: "Bandra Kurla Complex (BKC)", address: "Kurla Riverside CHS, LBS Marg edge", lat: 19.0713, lng: 72.8772, price: 55, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [] as number[], verified: false, n: 6, status: "PENDING_REVIEW", desc: "Newly listed basement slot awaiting verification." },
    { host: host2, title: "Covered society parking, Shahad", propertyType: "RESIDENTIAL_SOCIETY", covered: true, level: "GROUND", area: "Shahad", address: "Green Park CHS, Station Road, Shahad", lat: 19.2472, lng: 73.1586, price: 35, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR,BIKE", rating: [4, 5], verified: true, n: 1, desc: "Covered society slot a short walk from Shahad station, handy for Kalyan and Ulhasnagar.", locality: "Shahad", cityName: "Kalyan", district: "Thane", pincode: "421103" },
    { host: host1, title: "Gated compound parking, Kalyan West", propertyType: "RESIDENTIAL_SOCIETY", covered: true, level: "GROUND", area: "Kalyan", address: "Sai Residency, Shivaji Chowk, Kalyan West", lat: 19.2403, lng: 73.1305, price: 40, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR,BIKE", rating: [5, 4], verified: true, n: 2, desc: "Gated compound parking near Kalyan station and the Shivaji Chowk market.", locality: "Kalyan", sublocality: "Kalyan West", cityName: "Kalyan", district: "Thane", pincode: "421301" },
    { host: host3, title: "Basement slot near Thane station", propertyType: "RESIDENTIAL_SOCIETY", covered: true, level: "BASEMENT", area: "Thane", address: "Naupada Heights, Gokhale Road, Thane West", lat: 19.1868, lng: 72.975, price: 50, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR", rating: [4, 4, 5], verified: true, n: 3, desc: "Basement slot in a residential building near Thane station, self-parking only.", locality: "Thane", sublocality: "Thane West", cityName: "Thane", district: "Thane", pincode: "400602" },
    { host: host2, title: "Society parking, Vashi sector 17", propertyType: "RESIDENTIAL_SOCIETY", covered: false, level: "GROUND", area: "Vashi", address: "Palm Beach Residency, Sector 17, Vashi", lat: 19.0771, lng: 72.9986, price: 45, ev: false, cctv: true, guard: true, gated: true, vehicles: "CAR,BIKE", rating: [4, 5], verified: true, n: 4, desc: "Open society slot in Vashi, convenient for Navi Mumbai and the Palm Beach Road corridor.", locality: "Vashi", sublocality: "Vashi", cityName: "Navi Mumbai", district: "Thane", pincode: "400703" },
  ];

  const spaces: InstanceType<typeof ParkingSpace>[] = [];
  for (const s of spacesData) {
    const ratings = s.rating;
    const availability = (s as { weekday?: boolean }).weekday
      ? [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 8 * 60, endMinute: 21 * 60 }))
      : (s as { weekend?: boolean }).weekend
        ? [
            ...[0, 6].map((d) => ({ dayOfWeek: d, startMinute: 0, endMinute: 1440 })),
            ...[1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 18 * 60, endMinute: 1440 })),
          ]
        : [];
    const space = await ParkingSpace.create({
      hostId: s.host._id,
      title: s.title,
      description: s.desc,
      propertyType: s.propertyType,
      spaceType: "PRIVATE",
      covered: s.covered,
      level: s.level,
      vehicleTypes: s.vehicles,
      evCharging: s.ev,
      cctv: s.cctv,
      securityGuard: s.guard,
      gated: s.gated,
      lengthFt: 16,
      widthFt: 8.5,
      heightFt: s.covered ? 7 : undefined,
      ...demoPlace(s),
      location: { type: "Point", coordinates: [s.lng, s.lat] },
      accessInstructions:
        "Show your Parkly access code at the gate. Park only in the marked slot. Self-parking only — never hand over your keys.",
      rules: [
        "Self-parking only — never hand over your keys",
        "No commercial vehicles",
        "Keep access lanes clear",
        ...(s.covered ? ["Vehicle height limit applies"] : []),
      ],
      pricePerHour: paise(s.price),
      minDurationMins: 60,
      maxDurationMins: 1440,
      status: (s as { status?: string }).status ?? "VERIFIED",
      overnightAllowed: false,
      selfParkingConfirmed: true,
      verified: s.verified,
      isDemo: true,
      ratingAvg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
      ratingCount: ratings.length,
      images: img(s.n, s.title),
      availability,
    });
    spaces.push(space);
  }

  let bookingIdx = 1;
  async function createDemoBooking(opts: {
    userId: unknown;
    space: InstanceType<typeof ParkingSpace>;
    start: Date;
    mins: number;
    status: string;
    review?: { rating: number; comment: string };
  }) {
    const q = quote(opts.space.pricePerHour, opts.mins);
    const end = new Date(opts.start.getTime() + opts.mins * 60000);
    const booking = await Booking.create({
      code: code(bookingIdx++),
      userId: opts.userId,
      spaceId: opts.space._id,
      hostId: opts.space.hostId,
      vehicleType: "CAR",
      vehiclePlate: "MH02AB1234",
      start: opts.start,
      end,
      durationMins: opts.mins,
      ...q,
      status: opts.status,
      accessCode: String(100000 + bookingIdx * 7919),
    });
    await Payment.create({
      bookingId: booking._id,
      provider: "MOCK",
      orderId: `mock_order_seed_${bookingIdx}`,
      paymentId: `mock_pay_seed_${bookingIdx}`,
      amount: q.totalAmount,
      status: opts.status === "CANCELLED" ? "REFUNDED" : "PAID",
      method: "upi",
    });
    if (opts.review) {
      await Review.create({
        bookingId: booking._id,
        spaceId: opts.space._id,
        userId: opts.userId,
        rating: opts.review.rating,
        comment: opts.review.comment,
      });
    }
    return booking;
  }

  await createDemoBooking({ userId: driver._id, space: spaces[2], start: at(2, 10), mins: 180, status: "CONFIRMED" });
  await createDemoBooking({ userId: driver._id, space: spaces[8], start: at(1, 18), mins: 240, status: "CONFIRMED" });
  await createDemoBooking({ userId: driver._id, space: spaces[0], start: at(-3, 11), mins: 120, status: "COMPLETED", review: { rating: 5, comment: "Spotless basement, easy access and the guard was helpful. Walked to Linking Road in two minutes." } });
  await createDemoBooking({ userId: driver._id, space: spaces[6], start: at(-8, 9), mins: 480, status: "COMPLETED", review: { rating: 4, comment: "Good value for a full workday near Hiranandani. Slot was slightly tight but fine for an i20." } });
  await createDemoBooking({ userId: driver._id, space: spaces[4], start: at(-15, 14), mins: 180, status: "COMPLETED", review: { rating: 4, comment: "Convenient for the mall. Clear signage once inside." } });
  await createDemoBooking({ userId: driver._id, space: spaces[10], start: at(-1, 16), mins: 120, status: "COMPLETED" });
  await createDemoBooking({ userId: driver._id, space: spaces[3], start: at(-5, 10), mins: 120, status: "CANCELLED" });
  await createDemoBooking({ userId: extra1._id, space: spaces[0], start: at(0, 15), mins: 240, status: "CONFIRMED" });
  await createDemoBooking({ userId: extra2._id, space: spaces[2], start: at(1, 9), mins: 480, status: "CONFIRMED" });
  await createDemoBooking({ userId: extra1._id, space: spaces[2], start: at(-2, 10), mins: 240, status: "COMPLETED", review: { rating: 5, comment: "Perfect for a BKC client visit. EV point worked great." } });
  await createDemoBooking({ userId: extra2._id, space: spaces[8], start: at(-6, 12), mins: 360, status: "COMPLETED", review: { rating: 4, comment: "Big open yard, easy to find." } });
  await createDemoBooking({ userId: extra1._id, space: spaces[1], start: at(-10, 9), mins: 720, status: "COMPLETED" });

  await Favorite.create([spaces[2], spaces[0], spaces[10]].map((s) => ({ userId: driver._id, spaceId: s._id })));
  await BlockedSlot.create({ spaceId: spaces[0]._id, start: at(5, 8), end: at(5, 13), reason: "Society event" });
  await Notification.create([
    { userId: driver._id, type: "BOOKING_CONFIRMED", title: "Booking confirmed", body: "Your spot at Crescent Business Park, BKC is confirmed." },
    { userId: driver._id, type: "REVIEW_REMINDER", title: "How was your parking?", body: "Leave a review for your recent booking at Silver Sands Villa, Juhu." },
    { userId: host1._id, type: "HOST_NEW_BOOKING", title: "New booking received", body: "You have a new booking at Covered basement spot near Bandra Linking Road." },
  ]);
  await Report.create({
    spaceId: spaces[11]._id,
    reporterId: extra2._id,
    reason: "UNAVAILABLE",
    details: "Gate was locked when I arrived; no one answered the intercom.",
  });
  await HostPayout.create([
    { hostId: host1._id, amount: paise(4820), periodStart: at(-30, 0), periodEnd: at(-1, 0), status: "PAID" },
    { hostId: host1._id, amount: paise(1260), periodStart: at(-60, 0), periodEnd: at(-31, 0), status: "PAID" },
  ]);

  console.log(`Seeded ${spaces.length} demo parking spaces, 12 bookings, reviews, favorites.`);
  console.log("Demo accounts (password: password123): driver@parkly.dev · host@parkly.dev · admin@parkly.dev");
}

// Standalone run: connect using env, seed, exit.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/seed.ts")) {
  const { connectDb } = await import("./config/db.js");
  await connectDb();
  await seed();
  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();
  process.exit(0);
}
