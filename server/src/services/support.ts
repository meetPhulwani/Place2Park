import crypto from "node:crypto";
import mongoose from "mongoose";
import { Booking, ParkingSpace, Payment, SupportEvidence, SupportTicket, TicketAudit, TicketMessage, User, UserReport } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { notify } from "./notify.js";
import { notifyAdmin } from "./email.js";
import {
  ACTIVE_TICKET_STATUSES,
  DRIVER_REPORT_CATEGORIES,
  HOST_REPORT_CATEGORIES,
  canTransitionTicket,
  statusNeedsNote,
  SUPPORT_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketStatus,
} from "../utils/support-constants.js";
import { boundedText, dayQuery } from "../utils/request-input.js";

const ELIGIBLE_BOOKING = ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"];
const MAX_EVIDENCE = 4;
const REF_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type TicketKind = "USER_REPORT" | "SUPPORT";

function reference(prefix: "UR" | "ST") {
  let body = "";
  for (let i = 0; i < 8; i++) body += REF_CHARS[crypto.randomInt(REF_CHARS.length)];
  return `${prefix}-${body}`;
}

export function partiesFromBooking(booking: { userId: unknown; hostId: unknown }, actorId: string) {
  const driverId = String(booking.userId);
  const hostId = String(booking.hostId);
  if (driverId === hostId) throw new ApiError(400, "This booking has no other person to report.");
  if (actorId === driverId) {
    return { direction: "DRIVER_REPORTS_HOST" as const, reportedUserId: hostId, categories: DRIVER_REPORT_CATEGORIES };
  }
  if (actorId === hostId) {
    return { direction: "HOST_REPORTS_DRIVER" as const, reportedUserId: driverId, categories: HOST_REPORT_CATEGORIES };
  }
  throw new ApiError(404, "Booking not found.");
}

async function claimEvidence(userId: string, ids: string[]) {
  if (ids.length > MAX_EVIDENCE) throw new ApiError(400, "Attach up to 4 images.");
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new ApiError(400, "Remove duplicate evidence.");
  const rows = await SupportEvidence.find({
    _id: { $in: unique.filter((id) => mongoose.isValidObjectId(id)) },
    userId,
    attached: false,
  });
  if (rows.length !== unique.length) throw new ApiError(400, "One of those images is missing or already used.");
  await SupportEvidence.updateMany({ _id: { $in: rows.map((row) => row._id) } }, { $set: { attached: true } });
  return rows.map((row) => ({ url: row.url, publicId: row.publicId }));
}

async function audit(kind: TicketKind, ticketId: unknown, actorId: string, action: string, fromStatus = "", toStatus = "", note = "") {
  await TicketAudit.create({ ticketKind: kind, ticketId, actorId, action, fromStatus, toStatus, note: note.slice(0, 2000) });
}

async function tellOwner(userId: string, title: string, body: string, data: Record<string, unknown>) {
  await notify(userId, "TICKET_UPDATE", title, body, data);
}

async function tellAdmins(input: { subject: string; text: string }) {
  if (process.argv.includes("--test")) return;
  await notifyAdmin(input);
}

export async function listReportableBookings(userId: string) {
  const bookings = await Booking.find({
    $or: [{ userId }, { hostId: userId }],
    status: { $in: ELIGIBLE_BOOKING },
  })
    .sort({ start: -1 })
    .limit(40)
    .select("code start end status userId hostId spaceId");
  const people = await User.find({
    _id: { $in: bookings.flatMap((booking) => [booking.userId, booking.hostId]) },
  }).select("name");
  const names = new Map(people.map((person) => [String(person._id), person.name]));
  const spaces = await ParkingSpace.find({ _id: { $in: bookings.map((booking) => booking.spaceId) } }).select("title");
  const titles = new Map(spaces.map((space) => [String(space._id), space.title]));
  return bookings
    .filter((booking) => String(booking.userId) !== String(booking.hostId))
    .map((booking) => {
      const mine = partiesFromBooking(booking, userId);
      return {
        id: String(booking._id),
        code: booking.code,
        start: booking.start,
        end: booking.end,
        status: booking.status,
        spaceTitle: titles.get(String(booking.spaceId)) ?? "Parking",
        direction: mine.direction,
        reportedUserId: mine.reportedUserId,
        reportedName: names.get(mine.reportedUserId) ?? "Place2Park user",
      };
    });
}

export async function createUserReport(
  actorId: string,
  input: {
    bookingId: string;
    reportedUserId?: string;
    category: string;
    description: string;
    incidentAt?: string | null;
    evidenceIds?: string[];
  }
) {
  const booking = await Booking.findById(input.bookingId).select("userId hostId status code");
  if (!booking || !ELIGIBLE_BOOKING.includes(booking.status)) throw new ApiError(404, "Booking not found.");
  const parties = partiesFromBooking(booking, actorId);
  if (!(parties.categories as readonly string[]).includes(input.category)) {
    throw new ApiError(400, "Choose a category for this report.");
  }
  if (input.reportedUserId && input.reportedUserId !== parties.reportedUserId) {
    throw new ApiError(400, "That person is not part of this booking.");
  }
  const description = input.description.trim();
  if (description.length < 20 || description.length > 2000) {
    throw new ApiError(400, "Describe what happened in 20 to 2000 characters.");
  }
  let incidentAt: Date | undefined;
  if (input.incidentAt) {
    incidentAt = new Date(input.incidentAt);
    if (Number.isNaN(incidentAt.getTime()) || incidentAt.getTime() > Date.now() + 5 * 60_000) {
      throw new ApiError(400, "Enter an incident time that has already happened.");
    }
  }
  const duplicate = await UserReport.exists({
    reporterId: actorId,
    reportedUserId: parties.reportedUserId,
    bookingId: booking._id,
    category: input.category,
    status: { $in: ACTIVE_TICKET_STATUSES },
  });
  if (duplicate) throw new ApiError(409, "You already have an open report for this incident.");
  const evidence = await claimEvidence(actorId, input.evidenceIds ?? []);
  const doc = await UserReport.create({
    reference: reference("UR"),
    reporterId: actorId,
    reportedUserId: parties.reportedUserId,
    bookingId: booking._id,
    direction: parties.direction,
    category: input.category,
    description,
    incidentAt,
    evidence,
  });
  await audit("USER_REPORT", doc._id, actorId, "created", "", "OPEN");
  await tellOwner(actorId, "Report received", `We received ${doc.reference} and will review it.`, { reference: doc.reference, kind: "USER_REPORT" });
  await tellAdmins({ subject: `New user report ${doc.reference}`, text: `Booking ${booking.code}. Category ${input.category}.` });
  return { id: String(doc._id), reference: doc.reference, status: doc.status };
}

export async function createSupportTicket(
  actorId: string,
  input: {
    category: string;
    subject: string;
    description: string;
    bookingId?: string;
    paymentId?: string;
    evidenceIds?: string[];
  }
) {
  const subject = input.subject.trim();
  const description = input.description.trim();
  if (subject.length < 4 || subject.length > 120) throw new ApiError(400, "Enter a subject between 4 and 120 characters.");
  if (description.length < 20 || description.length > 2000) {
    throw new ApiError(400, "Describe the problem in 20 to 2000 characters.");
  }
  let bookingId: mongoose.Types.ObjectId | undefined;
  if (input.bookingId) {
    const booking = await Booking.findById(input.bookingId).select("userId hostId");
    if (!booking) throw new ApiError(404, "Booking not found.");
    partiesFromBooking(booking, actorId);
    bookingId = booking._id;
  }
  let paymentId: mongoose.Types.ObjectId | undefined;
  if (input.paymentId) {
    if (!bookingId) throw new ApiError(400, "Choose the booking this payment belongs to.");
    const payment = await Payment.findById(input.paymentId).select("bookingId");
    if (!payment || String(payment.bookingId) !== String(bookingId)) throw new ApiError(400, "That payment does not match the booking.");
    paymentId = payment._id;
  }
  const evidence = await claimEvidence(actorId, input.evidenceIds ?? []);
  const doc = await SupportTicket.create({
    reference: reference("ST"),
    userId: actorId,
    category: input.category,
    subject,
    description,
    bookingId,
    paymentId,
    evidence,
  });
  await audit("SUPPORT", doc._id, actorId, "created", "", "OPEN");
  await tellOwner(actorId, "Support request received", `We received ${doc.reference}: ${subject}.`, { reference: doc.reference, kind: "SUPPORT" });
  await tellAdmins({ subject: `New support ticket ${doc.reference}`, text: `${subject}\nCategory ${input.category}.` });
  return { id: String(doc._id), reference: doc.reference, status: doc.status };
}

function ownerId(kind: TicketKind, doc: { reporterId?: unknown; userId?: unknown }) {
  return String(kind === "USER_REPORT" ? doc.reporterId : doc.userId);
}

async function loadCase(kind: TicketKind, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "Ticket not found.");
  const doc = kind === "USER_REPORT" ? await UserReport.findById(id) : await SupportTicket.findById(id);
  if (!doc) throw new ApiError(404, "Ticket not found.");
  return doc;
}

export async function listMine(userId: string) {
  const [reports, tickets] = await Promise.all([
    UserReport.find({ reporterId: userId }).sort({ updatedAt: -1 }).limit(50),
    SupportTicket.find({ userId }).sort({ updatedAt: -1 }).limit(50),
  ]);
  return [
    ...reports.map((doc) => summary("USER_REPORT", doc)),
    ...tickets.map((doc) => summary("SUPPORT", doc)),
  ].sort((a, b) => +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0));
}

function summary(kind: TicketKind, doc: {
  _id: unknown;
  reference: string;
  category: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
  subject?: string;
  direction?: string;
  resolutionNote?: string;
}) {
  return {
    id: String(doc._id),
    kind,
    reference: doc.reference,
    type: kind === "USER_REPORT" ? "User report" : "Support ticket",
    category: doc.category,
    subject: doc.subject ?? doc.direction ?? "",
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    resolutionNote: doc.resolutionNote ?? "",
  };
}

export async function getCaseForUser(userId: string, kind: TicketKind, id: string) {
  const doc = await loadCase(kind, id);
  if (ownerId(kind, doc) !== userId) throw new ApiError(404, "Ticket not found.");
  return present(kind, doc, false);
}

export async function getCaseForAdmin(kind: TicketKind, id: string) {
  const doc = await loadCase(kind, id);
  const presented = await present(kind, doc, true);
  const booking = doc.bookingId ? await Booking.findById(doc.bookingId).select("code status start end totalAmount userId hostId spaceId") : null;
  const payment = "paymentId" in doc && doc.paymentId ? await Payment.findById(doc.paymentId).select("status amount currency") : null;
  const userIds = [ownerId(kind, doc)];
  if (kind === "USER_REPORT" && "reportedUserId" in doc) userIds.push(String(doc.reportedUserId));
  const users = await User.find({ _id: { $in: userIds } }).select("name email role status");
  const person = (id: string) => {
    const user = users.find((row) => String(row._id) === id);
    return user ? { id: String(user._id), name: user.name, email: user.email, role: user.role, status: user.status } : null;
  };
  const audits = await TicketAudit.find({ ticketKind: kind, ticketId: doc._id }).sort({ createdAt: 1 });
  return {
    ...presented,
    booking: booking
      ? { id: String(booking._id), code: booking.code, status: booking.status, start: booking.start, end: booking.end, totalAmount: booking.totalAmount }
      : null,
    payment: payment ? { id: String(payment._id), status: payment.status, amount: payment.amount, currency: payment.currency } : null,
    people: {
      reporter: kind === "USER_REPORT" ? person(ownerId(kind, doc)) : null,
      reported: kind === "USER_REPORT" && "reportedUserId" in doc ? person(String(doc.reportedUserId)) : null,
      owner: kind === "SUPPORT" ? person(ownerId(kind, doc)) : null,
    },
    audit: audits.map((row) => row.toJSON()),
    priority: doc.priority,
    assigneeId: doc.assigneeId ? String(doc.assigneeId) : null,
    resolutionNote: doc.resolutionNote,
  };
}

async function present(kind: TicketKind, doc: {
  _id: unknown;
  toJSON: () => Record<string, unknown>;
  reference: string;
  status: string;
  category: string;
}, admin: boolean) {
  const messages = await TicketMessage.find({ ticketKind: kind, ticketId: doc._id }).sort({ createdAt: 1 });
  const json = doc.toJSON();
  return {
    ...summary(kind, doc as never),
    ...json,
    messages: messages.filter((message) => admin || message.visibility === "PUBLIC").map((message) => message.toJSON()),
  };
}

export async function replyAsUser(userId: string, kind: TicketKind, id: string, body: string) {
  const text = body.trim();
  if (text.length < 2 || text.length > 2000) throw new ApiError(400, "Write a reply between 2 and 2000 characters.");
  const doc = await loadCase(kind, id);
  if (ownerId(kind, doc) !== userId) throw new ApiError(404, "Ticket not found.");
  if (doc.status !== "AWAITING_USER") throw new ApiError(409, "This ticket is not waiting for your reply.");
  await TicketMessage.create({ ticketKind: kind, ticketId: doc._id, authorId: userId, visibility: "PUBLIC", body: text });
  const from = doc.status;
  doc.status = "UNDER_REVIEW";
  await doc.save();
  await audit(kind, doc._id, userId, "user_reply", from, "UNDER_REVIEW");
  return { status: doc.status };
}

export async function adminMessage(actorId: string, kind: TicketKind, id: string, body: string, visibility: "PUBLIC" | "INTERNAL") {
  const text = body.trim();
  if (text.length < 2 || text.length > 2000) throw new ApiError(400, "Write a note between 2 and 2000 characters.");
  const doc = await loadCase(kind, id);
  await TicketMessage.create({ ticketKind: kind, ticketId: doc._id, authorId: actorId, visibility, body: text });
  await audit(kind, doc._id, actorId, visibility === "INTERNAL" ? "internal_note" : "admin_reply");
  if (visibility === "PUBLIC") {
    await tellOwner(ownerId(kind, doc), "New reply on your ticket", `${doc.reference}: ${text.slice(0, 240)}`, { reference: doc.reference, kind });
  }
  return { ok: true };
}

export async function adminUpdate(
  actorId: string,
  kind: TicketKind,
  id: string,
  input: { status?: TicketStatus; priority?: string; assigneeId?: string | null; note?: string }
) {
  const doc = await loadCase(kind, id);
  const note = (input.note ?? "").trim();
  if (input.assigneeId) {
    const assignee = await User.findById(input.assigneeId).select("role");
    if (!assignee || assignee.role !== "ADMIN") throw new ApiError(400, "Assign the ticket to an admin.");
    doc.assigneeId = assignee._id;
    await audit(kind, doc._id, actorId, "assigned", "", "", String(assignee._id));
  } else if (input.assigneeId === null) {
    doc.assigneeId = undefined;
    await audit(kind, doc._id, actorId, "unassigned");
  }
  if (input.priority && (TICKET_PRIORITIES as readonly string[]).includes(input.priority)) {
    doc.priority = input.priority as (typeof TICKET_PRIORITIES)[number];
  }
  if (input.status && input.status !== doc.status) {
    if (!canTransitionTicket(doc.status, input.status)) throw new ApiError(409, "That status change is not allowed.");
    if (statusNeedsNote(input.status) && note.length < 8) {
      throw new ApiError(400, "Add a resolution note of at least 8 characters.");
    }
    const from = doc.status;
    doc.status = input.status;
    if (note) doc.resolutionNote = note;
    await audit(kind, doc._id, actorId, "status", from, input.status, note);
    const title =
      input.status === "AWAITING_USER"
        ? "We need a bit more information"
        : input.status === "RESOLVED" || input.status === "CLOSED"
          ? "Your ticket is resolved"
          : input.status === "REJECTED"
            ? "Your ticket was closed without action"
            : "Your ticket status changed";
    await tellOwner(ownerId(kind, doc), title, `${doc.reference} is now ${input.status.replaceAll("_", " ").toLowerCase()}.${note ? ` ${note}` : ""}`, {
      reference: doc.reference,
      kind,
      status: input.status,
    });
  } else if (note && statusNeedsNote(doc.status)) {
    doc.resolutionNote = note;
  }
  await doc.save();
  return { status: doc.status, priority: doc.priority };
}

export async function listForAdmin(query: {
  q?: string;
  kind?: TicketKind | "";
  status?: string;
  category?: string;
  from?: string;
  to?: string;
}) {
  const filter: Record<string, unknown> = {};
  const categories = new Set<string>([...DRIVER_REPORT_CATEGORIES, ...HOST_REPORT_CATEGORIES, ...SUPPORT_CATEGORIES]);
  if (query.status && (TICKET_STATUSES as readonly string[]).includes(query.status)) filter.status = query.status;
  if (query.category && categories.has(query.category)) filter.category = query.category;
  const from = dayQuery(query.from);
  const to = dayQuery(query.to, true);
  if (from || to) {
    filter.createdAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }
  const q = boundedText(query.q, 120);
  if (q) {
    if (/^(UR|ST)-/i.test(q)) filter.reference = q.toUpperCase();
    else if (q.startsWith("PK-")) {
      const booking = await Booking.findOne({ code: q.toUpperCase() }).select("_id");
      filter.bookingId = booking?._id ?? new mongoose.Types.ObjectId();
    } else if (q.includes("@")) {
      const user = await User.findOne({ email: q.toLowerCase() }).select("_id");
      const id = user?._id ?? new mongoose.Types.ObjectId();
      filter.$or = [{ reporterId: id }, { reportedUserId: id }, { userId: id }];
    } else if (mongoose.isValidObjectId(q)) {
      filter.$or = [{ _id: q }, { bookingId: q }, { reporterId: q }, { reportedUserId: q }, { userId: q }];
    } else {
      filter.reference = q.toUpperCase();
    }
  }
  const wantReports = query.kind !== "SUPPORT";
  const wantTickets = query.kind !== "USER_REPORT";
  const [reports, tickets] = await Promise.all([
    wantReports ? UserReport.find(filter).sort({ updatedAt: -1 }).limit(100) : [],
    wantTickets ? SupportTicket.find(filter).sort({ updatedAt: -1 }).limit(100) : [],
  ]);
  return [...reports.map((doc) => summary("USER_REPORT", doc)), ...tickets.map((doc) => summary("SUPPORT", doc))].sort(
    (a, b) => +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0)
  );
}

export function parseKind(value: string): TicketKind {
  if (value === "USER_REPORT" || value === "SUPPORT") return value;
  throw new ApiError(404, "Ticket not found.");
}
