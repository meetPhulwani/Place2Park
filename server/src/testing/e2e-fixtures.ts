import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { AdminAccount, AdminAudit, AdminConsoleSession, Booking, EmailOtpPending, HostPayout, ParkingSpace, Payment, User } from "../models/index.js";
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
  const host = await User.findOne({ email: "host@parkly.dev" }).select("_id");
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

export async function expireConsoleSessions() {
  assertHooks();
  await AdminConsoleSession.updateMany(
    { revokedAt: null },
    { $set: { lastSeenAt: new Date(Date.now() - 31 * 60 * 1000) } }
  );
}
