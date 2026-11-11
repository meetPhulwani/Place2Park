import { Router } from "express";
import { checkoutSignature, webhookSignature } from "../services/payments.js";
import { env } from "../config/env.js";
import { e2eHooksEnabled } from "./e2e-gate.js";
import { readTestCode } from "./e2e-mailbox.js";
import { bindE2eCapture } from "./e2e-payments.js";
import {
  attachRetainedHistory,
  bookingPaymentState,
  createRequestedPayout,
  createReviewListing,
  e2eActors,
  e2eTotp,
  expireConsoleSessions,
  expireSignupCode,
  releaseSignupResend,
  retainedRecords,
} from "./e2e-fixtures.js";

const hidden = { success: false, message: "Not found." };

export const e2eHookRouter = Router();

e2eHookRouter.use((req, res, next) => {
  if (!e2eHooksEnabled() || req.header("x-e2e-hook") !== "1") {
    res.status(404).json(hidden);
    return;
  }
  next();
});

e2eHookRouter.get("/actors", (_req, res) => {
  res.json({ success: true, data: e2eActors() });
});

e2eHookRouter.get("/totp", (req, res) => {
  const role = typeof req.query.role === "string" ? req.query.role : "admin";
  res.json({ success: true, data: { code: e2eTotp(role) } });
});

e2eHookRouter.get("/mailbox", (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email : "";
  const code = readTestCode(email);
  if (!code) {
    res.status(404).json({ success: false, message: "No code is waiting." });
    return;
  }
  res.json({ success: true, data: { code } });
});

e2eHookRouter.post("/otp/expire", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  await expireSignupCode(email);
  res.json({ success: true, data: {} });
});

e2eHookRouter.post("/otp/release", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  await releaseSignupResend(email);
  res.json({ success: true, data: {} });
});

e2eHookRouter.post("/session/expire", async (_req, res) => {
  await expireConsoleSessions();
  res.json({ success: true, data: {} });
});

e2eHookRouter.post("/fixtures/listing", async (_req, res) => {
  const listing = await createReviewListing();
  if (!listing) {
    res.status(404).json(hidden);
    return;
  }
  res.status(201).json({ success: true, data: listing });
});

e2eHookRouter.post("/fixtures/payout", async (_req, res) => {
  const payout = await createRequestedPayout();
  if (!payout) {
    res.status(404).json(hidden);
    return;
  }
  res.status(201).json({ success: true, data: payout });
});

e2eHookRouter.post("/fixtures/history", async (req, res) => {
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  const history = await attachRetainedHistory(userId);
  if (!history) {
    res.status(404).json(hidden);
    return;
  }
  res.status(201).json({ success: true, data: history });
});

e2eHookRouter.get("/retention/:userId", async (req, res) => {
  res.json({ success: true, data: await retainedRecords(req.params.userId) });
});

e2eHookRouter.get("/booking/:id", async (req, res) => {
  res.json({ success: true, data: await bookingPaymentState(req.params.id) });
});

e2eHookRouter.get("/checkout-signature", (req, res) => {
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId : "";
  const paymentId = typeof req.query.paymentId === "string" ? req.query.paymentId : "";
  const order = bindE2eCapture(orderId, paymentId);
  if (!order) {
    res.status(404).json(hidden);
    return;
  }
  res.json({
    success: true,
    data: { signature: checkoutSignature(orderId, paymentId, env.RAZORPAY_KEY_SECRET) },
  });
});

e2eHookRouter.post("/webhook-signature", (req, res) => {
  const raw = typeof req.body?.raw === "string" ? req.body.raw : "";
  if (!raw) {
    res.status(400).json({ success: false, message: "Missing body." });
    return;
  }
  res.json({ success: true, data: { signature: webhookSignature(raw, env.RAZORPAY_WEBHOOK_SECRET) } });
});
