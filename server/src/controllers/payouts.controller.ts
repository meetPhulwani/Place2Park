import type { Response } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import {
  approveHostPayout,
  failHostPayout,
  listAdminPayoutAudits,
  listAdminPayouts,
  listPayoutBeneficiaries,
  markHostPayoutPaid,
  markHostPayoutProcessing,
  revealAdminPayoutAccount,
  rejectHostPayout,
  requestHostPayout,
  reverseHostPayout,
  createHostPayoutDetails,
  getHostPayoutDetails,
  saveHostPayoutProfile,
  updateHostPayoutDetails,
  summarizeHostEarnings,
  verifyHostPayoutProfile,
} from "../services/payouts.js";

export async function getPayoutProfile(req: AuthedRequest, res: Response) {
  const payoutDetails = await getHostPayoutDetails(req.userId);
  res.json({ success: true, data: { payoutProfile: payoutDetails, payoutDetails } });
}

export async function getPayoutDetails(req: AuthedRequest, res: Response) {
  const payoutDetails = await getHostPayoutDetails(req.userId);
  res.json({ success: true, data: { payoutDetails } });
}

export async function createPayoutDetails(req: AuthedRequest, res: Response) {
  const payoutDetails = await createHostPayoutDetails(req.userId, req.body);
  res.status(201).json({ success: true, data: { payoutDetails } });
}

export async function patchPayoutDetails(req: AuthedRequest, res: Response) {
  const payoutDetails = await updateHostPayoutDetails(req.userId, req.body);
  res.json({ success: true, data: { payoutDetails } });
}

export async function updatePayoutProfile(req: AuthedRequest, res: Response) {
  const profile = await saveHostPayoutProfile(req.userId, req.body);
  res.json({ success: true, data: { payoutProfile: profile } });
}

export async function requestPayout(req: AuthedRequest, res: Response) {
  const payout = await requestHostPayout(req.userId);
  res.status(201).json({ success: true, data: { payout } });
}

export async function hostEarnings(req: AuthedRequest, res: Response) {
  const data = await summarizeHostEarnings(req.userId);
  res.json({
    success: true,
    data: {
      ...data,
      // Backward-compatible aliases used by the existing earnings page.
      total: data.calculatedCompleted,
      pending: data.upcomingEarnings,
      pendingCount: data.upcomingCount,
      thisMonth: data.thisMonthCalculated,
    },
  });
}

export async function adminListPayouts(req: AuthedRequest, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const payouts = await listAdminPayouts(status);
  res.json({ success: true, data: { payouts } });
}

export async function adminListPayoutBeneficiaries(_req: AuthedRequest, res: Response) {
  const beneficiaries = await listPayoutBeneficiaries();
  res.json({ success: true, data: { beneficiaries } });
}

export async function adminMarkPayoutProcessing(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const payout = await markHostPayoutProcessing(req.userId, req.params.id);
  res.json({ success: true, data: { payout } });
}

export async function adminRevealPayoutDestination(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const destination = await revealAdminPayoutAccount(req.userId, req.params.id);
  res.json({ success: true, data: { destination } });
}

export async function adminListPayoutDestinationAudits(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const audits = await listAdminPayoutAudits(req.userId, req.params.id);
  res.json({ success: true, data: { audits } });
}

export async function adminVerifyPayoutProfile(req: AuthedRequest, res: Response) {
  const verified = (req.body as { verified?: boolean }).verified;
  if (typeof verified !== "boolean") throw new ApiError(400, "Invalid input.");
  const profile = await verifyHostPayoutProfile(req.userId, req.params.id, verified);
  res.json({ success: true, data: { payoutProfile: profile } });
}

export async function adminApprovePayout(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const payout = await approveHostPayout(req.userId, req.params.id);
  res.json({ success: true, data: { payout } });
}

export async function adminRejectPayout(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const note = typeof (req.body as { note?: string }).note === "string" ? (req.body as { note: string }).note : "";
  const payout = await rejectHostPayout(req.userId, req.params.id, note);
  res.json({ success: true, data: { payout } });
}

export async function adminMarkPayoutPaid(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const body = req.body as { reference?: string; transferDate?: string };
  const reference = String(body.reference ?? "");
  const payout = await markHostPayoutPaid(req.userId, req.params.id, reference, body.transferDate);
  res.json({ success: true, data: { payout } });
}

export async function adminFailPayout(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const note = typeof (req.body as { note?: string }).note === "string" ? (req.body as { note: string }).note : "";
  const payout = await failHostPayout(req.userId, req.params.id, note);
  res.json({ success: true, data: { payout } });
}

export async function adminReversePayout(req: AuthedRequest, res: Response) {
  if (req.userRole !== "ADMIN") throw new ApiError(403, "You don't have access to this.");
  const note = typeof (req.body as { note?: string }).note === "string" ? (req.body as { note: string }).note : "";
  const payout = await reverseHostPayout(req.userId, req.params.id, note);
  res.json({ success: true, data: { payout } });
}
