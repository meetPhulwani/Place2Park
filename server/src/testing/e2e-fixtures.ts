import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { AdminAccount, AdminAudit, AdminConsoleSession, Booking, EmailOtpPending, HostPayout, Notification, ParkingSpace, Payment, User } from "../models/index.js";
import { provisionSuperAdmin } from "../services/admin-auth.js";
import { sealSecret } from "../utils/admin-secret.js";
import { normalizeSecurityAnswer } from "../utils/admin-access.js";
import { totpCode } from "../utils/totp.js";
import { e2eHooksEnabled } from "./e2e-gate.js";

const ADMIN_EMAIL = "e2e-admin@place2park.test";
const SUPPORT_EMAIL = "e2e-support@place2park.test";
const PASSWORD = "E2eAdmin1!lock";
const ANSWER = "riverside";
const QUESTION_ID = "first-school" as const;
const ADMIN_TOTP_SECRET = "E2EADMINONLYSECRETKEY";
const SUPPORT_TOTP_SECRET = "E2ESUPPORTONLYSECRETK";

function assertHooks() {
  if (!e2eHooksEnabled()) throw new Error("E2E fixtures are refused outside the isolated test server.");
}

export function e2eActors() {
  assertHooks();
  return {
    adminEmail: ADMIN_EMAIL,
    supportEmail: SUPPORT_EMAIL,
    password: PASSWORD,
    answer: ANSWER,
  };
}

export function e2eTotp(role: string) {
  assertHooks();
  const secret = role === "support" ? SUPPORT_TOTP_SECRET : ADMIN_TOTP_SECRET;
  return totpCode(secret);
}

/** One super admin and one support admin for this in-memory process. Production provisioning is unchanged. */
export async function prepareE2eFixtures() {
  assertHooks();
  if (!(await AdminAccount.exists({ role: "SUPER_ADMIN" }))) {
    await provisionSuperAdmin({
      email: ADMIN_EMAIL,
      name: "E2E Admin",
      password: PASSWORD,
      questionId: QUESTION_ID,
      answer: ANSWER,
      totpCode: totpCode(ADMIN_TOTP_SECRET),
      totpSecret: ADMIN_TOTP_SECRET,
    });
  }
  if (!(await AdminAccount.exists({ email: SUPPORT_EMAIL }))) {
    const answer = normalizeSecurityAnswer(ANSWER);
    await AdminAccount.create({
      email: SUPPORT_EMAIL,
      name: "E2E Support",
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      role: "SUPPORT",
      status: "ACTIVE",
      questionId: QUESTION_ID,
      answerHash: await bcrypt.hash(answer, 12),
      totpSecret: sealSecret(SUPPORT_TOTP_SECRET),
    });
  }
  console.info("[e2e] test admin fixtures ready");
}

export async function createReviewListing() {
  assertHooks();
  const source = await ParkingSpace.findOne().lean();
  if (!source) return null;
  const stamp = crypto.randomBytes(3).toString("hex");
  const title = `E2E review ${stamp}`;
  const copy = { ...source } as Record<string, unknown>;
  delete copy._id;
  delete copy.__v;
  delete copy.createdAt;
  delete copy.updatedAt;
  const created = await ParkingSpace.create({ ...copy, title, status: "PENDING_REVIEW", isDemo: true });
  return { id: String(created._id), title };
}

export async function createRequestedPayout() {
  assertHooks();
  const host = await User.findOne({ email: "host@place2park.test" }).select("_id");
  if (!host) return null;
  const stamp = crypto.randomBytes(3).toString("hex");
  const holder = `Synthetic Host ${stamp}`;
  const payout = await HostPayout.create({
    hostId: host._id,
    amount: 424200,
    currency: "INR",
    status: "REQUESTED",
    method: "MANUAL",
    idempotencyKey: `e2e-${stamp}`,
    accountHolder: holder,
    bankName: "Example Bank",
    accountIfsc: "SBIN0001234",
    accountLast4: "1098",
    requestedAt: new Date(),
  });
  return { id: String(payout._id), holder };
}

export async function attachRetainedHistory(userId: string) {
  assertHooks();
  const user = await User.findById(userId).select("_id");
  const space = await ParkingSpace.findOne({ status: { $in: ["VERIFIED", "ACTIVE"] } }).select("_id hostId");
  if (!user || !space) return null;
  const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const booking = await Booking.create({
    code: `PK-E2E${crypto.randomBytes(4).toString("hex")}`,
    userId: user._id,
    spaceId: space._id,
    hostId: space.hostId,
    start,
    end: new Date(start.getTime() + 60 * 60 * 1000),
    durationMins: 60,
    status: "COMPLETED",
    vehicleType: "CAR",
    vehiclePlate: "",
    accessCode: "000000",
    baseAmount: 10000,
    serviceFee: 500,
    totalAmount: 10500,
    platformFee: 1000,
    hostEarning: 9000,
  });
  await Payment.create({
    bookingId: booking._id,
    provider: "MOCK",
    orderId: `e2e_history_${String(booking._id)}`,
    paymentId: `e2e_history_pay_${String(booking._id)}`,
    amount: 10500,
    currency: "INR",
    status: "PAID",
    method: "upi",
  });
  return { bookingId: String(booking._id) };
}

export async function retainedRecords(userId: string) {
  assertHooks();
  const user = await User.findById(userId).select("status");
  const bookings = await Booking.find({ userId }).select("_id");
  const payments = await Payment.countDocuments({ bookingId: { $in: bookings.map((row) => row._id) } });
  const audits = await AdminAudit.countDocuments({ actorId: userId, action: "ACCOUNT_DELETED" });
  return {
    status: user?.status ?? null,
    bookings: bookings.length,
    payments,
    audits,
  };
}

export async function bookingPaymentState(bookingId: string) {
  assertHooks();
  const booking = await Booking.findById(bookingId).select("status");
  const payment = await Payment.findOne({ bookingId }).select("status orderId amount");
  return {
    status: booking?.status ?? null,
    paymentStatus: payment?.status ?? null,
    orderId: payment?.orderId ?? "",
    amount: payment?.amount ?? 0,
  };
}

export async function expireSignupCode(email: string) {
  assertHooks();
  await EmailOtpPending.updateMany(
    { email: email.toLowerCase(), consumed: false },
    { $set: { codeExpiresAt: new Date(Date.now() - 1000) } }
  );
}

export async function releaseSignupResend(email: string) {
  assertHooks();
  await EmailOtpPending.updateMany(
    { email: email.toLowerCase(), consumed: false },
    { $set: { sentAt: new Date(Date.now() - 120_000) } }
  );
}

const E2E_DRIVER = "driver@place2park.test";
const E2E_HOST = "host@place2park.test";

function fixtureMoney() {
  return { baseAmount: 10000, serviceFee: 500, totalAmount: 10500, platformFee: 1000, hostEarning: 9000 };
}

/** Isolated booking pair for browser checks. The access code stays inside this test response. */
export async function prepareReviewArrivalFixture() {
  assertHooks();
  const driver = await User.findOne({ email: E2E_DRIVER }).select("_id");
  const host = await User.findOne({ email: E2E_HOST }).select("_id");
  const space = await ParkingSpace.findOne({ hostId: host?._id, status: { $in: ["VERIFIED", "ACTIVE"] } }).select("_id title");
  if (!driver || !host || !space) return null;
  await User.updateMany({ _id: { $in: [driver._id, host._id] } }, { $set: { reviewSkipCount: 0 } });

  const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const reviewBooking = await Booking.create({
    code: `PK-RV${crypto.randomBytes(3).toString("hex")}`,
    userId: driver._id,
    spaceId: space._id,
    hostId: host._id,
    start: past,
    end: new Date(Date.now() - 60 * 60 * 1000),
    durationMins: 120,
    status: "CONFIRMED",
    vehicleType: "CAR",
    vehiclePlate: "MH02AB1234",
    accessCode: "135790",
    ...fixtureMoney(),
  });
  const { progressOneBooking } = await import("../services/availability.js");
  await progressOneBooking(String(reviewBooking._id));

  const arrival = await Booking.create({
    code: `PK-AR${crypto.randomBytes(3).toString("hex")}`,
    userId: driver._id,
    spaceId: space._id,
    hostId: host._id,
    start: new Date(Date.now() + 60 * 60 * 1000),
    end: new Date(Date.now() + 2 * 60 * 60 * 1000),
    durationMins: 60,
    status: "CONFIRMED",
    vehicleType: "CAR",
    vehiclePlate: "KA01AB1234",
    accessCode: "246810",
    ...fixtureMoney(),
  });
  const decline = await Booking.create({
    code: `PK-DC${crypto.randomBytes(3).toString("hex")}`,
    userId: driver._id,
    spaceId: space._id,
    hostId: host._id,
    start: new Date(Date.now() + 3 * 60 * 60 * 1000),
    end: new Date(Date.now() + 4 * 60 * 60 * 1000),
    durationMins: 60,
    status: "CONFIRMED",
    vehicleType: "CAR",
    vehiclePlate: "MH12CD9999",
    accessCode: "369258",
    ...fixtureMoney(),
  });
  return {
    spaceId: String(space._id),
    spaceTitle: space.title,
    reviewBookingId: String(reviewBooking._id),
    arrivalBookingId: String(arrival._id),
    arrivalCode: arrival.code,
    vehiclePlate: arrival.vehiclePlate,
    accessCode: arrival.accessCode,
    declineBookingId: String(decline._id),
    declineCode: decline.code,
    declinePlate: decline.vehiclePlate,
    declineAccessCode: decline.accessCode,
  };
}

export async function resetReviewSkips() {
  assertHooks();
  await User.updateMany({ email: { $in: [E2E_DRIVER, E2E_HOST] } }, { $set: { reviewSkipCount: 0 } });
}

export async function replaceFixturePlate(bookingId: string, plate: string) {
  assertHooks();
  await Booking.updateOne({ _id: bookingId }, { $set: { vehiclePlate: plate } });
}

export async function vehicleOverrideAudit(bookingId: string) {
  assertHooks();
  const booking = await Booking.findById(bookingId).select("accessCode");
  const audits = await AdminAudit.countDocuments({ action: "VEHICLE_MISMATCH_OVERRIDE", bookingId });
  const notes = await Notification.find({ type: "VEHICLE_MISMATCH", "data.bookingId": bookingId }).select("title body data");
  const leaked = Boolean(booking?.accessCode) && JSON.stringify(notes).includes(booking!.accessCode);
  const auditNotes = await AdminAudit.find({ action: "VEHICLE_MISMATCH_OVERRIDE", bookingId }).select("note vehiclePlate");
  const auditLeaked = Boolean(booking?.accessCode) && JSON.stringify(auditNotes).includes(booking!.accessCode);
  return { audits, leaked: leaked || auditLeaked };
}

export async function expireConsoleSessions() {
  assertHooks();
  await AdminConsoleSession.updateMany(
    { revokedAt: null },
    { $set: { lastSeenAt: new Date(Date.now() - 31 * 60 * 1000) } }
  );
}
