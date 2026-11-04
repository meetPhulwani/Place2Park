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
import * as support from "../controllers/support.controller.js";
import * as faqs from "../controllers/faqs.controller.js";
import { adminOnly, authenticate, hostOnly, maybeAuthenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/error.js";
import {
  BOOKING_RATE_LIMIT,
  BOOKING_RATE_WINDOW_MS,
  PAYMENT_ORDER_LIMIT,
  PAYMENT_ORDER_WINDOW_MS,
  apiLimiter,
  googleAuthLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  otpResendAccountLimiter,
  otpResendIpLimiter,
  otpVerifyChallengeLimiter,
  otpVerifyIpLimiter,
  passwordResetAccountLimiter,
  passwordResetIpLimiter,
  passwordResetTokenLimiter,
  positiveIntEnv,
  rateLimit,
  signupAccountLimiter,
  signupIpLimiter,
  WEBHOOK_RATE_LIMIT,
  WEBHOOK_RATE_WINDOW_MS,
  ipKey,
} from "../utils/rate-limit.js";
import {
  blockSlotSchema, bookingRequestSchema, createPaymentOrderSchema, emailOtpResendSchema,
  emailOtpVerifySchema, emptyBodySchema, favoriteSchema, forgotPasswordSchema, googleLoginSchema,
  listingSchema, listingStatusSchema, loginSchema, moderationSchema, payoutNoteSchema, payoutProfileSchema, payoutReferenceSchema,
  profileSchema, reportSchema, resetPasswordSchema, resolveReportSchema, reviewSchema, signupSchema, smtpTestSchema,
  faqFeedbackSchema, faqReorderSchema, faqSchema, faqUpdateSchema,
  supportTicketSchema, ticketReplySchema, ticketUpdateSchema, userReportSchema, userStatusSchema,
  vehicleSchema, verifiedFlagSchema, verifyPaymentSchema,
} from "../utils/validation.js";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "../services/media.js";

const r = Router();
const a = asyncHandler;

r.param("id", (_req, res, next, value) => {
  if (!/^[a-fA-F0-9]{24}$/.test(String(value))) {
    res.status(400).json({ success: false, message: "Invalid id." });
    return;
  }
  next();
});
r.param("kind", (_req, res, next, value) => {
  if (value !== "USER_REPORT" && value !== "SUPPORT") {
    res.status(404).json({ success: false, message: "Not found." });
    return;
  }
  next();
});

r.use(apiLimiter);

// ---- Auth
r.post("/auth/signup", signupIpLimiter, signupAccountLimiter, validate(signupSchema), a(auth.signup));
r.post("/auth/email-otp/resend", otpResendIpLimiter, otpResendAccountLimiter, validate(emailOtpResendSchema), a(auth.requestEmailOtpResend));
r.post("/auth/email-otp/verify", otpVerifyIpLimiter, otpVerifyChallengeLimiter, validate(emailOtpVerifySchema), a(auth.verifyEmailOtp));
r.post("/auth/login", loginIpLimiter, loginAccountLimiter, validate(loginSchema), a(auth.login));
r.post("/auth/google", googleAuthLimiter, validate(googleLoginSchema), a(auth.googleLogin));
r.get("/auth/me", authenticate, a(auth.me));
r.post("/auth/forgot-password", passwordResetIpLimiter, passwordResetAccountLimiter, validate(forgotPasswordSchema), a(auth.forgotPassword));
r.post("/auth/reset-password", passwordResetIpLimiter, passwordResetTokenLimiter, validate(resetPasswordSchema), a(auth.resetPassword));

// ---- Users
r.patch("/users/me", authenticate, validate(profileSchema), a(users.updateProfile));
r.get("/users/me/profile", authenticate, a(users.getProfile));
r.put("/users/me/profile", authenticate, validate(profileSchema), a(users.updateProfile));
r.post("/users/me/become-host", authenticate, validate(emptyBodySchema), a(users.becomeHost));
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
r.post("/bookings", authenticate, rateLimit("booking", positiveIntEnv("RATE_LIMIT_BOOKING", BOOKING_RATE_LIMIT), positiveIntEnv("RATE_LIMIT_BOOKING_WINDOW_MS", BOOKING_RATE_WINDOW_MS, 86_400_000)), validate(bookingRequestSchema), a(bookings.create));
r.get("/bookings", authenticate, a(bookings.listMine));
r.get("/bookings/:id", authenticate, a(bookings.detail));
r.post("/bookings/:id/cancel", authenticate, rateLimit("booking-cancel", positiveIntEnv("RATE_LIMIT_BOOKING_CANCEL", 10), positiveIntEnv("RATE_LIMIT_BOOKING_CANCEL_WINDOW_MS", 10 * 60_000, 86_400_000)), a(bookings.cancel));

// ---- Payments
r.post("/payments/orders", authenticate, rateLimit("pay-order", positiveIntEnv("RATE_LIMIT_PAYMENT_ORDER", PAYMENT_ORDER_LIMIT), positiveIntEnv("RATE_LIMIT_PAYMENT_ORDER_WINDOW_MS", PAYMENT_ORDER_WINDOW_MS, 86_400_000)), validate(createPaymentOrderSchema), a(payments.createOrder));
r.post("/payments/verify", authenticate, rateLimit("pay-verify", positiveIntEnv("RATE_LIMIT_PAYMENT_VERIFY", 20), positiveIntEnv("RATE_LIMIT_PAYMENT_VERIFY_WINDOW_MS", 10 * 60_000, 86_400_000)), validate(verifyPaymentSchema), a(payments.verify));
r.post("/payments/mock-confirm", authenticate, a(payments.mockConfirm));
r.post("/payments/webhook", rateLimit("webhook", positiveIntEnv("RATE_LIMIT_WEBHOOK", WEBHOOK_RATE_LIMIT), positiveIntEnv("RATE_LIMIT_WEBHOOK_WINDOW_MS", WEBHOOK_RATE_WINDOW_MS, 86_400_000), { key: ipKey, audit: "payment" }), a(payments.webhook));
r.get("/payments", authenticate, a(payments.listMine));

// ---- Reviews / favorites / reports / notifications
r.post("/reviews", authenticate, rateLimit("review", positiveIntEnv("RATE_LIMIT_REVIEW", 10), positiveIntEnv("RATE_LIMIT_REVIEW_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(reviewSchema), a(engagement.createReview));
r.get("/favorites", authenticate, a(engagement.listFavorites));
r.post("/favorites/toggle", authenticate, rateLimit("favorite", positiveIntEnv("RATE_LIMIT_FAVORITE", 60), positiveIntEnv("RATE_LIMIT_FAVORITE_WINDOW_MS", 10 * 60_000, 86_400_000)), validate(favoriteSchema), a(engagement.toggleFavorite));
r.post("/reports", authenticate, rateLimit("report", positiveIntEnv("RATE_LIMIT_REPORT", 5), positiveIntEnv("RATE_LIMIT_REPORT_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(reportSchema), a(engagement.createReport));
r.get("/faqs", a(faqs.list));
r.post("/faqs/:id/feedback", maybeAuthenticate, rateLimit("faq-feedback", positiveIntEnv("RATE_LIMIT_FAQ_FEEDBACK", 30), positiveIntEnv("RATE_LIMIT_FAQ_FEEDBACK_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(faqFeedbackSchema), a(faqs.feedback));
r.get("/support/bookings", authenticate, a(support.bookings));
r.post("/support/reports", authenticate, rateLimit("support-report", positiveIntEnv("RATE_LIMIT_SUPPORT_REPORT", 5), positiveIntEnv("RATE_LIMIT_SUPPORT_REPORT_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(userReportSchema), a(support.createReport));
r.post("/support/tickets", authenticate, rateLimit("support-ticket", positiveIntEnv("RATE_LIMIT_SUPPORT_TICKET", 8), positiveIntEnv("RATE_LIMIT_SUPPORT_TICKET_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(supportTicketSchema), a(support.createTicket));
r.get("/support/mine", authenticate, a(support.mine));
r.get("/support/cases/:kind/:id", authenticate, a(support.detail));
r.post("/support/cases/:kind/:id/messages", authenticate, rateLimit("support-message", positiveIntEnv("RATE_LIMIT_SUPPORT_MESSAGE", 20), positiveIntEnv("RATE_LIMIT_SUPPORT_MESSAGE_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(ticketReplySchema), a(support.reply));
r.get("/notifications", authenticate, a(users.listNotifications));

// ---- Host
r.get("/host/overview", authenticate, hostOnly, a(host.overview));
r.get("/host/listings", authenticate, hostOnly, a(host.listListings));
r.post("/host/listings", authenticate, hostOnly, rateLimit("listing-create", positiveIntEnv("RATE_LIMIT_LISTING_CREATE", 10), positiveIntEnv("RATE_LIMIT_LISTING_CREATE_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(listingSchema), a(host.createListing));
r.get("/host/listings/:id", authenticate, hostOnly, a(host.getListing));
r.put("/host/listings/:id", authenticate, hostOnly, rateLimit("listing-update", positiveIntEnv("RATE_LIMIT_LISTING_UPDATE", 30), positiveIntEnv("RATE_LIMIT_LISTING_UPDATE_WINDOW_MS", 10 * 60_000, 86_400_000)), validate(listingSchema), a(host.updateListing));
r.post("/host/listings/:id/status", authenticate, hostOnly, validate(listingStatusSchema), a(host.setListingStatus));
r.patch("/host/listings/:id/status", authenticate, hostOnly, validate(listingStatusSchema), a(host.setListingStatus));
r.get("/host/calendar", authenticate, hostOnly, a(host.calendar));
r.post("/host/calendar/block", authenticate, hostOnly, validate(blockSlotSchema), a(host.blockSlot));
r.delete("/host/calendar/block/:id", authenticate, hostOnly, a(host.unblockSlot));
r.get("/host/bookings", authenticate, hostOnly, a(host.listBookings));
r.get("/host/earnings", authenticate, hostOnly, a(host.earnings));
r.get("/host/payout-profile", authenticate, hostOnly, a(payouts.getPayoutProfile));
r.put("/host/payout-profile", authenticate, hostOnly, validate(payoutProfileSchema), a(payouts.updatePayoutProfile));
r.post("/host/payouts/request", authenticate, hostOnly, rateLimit("payout-request", positiveIntEnv("RATE_LIMIT_PAYOUT_REQUEST", 8), positiveIntEnv("RATE_LIMIT_PAYOUT_REQUEST_WINDOW_MS", 10 * 60_000, 86_400_000)), validate(emptyBodySchema), a(payouts.requestPayout));
r.get("/host/reviews", authenticate, hostOnly, a(host.listReviews));

// ---- Admin
r.get("/admin/metrics", authenticate, adminOnly, a(admin.metrics));
r.get("/admin/users", authenticate, adminOnly, a(admin.listUsers));
r.post("/admin/users/:id/status", authenticate, adminOnly, validate(userStatusSchema), a(admin.setUserStatus));
r.post("/admin/users/:id/verify-host", authenticate, adminOnly, validate(verifiedFlagSchema), a(admin.setHostVerified));
r.get("/admin/listings", authenticate, adminOnly, a(admin.listListings));
r.post("/admin/listings/:id/moderate", authenticate, adminOnly, validate(moderationSchema), a(admin.moderateListing));
r.get("/admin/bookings", authenticate, adminOnly, a(admin.listBookings));
r.get("/admin/payments", authenticate, adminOnly, a(admin.listPayments));
r.get("/admin/payouts", authenticate, adminOnly, a(payouts.adminListPayouts));
r.post("/admin/payouts/:id/reveal-destination", authenticate, adminOnly, a(payouts.adminRevealPayoutDestination));
r.get("/admin/payouts/:id/destination-audits", authenticate, adminOnly, a(payouts.adminListPayoutDestinationAudits));
r.post("/admin/payouts/:id/approve", authenticate, adminOnly, a(payouts.adminApprovePayout));
r.post("/admin/payouts/:id/reject", authenticate, adminOnly, validate(payoutNoteSchema), a(payouts.adminRejectPayout));
r.post("/admin/payouts/:id/mark-paid", authenticate, adminOnly, validate(payoutReferenceSchema), a(payouts.adminMarkPayoutPaid));
r.post("/admin/payouts/:id/fail", authenticate, adminOnly, validate(payoutNoteSchema), a(payouts.adminFailPayout));
r.post("/admin/payouts/:id/reverse", authenticate, adminOnly, validate(payoutNoteSchema), a(payouts.adminReversePayout));
r.post("/admin/users/:id/verify-payout", authenticate, adminOnly, validate(verifiedFlagSchema), a(payouts.adminVerifyPayoutProfile));
r.get("/admin/faqs", authenticate, adminOnly, a(faqs.adminList));
r.post("/admin/faqs", authenticate, adminOnly, validate(faqSchema), a(faqs.adminCreate));
r.post("/admin/faqs/reorder", authenticate, adminOnly, validate(faqReorderSchema), a(faqs.adminReorder));
r.patch("/admin/faqs/:id", authenticate, adminOnly, validate(faqUpdateSchema), a(faqs.adminUpdate));
r.delete("/admin/faqs/:id", authenticate, adminOnly, a(faqs.adminDelete));
r.get("/admin/support", authenticate, adminOnly, a(support.adminList));
r.get("/admin/support/:kind/:id", authenticate, adminOnly, a(support.adminDetail));
r.post("/admin/support/:kind/:id/messages", authenticate, adminOnly, rateLimit("support-admin-message", positiveIntEnv("RATE_LIMIT_SUPPORT_ADMIN_MESSAGE", 60), positiveIntEnv("RATE_LIMIT_SUPPORT_ADMIN_MESSAGE_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(ticketReplySchema), a(support.adminReply));
r.post("/admin/support/:kind/:id", authenticate, adminOnly, validate(ticketUpdateSchema), a(support.adminPatch));
r.get("/admin/reports", authenticate, adminOnly, a(admin.listReports));
r.post("/admin/reports/:id/resolve", authenticate, adminOnly, validate(resolveReportSchema), a(admin.resolveReport));
r.get("/admin/reviews", authenticate, adminOnly, a(admin.listReviews));
r.post("/admin/email/test", authenticate, adminOnly, rateLimit("smtp-test", 3, 10 * 60000), validate(smtpTestSchema), a(admin.sendEmailTest));

// ---- Uploads (Cloudinary in production; local /uploads when Cloudinary is unset in development)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_TYPES[file.mimetype]) cb(null, true);
    else cb(null, false);
  },
});
r.post("/upload", authenticate, hostOnly, rateLimit("upload", positiveIntEnv("RATE_LIMIT_UPLOAD", 30), positiveIntEnv("RATE_LIMIT_UPLOAD_WINDOW_MS", 10 * 60_000, 86_400_000)), upload.single("file"), a(uploads.uploadImage));
r.post("/support/evidence", authenticate, rateLimit("support-evidence", positiveIntEnv("RATE_LIMIT_SUPPORT_EVIDENCE", 20), positiveIntEnv("RATE_LIMIT_SUPPORT_EVIDENCE_WINDOW_MS", 10 * 60_000, 86_400_000)), upload.single("file"), a(support.evidence));

export default r;
