import { Booking, ParkingSpace, Review, ReviewReport, ReviewRequest, User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { notify } from "./notify.js";

export const REVIEW_ROLES = ["DRIVER", "HOST"] as const;
export type ReviewRole = (typeof REVIEW_ROLES)[number];

const CATEGORY_KEYS = ["access", "safety", "value", "punctuality", "respect"] as const;

export function reviewSkipLimit() {
  const raw = Number(process.env.REVIEW_SKIP_MAX ?? 3);
  if (!Number.isInteger(raw) || raw < 0 || raw > 20) return 3;
  return raw;
}

export function sanitizeReviewComment(input: string) {
  return input.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F]/g, "").trim().slice(0, 1000);
}

export function cleanCategories(input: unknown) {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const cleaned: Record<string, number> = {};
  for (const key of CATEGORY_KEYS) {
    const value = source[key];
    if (value == null || value === "") continue;
    const rating = Number(value);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ApiError(400, "Category ratings must be from 1 to 5.");
    }
    cleaned[key] = rating;
  }
  return cleaned;
}

function mongoDuplicate(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: number }).code === 11000;
}

type CompletedBooking = {
  _id: unknown;
  userId: unknown;
  hostId: unknown;
  spaceId: unknown;
  status: string;
  refunded?: boolean;
};

async function createRequest(booking: CompletedBooking, authorRole: ReviewRole) {
  const reviewerId = authorRole === "DRIVER" ? booking.userId : booking.hostId;
  const revieweeId = authorRole === "DRIVER" ? booking.hostId : booking.userId;
  if (String(reviewerId) === String(revieweeId)) return null;
  const existing = await ReviewRequest.findOne({ bookingId: booking._id, authorRole });
  if (existing) return existing;
  try {
    const created = await ReviewRequest.create({
      bookingId: booking._id,
      spaceId: booking.spaceId,
      reviewerId,
      revieweeId,
      authorRole,
      status: "PENDING",
    });
    const title = authorRole === "DRIVER" ? "How was your parking experience?" : "How was your experience with this driver?";
    await notify(String(reviewerId), "REVIEW_REMINDER", title, "A completed booking is ready for your review.", {
      bookingId: String(booking._id),
      authorRole,
    });
    return created;
  } catch (err) {
    if (mongoDuplicate(err)) return ReviewRequest.findOne({ bookingId: booking._id, authorRole });
    throw err;
  }
}

/** Create one driver request and one host request after a booking is COMPLETED. */
export async function ensureReviewRequests(bookingIds: string[]) {
  const ids = [...new Set(bookingIds.filter(Boolean))];
  if (!ids.length) return [];
  const bookings = await Booking.find({
    _id: { $in: ids },
    status: "COMPLETED",
    refunded: { $ne: true },
  }).select("userId hostId spaceId status refunded");
  const created = [];
  for (const booking of bookings) {
    created.push(await createRequest(booking, "DRIVER"));
    created.push(await createRequest(booking, "HOST"));
  }
  return created.filter(Boolean);
}

export async function reviewAllowance(userId: string) {
  const [user, pending] = await Promise.all([
    User.findById(userId).select("reviewSkipCount"),
    ReviewRequest.countDocuments({ reviewerId: userId, status: "PENDING" }),
  ]);
  const skipCount = user?.reviewSkipCount ?? 0;
  const skipLimit = reviewSkipLimit();
  const blocked = skipCount >= skipLimit && pending > 0;
  return { skipCount, skipLimit, skipsRemaining: Math.max(0, skipLimit - skipCount), pending, blocked };
}

export async function assertCanTransact(userId: string) {
  const allowance = await reviewAllowance(userId);
  if (allowance.blocked) {
    throw new ApiError(
      409,
      "Submit your pending review before you book again or check another driver in."
    );
  }
}

export async function listPendingReviews(userId: string) {
  const allowance = await reviewAllowance(userId);
  const requests = await ReviewRequest.find({ reviewerId: userId, status: "PENDING" })
    .sort({ createdAt: 1 })
    .populate("spaceId", "title")
    .limit(20);
  return {
    ...allowance,
    requests: requests.map((request) => {
      const space = request.spaceId as unknown as { title?: string } | null;
      return {
        id: String(request._id),
        bookingId: String(request.bookingId),
        authorRole: request.authorRole,
        spaceTitle: space?.title ?? "Parking",
        prompt: request.authorRole === "HOST" ? "How was your experience with this driver?" : "How was your parking experience?",
      };
    }),
  };
}

export async function skipReviewRequest(userId: string, requestId: string) {
  const request = await ReviewRequest.findOne({ _id: requestId, reviewerId: userId, status: "PENDING" });
  if (!request) throw new ApiError(404, "That review is no longer waiting.");
  const limit = reviewSkipLimit();
  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ reviewSkipCount: { $lt: limit } }, { reviewSkipCount: { $exists: false } }],
    },
    { $inc: { reviewSkipCount: 1 } },
    { new: true }
  ).select("reviewSkipCount");
  if (!updated) throw new ApiError(409, "Submit your pending review before you book again or check another driver in.");
  return reviewAllowance(userId);
}

async function refreshSpaceRating(spaceId: unknown) {
  const agg = await Review.aggregate([
    { $match: { spaceId, authorRole: { $ne: "HOST" } } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  await ParkingSpace.updateOne(
    { _id: spaceId },
    { $set: { ratingAvg: Math.round((agg[0]?.avg ?? 0) * 10) / 10, ratingCount: agg[0]?.count ?? 0 } }
  );
}

export async function submitBookingReview(input: {
  userId: string;
  bookingId: string;
  rating: number;
  comment?: string;
  categories?: unknown;
}) {
  const booking = await Booking.findById(input.bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (booking.status !== "COMPLETED" || booking.refunded) {
    throw new ApiError(409, "You can review only completed bookings.");
  }
  const isDriver = String(booking.userId) === input.userId;
  const isHost = String(booking.hostId) === input.userId;
  if (!isDriver && !isHost) throw new ApiError(403, "You were not part of this booking.");
  if (isDriver && isHost) throw new ApiError(409, "You can't review yourself.");
  const authorRole: ReviewRole = isDriver ? "DRIVER" : "HOST";
  const revieweeId = isDriver ? booking.hostId : booking.userId;
  if (String(revieweeId) === input.userId) throw new ApiError(409, "You can't review yourself.");
  const existing = await Review.findOne(
    authorRole === "DRIVER"
      ? { bookingId: booking._id, authorRole: { $ne: "HOST" } }
      : { bookingId: booking._id, authorRole: "HOST" }
  );
  if (existing) throw new ApiError(409, "You already reviewed this booking.");

  const comment = sanitizeReviewComment(input.comment ?? "");
  const categories = cleanCategories(input.categories);
  let review;
  try {
    review = await Review.create({
      bookingId: booking._id,
      spaceId: booking.spaceId,
      userId: input.userId,
      authorRole,
      revieweeId,
      rating: input.rating,
      categories,
      comment,
    });
  } catch (err) {
    if (mongoDuplicate(err)) throw new ApiError(409, "You already reviewed this booking.");
    throw err;
  }
  await ReviewRequest.updateOne(
    { bookingId: booking._id, authorRole, reviewerId: input.userId },
    { $set: { status: "SUBMITTED" } }
  );
  if (authorRole === "DRIVER") await refreshSpaceRating(booking.spaceId);
  return review;
}

export async function reportReview(userId: string, reviewId: string, reason: string, details: string) {
  const review = await Review.findById(reviewId).select("_id userId");
  if (!review) throw new ApiError(404, "Review not found.");
  if (String(review.userId) === userId) throw new ApiError(409, "You can't report your own review.");
  if (await ReviewReport.exists({ reviewId: review._id, reporterId: userId })) {
    throw new ApiError(409, "You already reported this review.");
  }
  try {
    return await ReviewReport.create({
      reviewId: review._id,
      reporterId: userId,
      reason,
      details: sanitizeReviewComment(details).slice(0, 500),
    });
  } catch (err) {
    if (mongoDuplicate(err)) throw new ApiError(409, "You already reported this review.");
    throw err;
  }
}
