import type { Response } from "express";
import { Booking, Favorite, Notification, ParkingSpace, Review, User, Vehicle } from "../models/index.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { progressBookingStatuses } from "../services/availability.js";
import { spaceToSummary } from "../services/search.js";

export async function getProfile(req: AuthedRequest, res: Response) {
  const [user, vehicles] = await Promise.all([
    User.findById(req.userId),
    Vehicle.find({ userId: req.userId }).sort({ isDefault: -1, createdAt: 1 }),
  ]);
  if (!user) throw new ApiError(404, "Account not found.");
  res.json({
    success: true,
    data: {
      user: { name: user.name, email: user.email, image: user.image, phone: user.phone, role: user.role },
      profile: {
        preferredVehicleType: user.preferredVehicleType ?? "CAR",
        notifyEmail: user.notifyEmail ?? true,
        notifyReminders: user.notifyReminders ?? true,
      },
      vehicles: vehicles.map((v) => v.toJSON()),
    },
  });
}

export async function updateProfile(req: AuthedRequest, res: Response) {
  const { name, phone, preferredVehicleType, notifyEmail, notifyReminders } = req.body;
  const user = await User.findByIdAndUpdate(
    req.userId,
    { $set: { name, phone: phone ?? "", preferredVehicleType, notifyEmail, notifyReminders } },
    { new: true }
  );
  res.json({ success: true, data: { user: user!.toJSON() } });
}

export async function becomeHost(req: AuthedRequest, res: Response) {
  const user = await User.findById(req.userId);
  if (!user) throw new ApiError(404, "Account not found.");
  if (user.role === "DRIVER") {
    user.role = "BOTH";
    await user.save();
  }
  res.json({ success: true, data: { user: user.toJSON() } });
}

export async function listVehicles(req: AuthedRequest, res: Response) {
  const vehicles = await Vehicle.find({ userId: req.userId }).sort({ createdAt: 1 });
  res.json({ success: true, data: { vehicles } });
}

export async function addVehicle(req: AuthedRequest, res: Response) {
  const count = await Vehicle.countDocuments({ userId: req.userId });
  if (count >= 5) throw new ApiError(400, "You can save up to 5 vehicles.");
  const vehicle = await Vehicle.create({ ...req.body, userId: req.userId });
  res.status(201).json({ success: true, data: { vehicle } });
}

export async function removeVehicle(req: AuthedRequest, res: Response) {
  const v = await Vehicle.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!v) throw new ApiError(404, "Vehicle not found.");
  res.json({ success: true, data: {} });
}

/** Composite payload for the driver dashboard overview. */
export async function dashboard(req: AuthedRequest, res: Response) {
  await progressBookingStatuses(req.userId);
  const now = new Date();
  const withSpace = { path: "spaceId", select: "title area location images" };
  const [upcoming, recent, favorites, completed, pendingReviews] = await Promise.all([
    Booking.find({ userId: req.userId, status: { $in: ["CONFIRMED", "ACTIVE"] }, end: { $gt: now } })
      .sort({ start: 1 }).limit(3).populate(withSpace),
    Booking.find({ userId: req.userId, status: { $in: ["COMPLETED", "CANCELLED"] } })
      .sort({ start: -1 }).limit(3).populate(withSpace),
    Favorite.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(2).populate("spaceId"),
    Booking.aggregate([
      { $match: { userId: (await User.findById(req.userId))!._id, status: "COMPLETED" } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
    ]),
    (async () => {
      const done = await Booking.find({ userId: req.userId, status: "COMPLETED" }).select("_id");
      const reviewed = await Review.countDocuments({ bookingId: { $in: done.map((b) => b._id) } });
      return done.length - reviewed;
    })(),
  ]);
  res.json({
    success: true,
    data: {
      upcoming,
      recent,
      saved: favorites
        .filter((f) => f.spaceId)
        .map((f) => spaceToSummary(f.spaceId as unknown as InstanceType<typeof ParkingSpace>)),
      stats: { completed: completed[0]?.count ?? 0, totalSpent: completed[0]?.total ?? 0 },
      pendingReviews,
    },
  });
}

export async function listNotifications(req: AuthedRequest, res: Response) {
  const notifications = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, data: { notifications } });
}
