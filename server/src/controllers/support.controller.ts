import type { Response } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { SupportEvidence } from "../models/index.js";
import { UPLOAD_ERROR_MESSAGE, storeListingImage } from "../services/media.js";
import {
  adminMessage,
  adminUpdate,
  createSupportTicket,
  createUserReport,
  getCaseForAdmin,
  getCaseForUser,
  listForAdmin,
  listMine,
  listReportableBookings,
  parseKind,
  replyAsUser,
  type TicketKind,
} from "../services/support.js";
import type { TicketStatus } from "../utils/support-constants.js";

export async function bookings(req: AuthedRequest, res: Response) {
  const rows = await listReportableBookings(req.userId);
  res.json({ success: true, data: { bookings: rows } });
}

export async function createReport(req: AuthedRequest, res: Response) {
  const data = await createUserReport(req.userId, req.body);
  res.status(201).json({ success: true, data });
}

export async function createTicket(req: AuthedRequest, res: Response) {
  const data = await createSupportTicket(req.userId, req.body);
  res.status(201).json({ success: true, data });
}

export async function mine(req: AuthedRequest, res: Response) {
  const cases = await listMine(req.userId);
  res.json({ success: true, data: { cases } });
}

export async function detail(req: AuthedRequest, res: Response) {
  const kind = parseKind(String(req.params.kind));
  const data = await getCaseForUser(req.userId, kind, String(req.params.id));
  res.json({ success: true, data });
}

export async function reply(req: AuthedRequest, res: Response) {
  const kind = parseKind(String(req.params.kind));
  const data = await replyAsUser(req.userId, kind, String(req.params.id), String(req.body?.body ?? ""));
  res.json({ success: true, data });
}

export async function evidence(req: AuthedRequest, res: Response) {
  const file = req.file;
  if (!file?.buffer) throw new ApiError(400, UPLOAD_ERROR_MESSAGE);
  const stored = await storeListingImage(
    { buffer: file.buffer, mimetype: file.mimetype, size: file.size },
    { hostId: req.userId }
  );
  const row = await SupportEvidence.create({
    userId: req.userId,
    url: stored.url,
    publicId: stored.publicId ?? "",
  });
  res.status(201).json({ success: true, data: { id: String(row._id), url: stored.url } });
}

export async function adminList(req: AuthedRequest, res: Response) {
  const cases = await listForAdmin({
    q: typeof req.query.q === "string" ? req.query.q : "",
    kind: (typeof req.query.kind === "string" ? req.query.kind : "") as TicketKind | "",
    status: typeof req.query.status === "string" ? req.query.status : "",
    category: typeof req.query.category === "string" ? req.query.category : "",
    from: typeof req.query.from === "string" ? req.query.from : "",
    to: typeof req.query.to === "string" ? req.query.to : "",
  });
  res.json({ success: true, data: { cases } });
}

export async function adminDetail(req: AuthedRequest, res: Response) {
  const data = await getCaseForAdmin(parseKind(String(req.params.kind)), String(req.params.id));
  res.json({ success: true, data });
}

export async function adminReply(req: AuthedRequest, res: Response) {
  const visibility = req.body?.visibility === "INTERNAL" ? "INTERNAL" : "PUBLIC";
  const data = await adminMessage(
    req.userId,
    parseKind(String(req.params.kind)),
    String(req.params.id),
    String(req.body?.body ?? ""),
    visibility
  );
  res.json({ success: true, data });
}

export async function adminPatch(req: AuthedRequest, res: Response) {
  const data = await adminUpdate(req.userId, parseKind(String(req.params.kind)), String(req.params.id), {
    status: req.body?.status as TicketStatus | undefined,
    priority: typeof req.body?.priority === "string" ? req.body.priority : undefined,
    assigneeId: req.body?.assigneeId === null ? null : typeof req.body?.assigneeId === "string" ? req.body.assigneeId : undefined,
    note: typeof req.body?.note === "string" ? req.body.note : undefined,
  });
  res.json({ success: true, data });
}
