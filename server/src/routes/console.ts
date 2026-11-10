import { Router } from "express";
import * as admin from "../controllers/admin.controller.js";
import * as payouts from "../controllers/payouts.controller.js";
import * as support from "../controllers/support.controller.js";
import * as faqs from "../controllers/faqs.controller.js";
import * as consoleAuth from "../controllers/console-auth.controller.js";
import * as consoleAdmins from "../controllers/console-admins.controller.js";
import { requireConsole, requirePermission, requireRecentAuth } from "../middleware/console-auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/error.js";
import { ApiError } from "../middleware/error.js";
import { cancelBooking } from "../services/bookings.js";
import { writeConsoleAudit } from "../services/console-audit.js";
import type { ConsoleRequest } from "../middleware/console-auth.js";
import { emailKey, ipKey, positiveIntEnv, rateLimit } from "../utils/rate-limit.js";
import { readCookie, STEP_COOKIE } from "../services/admin-auth.js";
import { sha256 } from "../utils/admin-secret.js";
import {
  faqReorderSchema,
  faqSchema,
  faqUpdateSchema,
  moderationSchema,
  payoutNoteSchema,
  payoutReferenceSchema,
  resolveReportSchema,
  smtpTestSchema,
  ticketReplySchema,
  ticketUpdateSchema,
  userStatusSchema,
  verifiedFlagSchema,
} from "../utils/validation.js";

const r = Router();
const a = asyncHandler;

const windowMs = positiveIntEnv("RATE_LIMIT_CONSOLE_LOGIN_WINDOW_MS", 15 * 60_000, 86_400_000);
function stepKey(req: import("express").Request) {
  const step = readCookie(req, STEP_COOKIE);
  return `${ipKey(req)}:${step ? sha256(step).slice(0, 12) : "none"}`;
}
const passwordLimit = rateLimit("console-password", positiveIntEnv("RATE_LIMIT_CONSOLE_LOGIN", 8), windowMs, {
  key: (req) => `${ipKey(req)}:${emailKey(req)}`,
  failClosed: true,
});
const otpLimit = rateLimit("console-otp", positiveIntEnv("RATE_LIMIT_CONSOLE_STEP", 8), windowMs, { key: stepKey, failClosed: true });
const resendLimit = rateLimit("console-otp-resend", positiveIntEnv("RATE_LIMIT_CONSOLE_RESEND", 5), windowMs, { key: stepKey, failClosed: true });
const questionLimit = rateLimit("console-question", positiveIntEnv("RATE_LIMIT_CONSOLE_STEP", 8), windowMs, { key: stepKey, failClosed: true });
const totpLimit = rateLimit("console-totp", positiveIntEnv("RATE_LIMIT_CONSOLE_STEP", 8), windowMs, { key: stepKey, failClosed: true });
const reauthLimit = rateLimit("console-reauth", positiveIntEnv("RATE_LIMIT_CONSOLE_STEP", 8), windowMs, { key: ipKey, failClosed: true });

function audited(action: string) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const current = req as ConsoleRequest;
      void writeConsoleAudit({
        action,
        adminId: current.adminAccount?.id,
        target: String(req.params.id ?? ""),
        outcome: "SUCCESS",
        req,
      });
    });
    next();
  };
}

r.post("/auth/start", passwordLimit, a(consoleAuth.start));
r.post("/auth/otp", otpLimit, a(consoleAuth.otp));
r.post("/auth/otp/resend", resendLimit, a(consoleAuth.resend));
r.post("/auth/question", questionLimit, a(consoleAuth.question));
r.post("/auth/totp", totpLimit, a(consoleAuth.totp));

r.use(requireConsole);

r.post("/auth/logout", a(consoleAuth.logout));

r.get("/auth/session", a(consoleAuth.session));
r.get("/auth/questions", consoleAuth.questions);
r.post("/auth/reauth", reauthLimit, a(consoleAuth.reauth));

r.get("/metrics", requirePermission("overview.read"), a(admin.metrics));
r.get("/users", requirePermission("users.read"), a(admin.listUsers));
r.post("/users/:id/status", requirePermission("users.status"), audited("user.status"), validate(userStatusSchema), a(admin.setUserStatus));
r.post("/users/:id/verify-host", requirePermission("hosts.verify"), audited("host.verify"), validate(verifiedFlagSchema), a(admin.setHostVerified));
r.get("/listings", requirePermission("listings.read"), a(admin.listListings));
r.post("/listings/:id/moderate", requirePermission("listings.moderate"), audited("listing.moderate"), validate(moderationSchema), a(admin.moderateListing));
r.get("/bookings", requirePermission("bookings.read"), a(admin.listBookings));
r.post("/bookings/:id/cancel", requirePermission("bookings.cancel"), requireRecentAuth, audited("booking.cancel"), a(async (req, res) => {
  const current = req as ConsoleRequest;
  if ((req.body as { confirm?: string }).confirm !== "CANCEL") throw new ApiError(400, "Confirm this cancellation.");
  await cancelBooking(req.params.id, current.adminAccount.id, true);
  res.json({ success: true, data: {} });
}));
r.get("/payments", requirePermission("payments.read"), a(admin.listPayments));
r.get("/payouts", requirePermission("payouts.read"), a(payouts.adminListPayouts));
r.get("/payout-beneficiaries", requirePermission("payouts.read"), a(payouts.adminListPayoutBeneficiaries));
r.post("/payouts/:id/reveal-destination", requirePermission("payouts.reveal"), requireRecentAuth, audited("payout.reveal"), a(payouts.adminRevealPayoutDestination));
r.get("/payouts/:id/destination-audits", requirePermission("payouts.read"), a(payouts.adminListPayoutDestinationAudits));
r.post("/payouts/:id/approve", requirePermission("payouts.write"), requireRecentAuth, audited("payout.approve"), a(payouts.adminApprovePayout));
r.post("/payouts/:id/reject", requirePermission("payouts.write"), requireRecentAuth, audited("payout.reject"), validate(payoutNoteSchema), a(payouts.adminRejectPayout));
r.post("/payouts/:id/processing", requirePermission("payouts.write"), requireRecentAuth, audited("payout.processing"), a(payouts.adminMarkPayoutProcessing));
r.post("/payouts/:id/mark-paid", requirePermission("payouts.write"), requireRecentAuth, audited("payout.mark_paid"), validate(payoutReferenceSchema), a(payouts.adminMarkPayoutPaid));
r.post("/payouts/:id/fail", requirePermission("payouts.write"), requireRecentAuth, audited("payout.fail"), validate(payoutNoteSchema), a(payouts.adminFailPayout));
r.post("/payouts/:id/reverse", requirePermission("payouts.write"), requireRecentAuth, audited("payout.reverse"), validate(payoutNoteSchema), a(payouts.adminReversePayout));
r.post("/users/:id/verify-payout", requirePermission("payouts.write"), requireRecentAuth, audited("payout.verify"), validate(verifiedFlagSchema), a(payouts.adminVerifyPayoutProfile));
r.get("/faqs", requirePermission("faqs.read"), a(faqs.adminList));
r.post("/faqs", requirePermission("faqs.write"), audited("faq.create"), validate(faqSchema), a(faqs.adminCreate));
r.post("/faqs/reorder", requirePermission("faqs.write"), audited("faq.reorder"), validate(faqReorderSchema), a(faqs.adminReorder));
r.patch("/faqs/:id", requirePermission("faqs.write"), audited("faq.update"), validate(faqUpdateSchema), a(faqs.adminUpdate));
r.delete("/faqs/:id", requirePermission("faqs.write"), audited("faq.delete"), a(faqs.adminDelete));
r.get("/support", requirePermission("support.read"), a(support.adminList));
r.get("/support/:kind/:id", requirePermission("support.read"), a(support.adminDetail));
r.post("/support/:kind/:id/messages", requirePermission("support.write"), audited("support.reply"), rateLimit("console-support-message", positiveIntEnv("RATE_LIMIT_SUPPORT_ADMIN_MESSAGE", 60), positiveIntEnv("RATE_LIMIT_SUPPORT_ADMIN_MESSAGE_WINDOW_MS", 60 * 60_000, 86_400_000)), validate(ticketReplySchema), a(support.adminReply));
r.post("/support/:kind/:id", requirePermission("support.write"), audited("support.patch"), validate(ticketUpdateSchema), a(support.adminPatch));
r.get("/reports", requirePermission("reports.read"), a(admin.listReports));
r.post("/reports/:id/resolve", requirePermission("reports.resolve"), audited("report.resolve"), validate(resolveReportSchema), a(admin.resolveReport));
r.get("/reviews", requirePermission("reviews.read"), a(admin.listReviews));
r.post("/email/test", requirePermission("*"), rateLimit("console-smtp-test", 3, 10 * 60_000), validate(smtpTestSchema), a(admin.sendEmailTest));

r.get("/staff", requirePermission("*"), a(consoleAdmins.list));
r.post("/staff", requirePermission("*"), requireRecentAuth, a(consoleAdmins.create));
r.post("/staff/:id/confirm", requirePermission("*"), requireRecentAuth, a(consoleAdmins.confirm));
r.post("/staff/:id/role", requirePermission("*"), requireRecentAuth, a(consoleAdmins.role));
r.post("/staff/:id/lock", requirePermission("*"), requireRecentAuth, a(consoleAdmins.lock));
r.get("/audits", requirePermission("overview.read"), a(consoleAdmins.audits));
r.post("/account/password", requireRecentAuth, a(consoleAdmins.updatePassword));
r.get("/settings", requirePermission("overview.read"), a(consoleAdmins.readSettings));
r.patch("/settings", requirePermission("*"), requireRecentAuth, audited("settings.update"), a(consoleAdmins.updateSettings));

export default r;
