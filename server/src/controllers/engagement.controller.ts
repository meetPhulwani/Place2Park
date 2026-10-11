import type { Response } from "express";
import { Booking, Favorite, ParkingSpace, Report, Review } from "../models/index.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { spaceToSummary } from "../services/search.js";

export async function listFavorites(req: AuthedRequest, res: Response) {
  const favorites = await Favorite.find({ userId: req.userId }).sort({ createdAt: -1 }).populate("spaceId");
  res.json({
    success: true,
    data: {
      spaces: favorites
        .filter((f) => f.spaceId)
        .map((f) => spaceToSummary(f.spaceId as unknown as InstanceType<typeof ParkingSpace>)),
    },
  });
}

export async function toggleFavorite(req: AuthedRequest, res: Response) {
  const { spaceId } = req.body as { spaceId: string };
  const space = await ParkingSpace.findById(spaceId).select("_id");
  if (!space) throw new ApiError(404, "Listing not found.");
  const existing = await Favorite.findOne({ userId: req.userId, spaceId });
  if (existing) {
    await existing.deleteOne();
    res.json({ success: true, data: { favorited: false } });
    return;
  }
  await Favorite.create({ userId: req.userId, spaceId });
  res.json({ success: true, data: { favorited: true } });
}

export async function createReview(req: AuthedRequest, res: Response) {
  const { bookingId, rating, comment } = req.body as { bookingId: string; rating: number; comment: string };
  const booking = await Booking.findById(bookingId);
  if (!booking || String(booking.userId) !== req.userId) throw new ApiError(404, "Booking not found.");
  if (booking.status !== "COMPLETED") throw new ApiError(409, "You can review only completed bookings.");
  if (await Review.exists({ bookingId })) throw new ApiError(409, "You already reviewed this booking.");

  await Review.create({ bookingId, spaceId: booking.spaceId, userId: req.userId, rating, comment });
  // Recompute the space's rating aggregate.
  const agg = await Review.aggregate([
    { $match: { spaceId: booking.spaceId } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  await ParkingSpace.updateOne(
    { _id: booking.spaceId },
    { $set: { ratingAvg: Math.round((agg[0]?.avg ?? 0) * 10) / 10, ratingCount: agg[0]?.count ?? 0 } }
  );
  res.status(201).json({ success: true, data: {} });
}

export async function createReport(req: AuthedRequest, res: Response) {
  const { spaceId, reason, details } = req.body as { spaceId: string; reason: string; details: string };
  const space = await ParkingSpace.findById(spaceId).select("_id");
  if (!space) throw new ApiError(404, "Listing not found.");
  await Report.create({ spaceId, reporterId: req.userId, reason, details });
  res.status(201).json({ success: true, data: {} });
}
