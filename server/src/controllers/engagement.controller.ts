import type { Response } from "express";
import { Favorite, ParkingSpace, Report } from "../models/index.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { spaceToSummary } from "../services/search.js";
import { listPendingReviews, reportReview, skipReviewRequest, submitBookingReview } from "../services/reviews.js";

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
  const { bookingId, rating, comment, categories } = req.body as {
    bookingId: string;
    rating: number;
    comment: string;
    categories?: unknown;
  };
  const review = await submitBookingReview({ userId: req.userId, bookingId, rating, comment, categories });
  res.status(201).json({ success: true, data: { id: String(review._id) } });
}

export async function pendingReviews(req: AuthedRequest, res: Response) {
  res.json({ success: true, data: await listPendingReviews(req.userId) });
}

export async function skipReview(req: AuthedRequest, res: Response) {
  res.json({ success: true, data: await skipReviewRequest(req.userId, String(req.params.id)) });
}

export async function reportReviewHandler(req: AuthedRequest, res: Response) {
  const { reason, details } = req.body as { reason: string; details: string };
  await reportReview(req.userId, String(req.params.id), reason, details ?? "");
  res.status(201).json({ success: true, data: {} });
}

export async function createReport(req: AuthedRequest, res: Response) {
  const { spaceId, reason, details } = req.body as { spaceId: string; reason: string; details: string };
  const space = await ParkingSpace.findById(spaceId).select("_id");
  if (!space) throw new ApiError(404, "Listing not found.");
  await Report.create({ spaceId, reporterId: req.userId, reason, details });
  res.status(201).json({ success: true, data: {} });
}
