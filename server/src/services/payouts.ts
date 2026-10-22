import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/error.js";
import { Booking, HostPayout, Payment, User } from "../models/index.js";
import { computeQuote } from "../utils/pricing.js";
import { OPEN_PAYOUT_STATUSES } from "../utils/constants.js";
import { notify } from "./notify.js";

export const PAYOUT_METHOD = "MANUAL" as const;

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;

export type PayoutProfileInput = {
  accountHolder: string;
  ifsc: string;
  accountNumber: string;
};

export type PublicPayout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  reference?: string;
  paidAt?: Date;
  events?: { status: string }[];
  [key: string]: unknown;
};

function toPublicPayout(payout: InstanceType<typeof HostPayout>): PublicPayout {
  const json = payout.toJSON() as Record<string, unknown>;
  return { ...json, id: String(json.id ?? json._id) } as PublicPayout;
}

export function publicPayoutProfile(profile?: {
  accountHolder?: string | null;
  ifsc?: string | null;
  accountLast4?: string | null;
  submittedAt?: Date | null;
  verified?: boolean | null;
  verifiedAt?: Date | null;
} | null) {
  if (!profile?.accountLast4) {
    return { submitted: false, verified: false, accountHolder: "", ifsc: "", accountLast4: "" };
  }
  return {
    submitted: true,
    verified: !!profile.verified,
    accountHolder: profile.accountHolder ?? "",
    ifsc: profile.ifsc ?? "",
    accountLast4: profile.accountLast4,
    submittedAt: profile.submittedAt ?? null,
    verifiedAt: profile.verifiedAt ?? null,
  };
}

function payoutKey() {
  return crypto.createHash("sha256").update(`${env.JWT_SECRET}:payout-pii`).digest();
}

export function encryptAccountNumber(accountNumber: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", payoutKey(), iv);
  const enc = Buffer.concat([cipher.update(accountNumber, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

export function decryptAccountNumber(payload: string) {
  const [ivHex, tagHex, dataHex] = String(payload ?? "").split(":");
  if (!ivHex || !tagHex || !dataHex) throw new ApiError(500, "Payout account could not be read.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", payoutKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

export function accountFingerprint(accountNumber: string, ifsc: string) {
  return crypto.createHash("sha256").update(`${accountNumber}:${ifsc}`).digest("hex");
}

export function normalizePayoutProfile(input: PayoutProfileInput) {
  const accountHolder = String(input.accountHolder ?? "").trim();
  const ifsc = String(input.ifsc ?? "").trim().toUpperCase();
  const accountNumber = String(input.accountNumber ?? "").replace(/\s+/g, "");
  if (accountHolder.length < 2 || accountHolder.length > 80) throw new ApiError(400, "Enter the account holder name.");
  if (!IFSC_RE.test(ifsc)) throw new ApiError(400, "Enter a valid IFSC code.");
  if (!ACCOUNT_RE.test(accountNumber)) throw new ApiError(400, "Enter a valid bank account number.");
  return { accountHolder, ifsc, accountNumber, accountLast4: accountNumber.slice(-4) };
}

export function hostEarningFromQuote(pricePerHourPaise: number, durationMins: number) {
  return computeQuote(pricePerHourPaise, durationMins).hostEarning;
}

function appendEvent(
  payout: InstanceType<typeof HostPayout>,
  status: string,
  actorId?: string,
  note = ""
) {
  payout.events.push({
    at: new Date(),
    status,
    actorId: actorId && mongoose.isValidObjectId(actorId) ? new mongoose.Types.ObjectId(actorId) : undefined,
    note: note.slice(0, 400),
  });
}

export async function saveHostPayoutProfile(hostId: string, input: PayoutProfileInput) {
  const normalized = normalizePayoutProfile(input);
  const user = await User.findById(hostId).select("+payoutProfile.accountNumberEnc");
  if (!user) throw new ApiError(404, "Account not found.");
  const fingerprint = accountFingerprint(normalized.accountNumber, normalized.ifsc);
  const unchanged =
    user.payoutProfile?.accountFingerprint === fingerprint && user.payoutProfile.verified;
  user.payoutProfile = {
    accountHolder: normalized.accountHolder,
    ifsc: normalized.ifsc,
    accountLast4: normalized.accountLast4,
    accountFingerprint: fingerprint,
    accountNumberEnc: encryptAccountNumber(normalized.accountNumber),
    submittedAt: new Date(),
    verified: unchanged,
    verifiedAt: unchanged ? user.payoutProfile?.verifiedAt : undefined,
    verifiedById: unchanged ? user.payoutProfile?.verifiedById : undefined,
  };
  await user.save();
  return publicPayoutProfile(user.payoutProfile);
}

export async function verifyHostPayoutProfile(adminId: string, hostId: string, verified: boolean) {
  const user = await User.findById(hostId);
  if (!user) throw new ApiError(404, "User not found.");
  if (!user.payoutProfile?.accountLast4) throw new ApiError(400, "This host has not submitted payout details.");
  user.payoutProfile.verified = !!verified;
  user.payoutProfile.verifiedAt = verified ? new Date() : undefined;
  user.payoutProfile.verifiedById = verified ? new mongoose.Types.ObjectId(adminId) : undefined;
  await user.save();
  return publicPayoutProfile(user.payoutProfile);
}

function paymentAllowsPayout(status?: string | null, refundStatus?: string | null) {
  if (status !== "PAID") return false;
  return refundStatus !== "PENDING" && refundStatus !== "PROCESSED";
}

export async function listEligibleBookings(hostId: string) {
  const bookings = await Booking.find({
    hostId,
    status: "COMPLETED",
    refunded: { $ne: true },
    $or: [{ payoutId: { $exists: false } }, { payoutId: null }],
  }).sort({ end: 1 });
  if (!bookings.length) return [];
  const payments = await Payment.find({ bookingId: { $in: bookings.map((b) => b._id) } });
  const byBooking = new Map(payments.map((p) => [String(p.bookingId), p]));
  return bookings.filter((b) => {
    const payment = byBooking.get(String(b._id));
    return paymentAllowsPayout(payment?.status, payment?.refundStatus);
  });
}

export async function summarizeHostEarnings(hostId: string) {
  const hostOid = new mongoose.Types.ObjectId(hostId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [completed, upcoming, monthly, payoutAgg, profileUser, payouts, eligible] = await Promise.all([
    Booking.aggregate([
      { $match: { hostId: hostOid, status: "COMPLETED" } },
      { $group: { _id: null, earning: { $sum: "$hostEarning" }, fees: { $sum: "$platformFee" }, gross: { $sum: "$baseAmount" }, count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { hostId: hostOid, status: { $in: ["CONFIRMED", "ACTIVE"] } } },
      { $group: { _id: null, earning: { $sum: "$hostEarning" }, count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { hostId: hostOid, status: "COMPLETED", start: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
      { $group: { _id: { y: { $year: "$start" }, m: { $month: "$start" } }, earning: { $sum: "$hostEarning" } } },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]),
    HostPayout.aggregate([
      { $match: { hostId: hostOid } },
      { $group: { _id: "$status", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    User.findById(hostId).select("payoutProfile"),
    HostPayout.find({ hostId }).sort({ createdAt: -1 }).limit(20),
    listEligibleBookings(hostId),
  ]);
  const byStatus = Object.fromEntries(payoutAgg.map((row) => [row._id, row]));
  const eligibleAmount = eligible.reduce((sum, b) => sum + (b.hostEarning ?? 0), 0);
  return {
    calculatedCompleted: completed[0]?.earning ?? 0,
    platformFees: completed[0]?.fees ?? 0,
    gross: completed[0]?.gross ?? 0,
    completedCount: completed[0]?.count ?? 0,
    upcomingEarnings: upcoming[0]?.earning ?? 0,
    upcomingCount: upcoming[0]?.count ?? 0,
    thisMonthCalculated: (
      await Booking.aggregate([
        { $match: { hostId: hostOid, status: { $in: ["CONFIRMED", "ACTIVE", "COMPLETED"] }, start: { $gte: monthStart } } },
        { $group: { _id: null, earning: { $sum: "$hostEarning" } } },
      ])
    )[0]?.earning ?? 0,
    eligibleAmount,
    eligibleCount: eligible.length,
    pendingTransferAmount: (byStatus.REQUESTED?.amount ?? 0) + (byStatus.APPROVED?.amount ?? 0),
    pendingTransferCount: (byStatus.REQUESTED?.count ?? 0) + (byStatus.APPROVED?.count ?? 0),
    paidAmount: byStatus.PAID?.amount ?? 0,
    paidCount: byStatus.PAID?.count ?? 0,
    monthly: monthly.map((m) => ({ year: m._id.y, month: m._id.m, earning: m.earning })),
    payouts: payouts.map((p) => p.toJSON()),
    payoutProfile: publicPayoutProfile(profileUser?.payoutProfile),
    payoutMethod: PAYOUT_METHOD,
    automaticTransfers: false,
  };
}

async function requireVerifiedProfile(hostId: string) {
  const user = await User.findById(hostId).select("+payoutProfile.accountNumberEnc");
  if (!user) throw new ApiError(404, "Account not found.");
  const profile = user.payoutProfile;
  if (!profile?.accountLast4 || !profile.accountNumberEnc) {
    throw new ApiError(400, "Add your bank details before requesting a payout.");
  }
  if (!profile.verified) throw new ApiError(400, "An admin must verify your payout details first.");
  return { user, profile };
}

export async function requestHostPayout(hostId: string) {
  const { profile } = await requireVerifiedProfile(hostId);
  const eligible = await listEligibleBookings(hostId);
  if (!eligible.length) {
    const open = await HostPayout.findOne({ hostId, status: { $in: [...OPEN_PAYOUT_STATUSES] } }).sort({ createdAt: -1 });
    if (open) return toPublicPayout(open);
    throw new ApiError(409, "There is no eligible balance to pay out yet.");
  }

  const bookingIds = eligible.map((b) => b._id);
  const amount = eligible.reduce((sum, b) => sum + (b.hostEarning ?? 0), 0);
  const idempotencyKey = `manual:${hostId}:${bookingIds.map(String).sort().join(",")}`;
  const periodStart = eligible[0]!.end;
  const periodEnd = eligible[eligible.length - 1]!.end;

  let payout: InstanceType<typeof HostPayout>;
  try {
    payout = await HostPayout.create({
      hostId,
      bookingIds,
      amount,
      currency: "INR",
      status: "REQUESTED",
      method: PAYOUT_METHOD,
      idempotencyKey,
      accountHolder: profile.accountHolder,
      accountIfsc: profile.ifsc,
      accountLast4: profile.accountLast4,
      periodStart,
      periodEnd,
      requestedAt: new Date(),
      events: [{ at: new Date(), status: "REQUESTED", note: "host_requested" }],
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 11000) throw err;
    const existing = await HostPayout.findOne({ idempotencyKey });
    if (existing) return toPublicPayout(existing);
    throw err;
  }

  const claimedIds: mongoose.Types.ObjectId[] = [];
  let claimedAmount = 0;
  for (const booking of eligible) {
    const claimed = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        hostId,
        status: "COMPLETED",
        refunded: { $ne: true },
        $or: [{ payoutId: { $exists: false } }, { payoutId: null }],
      },
      { $set: { payoutId: payout._id } },
      { new: true }
    );
    if (claimed) {
      claimedIds.push(claimed._id as mongoose.Types.ObjectId);
      claimedAmount += claimed.hostEarning ?? 0;
    }
  }

  if (!claimedIds.length) {
    await HostPayout.deleteOne({ _id: payout._id, status: "REQUESTED" });
    const existing = await HostPayout.findOne({
      hostId,
      status: { $in: [...OPEN_PAYOUT_STATUSES] },
    }).sort({ createdAt: -1 });
    if (existing) return toPublicPayout(existing);
    throw new ApiError(409, "There is no eligible balance to pay out yet.");
  }

  payout.bookingIds = claimedIds;
  payout.amount = claimedAmount;
  payout.periodStart = eligible.find((b) => claimedIds.some((id) => String(id) === String(b._id)))?.end;
  payout.periodEnd = eligible.filter((b) => claimedIds.some((id) => String(id) === String(b._id))).at(-1)?.end;
  await payout.save();
  return toPublicPayout(payout);
}

async function loadPayout(payoutId: string) {
  if (!mongoose.isValidObjectId(payoutId)) throw new ApiError(404, "Payout not found.");
  const payout = await HostPayout.findById(payoutId);
  if (!payout) throw new ApiError(404, "Payout not found.");
  return payout;
}

async function releaseBookings(payoutId: unknown) {
  await Booking.updateMany({ payoutId }, { $unset: { payoutId: 1 } });
}

function retireIdempotencyKey(payout: InstanceType<typeof HostPayout>) {
  payout.idempotencyKey = `${payout.idempotencyKey}:closed:${String(payout._id)}`;
}

export async function approveHostPayout(adminId: string, payoutId: string) {
  const payout = await HostPayout.findOneAndUpdate(
    { _id: payoutId, status: "REQUESTED" },
    {
      $set: { status: "APPROVED", approvedAt: new Date(), approvedById: adminId, actedById: adminId },
      $push: { events: { at: new Date(), status: "APPROVED", actorId: adminId, note: "admin_approved" } },
    },
    { new: true }
  );
  if (!payout) {
    const latest = await loadPayout(payoutId);
    if (latest.status === "APPROVED") return toPublicPayout(latest);
    throw new ApiError(409, "This payout cannot be approved.");
  }
  return toPublicPayout(payout);
}

export async function rejectHostPayout(adminId: string, payoutId: string, note = "") {
  const payout = await HostPayout.findOneAndUpdate(
    { _id: payoutId, status: "REQUESTED" },
    {
      $set: { status: "REJECTED", rejectedAt: new Date(), actedById: adminId, notes: note.slice(0, 400) },
      $push: { events: { at: new Date(), status: "REJECTED", actorId: adminId, note: note.slice(0, 400) } },
    },
    { new: true }
  );
  if (!payout) throw new ApiError(409, "This payout cannot be rejected.");
  retireIdempotencyKey(payout);
  await payout.save();
  await releaseBookings(payout._id);
  return toPublicPayout(payout);
}

export async function markHostPayoutPaid(adminId: string, payoutId: string, reference: string) {
  const ref = String(reference ?? "").trim();
  if (ref.length < 4) throw new ApiError(400, "Enter the bank or UPI reference for this payout.");
  const payout = await HostPayout.findOneAndUpdate(
    { _id: payoutId, status: "APPROVED" },
    {
      $set: {
        status: "PAID",
        reference: ref.slice(0, 80),
        paidAt: new Date(),
        actedById: adminId,
      },
      $push: { events: { at: new Date(), status: "PAID", actorId: adminId, note: ref.slice(0, 80) } },
    },
    { new: true }
  );
  if (!payout) {
    const latest = await loadPayout(payoutId);
    if (latest.status === "PAID") return toPublicPayout(latest);
    throw new ApiError(409, "Approve the payout before marking it paid.");
  }
  await notify(
    String(payout.hostId),
    "HOST_PAYOUT_PAID",
    "Payout completed",
    `₹${(payout.amount / 100).toFixed(2)} was marked paid. Reference ${payout.reference}.`,
    { payoutId: String(payout._id) }
  );
  return toPublicPayout(payout);
}

export async function failHostPayout(adminId: string, payoutId: string, note = "") {
  const payout = await HostPayout.findOneAndUpdate(
    { _id: payoutId, status: { $in: ["REQUESTED", "APPROVED"] } },
    {
      $set: { status: "FAILED", failedAt: new Date(), actedById: adminId, notes: note.slice(0, 400) },
      $push: { events: { at: new Date(), status: "FAILED", actorId: adminId, note: note.slice(0, 400) } },
    },
    { new: true }
  );
  if (!payout) throw new ApiError(409, "This payout cannot be marked failed.");
  retireIdempotencyKey(payout);
  await payout.save();
  await releaseBookings(payout._id);
  await notify(
    String(payout.hostId),
    "HOST_PAYOUT_FAILED",
    "Payout failed",
    "Your payout request could not be completed. Eligible earnings are available to request again.",
    { payoutId: String(payout._id) }
  );
  return toPublicPayout(payout);
}

export async function reverseHostPayout(adminId: string, payoutId: string, note = "") {
  const payout = await HostPayout.findOneAndUpdate(
    { _id: payoutId, status: "PAID" },
    {
      $set: { status: "REVERSED", reversedAt: new Date(), actedById: adminId, notes: note.slice(0, 400) },
      $push: { events: { at: new Date(), status: "REVERSED", actorId: adminId, note: note.slice(0, 400) } },
    },
    { new: true }
  );
  if (!payout) throw new ApiError(409, "Only a paid payout can be reversed.");
  return toPublicPayout(payout);
}

export async function reconcileRefundedBooking(bookingId: unknown) {
  const booking = await Booking.findById(bookingId);
  if (!booking?.payoutId) return;
  const payout = await HostPayout.findById(booking.payoutId);
  if (!payout) {
    await Booking.updateOne({ _id: booking._id }, { $unset: { payoutId: 1 } });
    return;
  }
  if (payout.status === "PAID" || payout.status === "REVERSED") {
    appendEvent(payout, payout.status, undefined, "booking_refunded_after_settlement");
    await payout.save();
    return;
  }
  const remaining = (payout.bookingIds ?? []).filter((id) => String(id) !== String(booking._id));
  const remainingDocs = remaining.length
    ? await Booking.find({ _id: { $in: remaining } }).select("hostEarning end")
    : [];
  payout.bookingIds = remaining;
  payout.amount = remainingDocs.reduce((sum, b) => sum + (b.hostEarning ?? 0), 0);
  appendEvent(payout, payout.status, undefined, "booking_removed_after_refund");
  if (!remaining.length && (OPEN_PAYOUT_STATUSES as readonly string[]).includes(payout.status)) {
    payout.status = "REJECTED";
    payout.rejectedAt = new Date();
    retireIdempotencyKey(payout);
    appendEvent(payout, "REJECTED", undefined, "empty_after_refund");
  }
  await payout.save();
  await Booking.updateOne({ _id: booking._id }, { $unset: { payoutId: 1 } });
}

/** Route transfer webhooks are recorded only when we already stored a transferId. Manual payouts never create transfers. */
export async function applyRouteTransferEvent(input: { event?: string; transferId?: string }) {
  if (!input.transferId) return;
  const payout = await HostPayout.findOne({ transferId: input.transferId });
  if (!payout) return;
  if (input.event === "transfer.processed" && payout.status === "APPROVED") {
    payout.status = "PAID";
    payout.paidAt = new Date();
    appendEvent(payout, "PAID", undefined, "transfer.processed");
    await payout.save();
  } else if (input.event === "transfer.failed" && (OPEN_PAYOUT_STATUSES as readonly string[]).includes(payout.status)) {
    payout.status = "FAILED";
    payout.failedAt = new Date();
    appendEvent(payout, "FAILED", undefined, "transfer.failed");
    await payout.save();
    await releaseBookings(payout._id);
  }
}

export async function listAdminPayouts(status?: string) {
  const filter = status && status !== "ALL" ? { status } : {};
  const payouts = await HostPayout.find(filter).sort({ createdAt: -1 }).limit(100).populate("hostId", "name email payoutProfile");
  const hostIds = [...new Set(payouts.map((p) => String(p.hostId && typeof p.hostId === "object" && "_id" in p.hostId ? p.hostId._id : p.hostId)))];
  const secrets = await User.find({ _id: { $in: hostIds } }).select("+payoutProfile.accountNumberEnc");
  const encByHost = new Map(secrets.map((u) => [String(u._id), u.payoutProfile?.accountNumberEnc ?? ""]));
  return payouts.map((p) => {
    const host = p.hostId as unknown as { _id?: unknown; name?: string; email?: string; payoutProfile?: { accountHolder?: string; ifsc?: string; accountLast4?: string; verified?: boolean } };
    const hostId = String(host?._id ?? p.hostId);
    let accountNumber = "";
    const enc = encByHost.get(hostId);
    if (enc) {
      try {
        accountNumber = decryptAccountNumber(enc);
      } catch {
        accountNumber = "";
      }
    }
    return {
      ...p.toJSON(),
      hostId: { id: hostId, name: host?.name, email: host?.email },
      destination: {
        accountHolder: p.accountHolder || host?.payoutProfile?.accountHolder || "",
        ifsc: p.accountIfsc || host?.payoutProfile?.ifsc || "",
        accountLast4: p.accountLast4 || host?.payoutProfile?.accountLast4 || "",
        accountNumber,
        verified: !!host?.payoutProfile?.verified,
      },
    };
  });
}
