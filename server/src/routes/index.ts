import { Router } from "express";
import multer from "multer";
import * as auth from "../controllers/auth.controller.js";
import * as users from "../controllers/users.controller.js";
import * as parking from "../controllers/parking.controller.js";
import * as bookings from "../controllers/bookings.controller.js";
import * as payments from "../controllers/payments.controller.js";
import * as engagement from "../controllers/engagement.controller.js";
import * as host from "../controllers/host.controller.js";
import * as admin from "../controllers/admin.controller.js";
import * as payouts from "../controllers/payouts.controller.js";
import * as uploads from "../controllers/uploads.controller.js";
import { adminOnly, authenticate, hostOnly, maybeAuthenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/error.js";
import { BOOKING_RATE_LIMIT, BOOKING_RATE_WINDOW_MS, rateLimit } from "../utils/rate-limit.js";
import {
  blockSlotSchema, bookingRequestSchema, createPaymentOrderSchema, googleLoginSchema,
  listingSchema, loginSchema, payoutNoteSchema, payoutProfileSchema, payoutReferenceSchema,
  profileSchema, reportSchema, reviewSchema, signupSchema,
  vehicleSchema, verifyPaymentSchema,
} from "../utils/validation.js";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "../services/media.js";

const r = Router();
const a = asyncHandler;

// ---- Auth
r.post("/auth/signup", rateLimit("signup", 5, 10 * 60000), validate(signupSchema), a(auth.signup));
r.post("/auth/login", rateLimit("login", 10, 10 * 60000), validate(loginSchema), a(auth.login));
r.post("/auth/google", rateLimit("google", 10, 10 * 60000), validate(googleLoginSchema), a(auth.googleLogin));
r.get("/auth/me", authenticate, a(auth.me));
r.post("/auth/forgot-password", rateLimit("forgot", 5, 10 * 60000), a(auth.forgotPassword));
r.post("/auth/reset-password", rateLimit("reset", 5, 10 * 60000), a(auth.resetPassword));

// ---- Users
r.patch("/users/me", authenticate, validate(profileSchema), a(users.updateProfile));
r.get("/users/me/profile", authenticate, a(users.getProfile));
r.put("/users/me/profile", authenticate, validate(profileSchema), a(users.updateProfile));
r.post("/users/me/become-host", authenticate, a(users.becomeHost));
r.get("/users/me/dashboard", authenticate, a(users.dashboard));
r.get("/users/me/vehicles", authenticate, a(users.listVehicles));
r.post("/users/me/vehicles", authenticate, validate(vehicleSchema), a(users.addVehicle));
r.delete("/users/me/vehicles/:id", authenticate, a(users.removeVehicle));

// ---- Parking discovery
r.get("/parking/search", a(parking.search));
r.get("/parking/areas", parking.knownAreas);
r.get("/parking/places/suggest", rateLimit("places-suggest", 40, 60_000), a(parking.suggestPlaces));
r.get("/parking/stats", a(parking.stats));
r.get("/parking/:id/quote", a(parking.quote));
r.get("/parking/:id", maybeAuthenticate, a(parking.detail));

// ---- Bookings
r.post("/bookings", authenticate, rateLimit("booking", BOOKING_RATE_LIMIT, BOOKING_RATE_WINDOW_MS), validate(bookingRequestSchema), a(bookings.create));
r.get("/bookings", authenticate, a(bookings.listMine));
r.get("/bookings/:id", authenticate, a(bookings.detail));
r.post("/bookings/:id/cancel", authenticate, a(bookings.cancel));

// ---- Payments
r.post("/payments/orders", authenticate, rateLimit("pay-order", 10, 10 * 60000), validate(createPaymentOrderSchema), a(payments.createOrder));
r.post("/payments/verify", authenticate, rateLimit("pay-verify", 20, 10 * 60000), validate(verifyPaymentSchema), a(payments.verify));
r.post("/payments/mock-confirm", authenticate, a(payments.mockConfirm));
r.post("/payments/webhook", a(payments.webhook)); // signature-verified, no JWT
r.get("/payments", authenticate, a(payments.listMine));

// ---- Reviews / favorites / reports / notifications
r.post("/reviews", authenticate, validate(reviewSchema), a(engagement.createReview));
r.get("/favorites", authenticate, a(engagement.listFavorites));
r.post("/favorites/toggle", authenticate, a(engagement.toggleFavorite));
r.post("/reports", authenticate, rateLimit("report", 5, 60 * 60000), validate(reportSchema), a(engagement.createReport));
r.get("/notifications", authenticate, a(users.listNotifications));

// ---- Host
r.get("/host/overview", authenticate, hostOnly, a(host.overview));
r.get("/host/listings", authenticate, hostOnly, a(host.listListings));
r.post("/host/listings", authenticate, hostOnly, validate(listingSchema), a(host.createListing));
r.get("/host/listings/:id", authenticate, hostOnly, a(host.getListing));
r.put("/host/listings/:id", authenticate, hostOnly, validate(listingSchema), a(host.updateListing));
r.post("/host/listings/:id/status", authenticate, hostOnly, a(host.setListingStatus));
r.patch("/host/listings/:id/status", authenticate, hostOnly, a(host.setListingStatus));
r.get("/host/calendar", authenticate, hostOnly, a(host.calendar));
r.post("/host/calendar/block", authenticate, hostOnly, validate(blockSlotSchema), a(host.blockSlot));
r.delete("/host/calendar/block/:id", authenticate, hostOnly, a(host.unblockSlot));
r.get("/host/bookings", authenticate, hostOnly, a(host.listBookings));
r.get("/host/earnings", authenticate, hostOnly, a(host.earnings));
r.get("/host/payout-profile", authenticate, hostOnly, a(payouts.getPayoutProfile));
r.put("/host/payout-profile", authenticate, hostOnly, validate(payoutProfileSchema), a(payouts.updatePayoutProfile));
r.post("/host/payouts/request", authenticate, hostOnly, rateLimit("payout-request", 8, 10 * 60000), a(payouts.requestPayout));
r.get("/host/reviews", authenticate, hostOnly, a(host.listReviews));

// ---- Admin
r.get("/admin/metrics", authenticate, adminOnly, a(admin.metrics));
r.get("/admin/users", authenticate, adminOnly, a(admin.listUsers));
r.post("/admin/users/:id/status", authenticate, adminOnly, a(admin.setUserStatus));
r.post("/admin/users/:id/verify-host", authenticate, adminOnly, a(admin.setHostVerified));
r.get("/admin/listings", authenticate, adminOnly, a(admin.listListings));
r.post("/admin/listings/:id/moderate", authenticate, adminOnly, a(admin.moderateListing));
r.get("/admin/bookings", authenticate, adminOnly, a(admin.listBookings));
r.get("/admin/payments", authenticate, adminOnly, a(admin.listPayments));
r.get("/admin/payouts", authenticate, adminOnly, a(payouts.adminListPayouts));
r.post("/admin/payouts/:id/reveal-destination", authenticate, adminOnly, a(payouts.adminRevealPayoutDestination));
r.post("/admin/payouts/:id/approve", authenticate, adminOnly, a(payouts.adminApprovePayout));
r.post("/admin/payouts/:id/reject", authenticate, adminOnly, validate(payoutNoteSchema), a(payouts.adminRejectPayout));
r.post("/admin/payouts/:id/mark-paid", authenticate, adminOnly, validate(payoutReferenceSchema), a(payouts.adminMarkPayoutPaid));
r.post("/admin/payouts/:id/fail", authenticate, adminOnly, validate(payoutNoteSchema), a(payouts.adminFailPayout));
r.post("/admin/payouts/:id/reverse", authenticate, adminOnly, validate(payoutNoteSchema), a(payouts.adminReversePayout));
r.post("/admin/users/:id/verify-payout", authenticate, adminOnly, a(payouts.adminVerifyPayoutProfile));
r.get("/admin/reports", authenticate, adminOnly, a(admin.listReports));
r.post("/admin/reports/:id/resolve", authenticate, adminOnly, a(admin.resolveReport));
r.get("/admin/reviews", authenticate, adminOnly, a(admin.listReviews));

// ---- Uploads (Cloudinary in production; local /uploads when Cloudinary is unset in development)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_TYPES[file.mimetype]) cb(null, true);
    else cb(null, false);
  },
});
r.post("/upload", authenticate, hostOnly, rateLimit("upload", 30, 10 * 60000), upload.single("file"), a(uploads.uploadImage));

export default r;
