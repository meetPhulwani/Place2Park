import type { Response } from "express";
import { Booking, HostPayout, ParkingSpace, Payment, Report, Review, User } from "../models/index.js";
import { adminDirectoryPayoutFlags } from "../models/User.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { notify } from "../services/notify.js";
import { sendSmtpTestMessage } from "../services/email.js";
import { applyListingModeration } from "../services/listings.js";

export async function metrics(_req: AuthedRequest, res: Response) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [users, activeListings, pendingListings, monthBookings, gmv, revenue, openReports, pendingReview, pendingPayouts] =
    await Promise.all([
      User.countDocuments(),
      ParkingSpace.countDocuments({ status: { $in: ["VERIFIED", "ACTIVE"] } }),
      ParkingSpace.countDocuments({ status: "PENDING_REVIEW" }),
      Booking.countDocuments({ createdAt: { $gte: monthStart } }),
      Booking.aggregate([
        { $match: { status: { $in: ["CONFIRMED", "ACTIVE", "COMPLETED"] } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Booking.aggregate([
        { $match: { status: { $in: ["CONFIRMED", "ACTIVE", "COMPLETED"] } } },
        { $group: { _id: null, total: { $sum: { $add: ["$serviceFee", "$platformFee"] } } } },
      ]),
      Report.countDocuments({ status: "OPEN" }),
      ParkingSpace.find({ status: "PENDING_REVIEW" }).sort({ updatedAt: -1 }).limit(10).populate("hostId", "name email"),
      HostPayout.countDocuments({ status: { $in: ["REQUESTED", "APPROVED"] } }),
    ]);
  res.json({
    success: true,
    data: {
      users, activeListings, pendingListings, monthBookings,
      gmv: gmv[0]?.total ?? 0,
      revenue: revenue[0]?.total ?? 0,
      openReports,
      pendingPayouts,
      pendingReview: pendingReview.map((l) => l.toJSON()),
    },
  });
}

export async function listUsers(_req: AuthedRequest, res: Response) {
  const users = await User.find().sort({ createdAt: -1 }).limit(200);
  const [bookingCounts, listingCounts] = await Promise.all([
    Booking.aggregate([{ $group: { _id: "$userId", count: { $sum: 1 } } }]),
    ParkingSpace.aggregate([{ $group: { _id: "$hostId", count: { $sum: 1 } } }]),
  ]);
  const b = new Map(bookingCounts.map((c) => [String(c._id), c.count]));
  const l = new Map(listingCounts.map((c) => [String(c._id), c.count]));
  res.json({
    success: true,
    data: {
      users: users.map((u) => ({
        ...u.toJSON(),
        bookings: b.get(String(u._id)) ?? 0,
        listings: l.get(String(u._id)) ?? 0,
        ...adminDirectoryPayoutFlags(u),
      })),
    },
  });
}

export async function setUserStatus(req: AuthedRequest, res: Response) {
  const { status } = req.body as { status: "ACTIVE" | "SUSPENDED" };
  if (!["ACTIVE", "SUSPENDED"].includes(status)) throw new ApiError(400, "Invalid status.");
  if (req.params.id === req.userId) throw new ApiError(400, "You can't suspend your own account.");
  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, "User not found.");
  if (target.role === "ADMIN") throw new ApiError(400, "Admins can't be suspended from here.");
  target.status = status;
  await target.save();
  res.json({ success: true, data: {} });
}

export async function setHostVerified(req: AuthedRequest, res: Response) {
  const { verified } = req.body as { verified: boolean };
  const target = await User.findByIdAndUpdate(req.params.id, { $set: { hostVerified: !!verified } });
  if (!target) throw new ApiError(404, "User not found.");
  res.json({ success: true, data: {} });
}

export async function listListings(req: AuthedRequest, res: Response) {
  const status = typeof req.query.status === "string" && req.query.status !== "ALL" ? req.query.status : undefined;
  const listings = await ParkingSpace.find(status ? { status } : {})
    .sort({ updatedAt: -1 }).limit(100).populate("hostId", "name email");
  const openReports = await Report.aggregate([
    { $match: { status: "OPEN" } },
    { $group: { _id: "$spaceId", count: { $sum: 1 } } },
  ]);
  const r = new Map(openReports.map((c) => [String(c._id), c.count]));
  res.json({
    success: true,
    data: { listings: listings.map((l) => ({ ...l.toJSON(), openReports: r.get(String(l._id)) ?? 0 })) },
  });
}

export async function moderateListing(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const { action } = req.body as { action: "approve" | "reject" | "hide" | "unhide" };
  const space = await ParkingSpace.findById(req.params.id);
  if (!space) throw new ApiError(404, "Listing not found.");
  Object.assign(space, applyListingModeration(action));
  await space.save();
  if (action === "approve")
    await notify(String(space.hostId), "LISTING_APPROVED", "Listing approved 🎉",
      `"${space.title}" is now live and bookable on Parkly.`, { spaceId: String(space._id) });
  else if (action === "reject")
    await notify(String(space.hostId), "LISTING_REJECTED", "Listing needs changes",
      `"${space.title}" was not approved. Review the details and resubmit.`, { spaceId: String(space._id) });
  res.json({ success: true, data: { listing: space.toJSON() } });
}

export async function listBookings(_req: AuthedRequest, res: Response) {
  const bookings = await Booking.find().sort({ createdAt: -1 }).limit(100)
    .populate("userId", "name email").populate("spaceId", "title area");
  const payments = await Payment.find({ bookingId: { $in: bookings.map((b) => b._id) } });
  const byBooking = new Map(payments.map((p) => [String(p.bookingId), p]));
  res.json({
    success: true,
    data: {
      bookings: bookings.map((b) => ({
        ...b.toJSON(),
        payment: byBooking.get(String(b._id))?.toJSON() ?? null,
      })),
    },
  });
}

export async function listPayments(_req: AuthedRequest, res: Response) {
  const [payments, paidSum, refundedSum, failedCount] = await Promise.all([
    Payment.find().sort({ createdAt: -1 }).limit(100)
      .populate({ path: "bookingId", select: "code userId spaceId", populate: [{ path: "userId", select: "name" }, { path: "spaceId", select: "title" }] }),
    Payment.aggregate([{ $match: { status: "PAID" } }, { $group: { _id: null, sum: { $sum: "$amount" } } }]),
    Payment.aggregate([{ $match: { status: "REFUNDED" } }, { $group: { _id: null, sum: { $sum: "$amount" } } }]),
    Payment.countDocuments({ status: "FAILED" }),
  ]);
  res.json({
    success: true,
    data: {
      payments: payments.map((p) => {
        const b = p.bookingId as unknown as { code?: string; userId?: { name?: string }; spaceId?: { title?: string } } | null;
        return {
          ...p.toJSON(),
          bookingCode: b?.code ?? "",
          driverName: b?.userId?.name ?? "",
          spaceTitle: b?.spaceId?.title ?? "",
        };
      }),
      collected: paidSum[0]?.sum ?? 0,
      refunded: refundedSum[0]?.sum ?? 0,
      failedCount,
    },
  });
}

export async function listReports(_req: AuthedRequest, res: Response) {
  const reports = await Report.find().sort({ status: 1, createdAt: -1 }).limit(100)
    .populate("spaceId", "title area status").populate("reporterId", "name email");
  res.json({ success: true, data: { reports } });
}

export async function resolveReport(req: AuthedRequest, res: Response) {
  const { action, note } = req.body as { action: "resolve" | "dismiss"; note?: string };
  const report = await Report.findById(req.params.id);
  if (!report) throw new ApiError(404, "Report not found.");
  report.status = action === "resolve" ? "RESOLVED" : "DISMISSED";
  report.resolvedById = new (await import("mongoose")).default.Types.ObjectId(req.userId);
  report.resolvedNote = note?.slice(0, 500);
  await report.save();
  res.json({ success: true, data: {} });
}

export async function listReviews(_req: AuthedRequest, res: Response) {
  const reviews = await Review.find().sort({ createdAt: -1 }).limit(100)
    .populate("userId", "name email").populate("spaceId", "title");
  res.json({ success: true, data: { reviews } });
}

export async function sendEmailTest(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const { to, confirm } = req.body as { to?: string; confirm?: boolean };
  try {
    const result = await sendSmtpTestMessage({ to, confirm });
    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMTP test failed.";
    if (/confirm|configured|deliverable|placeholder|disabled|test recipient/i.test(message)) {
      throw new ApiError(400, message);
    }
    throw new ApiError(503, "We couldn't send the test email. Try again shortly.");
  }
}
