import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Booking, Notification, SupportEvidence, TicketMessage, User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { canTransitionTicket } from "../utils/support-constants.js";
import { validateUploadFile } from "./media.js";
import {
  adminMessage,
  adminUpdate,
  createSupportTicket,
  createUserReport,
  getCaseForUser,
  replyAsUser,
} from "./support.js";

let memory: MongoMemoryServer;
let driverId: mongoose.Types.ObjectId;
let hostId: mongoose.Types.ObjectId;
let strangerId: mongoose.Types.ObjectId;
let adminId: mongoose.Types.ObjectId;
let bookingId: mongoose.Types.ObjectId;

async function user(name: string, role: "DRIVER" | "HOST" | "ADMIN") {
  const doc = await User.create({ name, email: `${name}.${Date.now()}@example.com`, role });
  return doc._id;
}

async function booking() {
  const doc = await Booking.create({
    code: `PK-${Date.now().toString(36).toUpperCase()}`,
    userId: driverId,
    hostId,
    spaceId: new mongoose.Types.ObjectId(),
    start: new Date("2026-11-01T10:00:00.000Z"),
    end: new Date("2026-11-01T12:00:00.000Z"),
    durationMins: 120,
    status: "COMPLETED",
    accessCode: "123456",
    baseAmount: 7000,
    serviceFee: 350,
    totalAmount: 7350,
    platformFee: 350,
    hostEarning: 6300,
  });
  return doc._id;
}

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-support"));
  driverId = await user("Driver", "DRIVER");
  hostId = await user("Host", "HOST");
  strangerId = await user("Stranger", "DRIVER");
  adminId = await user("Admin", "ADMIN");
  bookingId = await booking();
});

after(async () => {
  await mongoose.disconnect();
  await memory.stop();
});

describe("user reports", () => {
  it("lets a driver report the host on their booking", async () => {
    const created = await createUserReport(String(driverId), {
      bookingId: String(bookingId),
      category: "NO_ACCESS",
      description: "The gate code did not work and the host did not answer.",
    });
    assert.match(created.reference, /^UR-/);
    const note = await Notification.findOne({ userId: driverId, "data.reference": created.reference });
    assert.equal(note?.title, "Report received");
    assert.equal((await User.findById(hostId))?.status, "ACTIVE");
    const seen = await getCaseForUser(String(driverId), "USER_REPORT", created.id);
    assert.equal(seen.status, "OPEN");
  });

  it("lets a host report the driver on the same booking", async () => {
    const created = await createUserReport(String(hostId), {
      bookingId: String(bookingId),
      category: "PROPERTY_DAMAGE",
      description: "The bumper scraped the pillar and the driver left without telling me.",
    });
    assert.equal(created.status, "OPEN");
  });

  it("rejects a report from someone who is not on the booking", async () => {
    await assert.rejects(
      () =>
        createUserReport(String(strangerId), {
          bookingId: String(bookingId),
          category: "OTHER",
          description: "I am not part of this booking but I want to file one anyway.",
        }),
      (err: unknown) => err instanceof ApiError && err.status === 404
    );
  });

  it("rejects a reported user who is not the other booking participant", async () => {
    await assert.rejects(
      () =>
        createUserReport(String(driverId), {
          bookingId: String(bookingId),
          reportedUserId: String(strangerId),
          category: "OTHER",
          description: "Trying to point this report at someone else entirely here.",
        }),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
  });

  it("rejects a second active report for the same incident", async () => {
    await assert.rejects(
      () =>
        createUserReport(String(driverId), {
          bookingId: String(bookingId),
          category: "NO_ACCESS",
          description: "The gate code still does not work after the first report.",
        }),
      (err: unknown) => err instanceof ApiError && err.status === 409
    );
  });

  it("hides another person's ticket", async () => {
    const created = await createUserReport(String(hostId), {
      bookingId: String(bookingId),
      category: "OVERSTAY",
      description: "The car was still in the bay an hour after the booking ended.",
    });
    await assert.rejects(
      () => getCaseForUser(String(driverId), "USER_REPORT", created.id),
      (err: unknown) => err instanceof ApiError && err.status === 404
    );
  });

  it("does not attach another user's evidence", async () => {
    const row = await SupportEvidence.create({ userId: strangerId, url: "https://res.cloudinary.com/demo/image/upload/x.jpg", publicId: "place2park/listings/x" });
    await assert.rejects(
      () =>
        createUserReport(String(driverId), {
          bookingId: String(bookingId),
          category: "MISLEADING_PHOTOS",
          description: "The photos show a covered bay but the space is open to the rain.",
          evidenceIds: [String(row._id)],
        }),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
  });
});

describe("support tickets", () => {
  it("creates a platform ticket without a booking", async () => {
    const created = await createSupportTicket(String(driverId), {
      category: "ACCOUNT",
      subject: "Cannot sign in",
      description: "The verification email never arrives at my inbox after three tries.",
    });
    assert.match(created.reference, /^ST-/);
  });

  it("rejects a booking the caller does not belong to", async () => {
    await assert.rejects(
      () =>
        createSupportTicket(String(strangerId), {
          category: "BOOKING",
          subject: "Wrong booking",
          description: "I want help with a booking that is not mine at all.",
          bookingId: String(bookingId),
        }),
      (err: unknown) => err instanceof ApiError && err.status === 404
    );
  });

  it("lets the owner reply only when more information was requested", async () => {
    const created = await createSupportTicket(String(hostId), {
      category: "PAYOUTS",
      subject: "Payout missing",
      description: "Last week's completed bookings are still not in my payout balance.",
    });
    await assert.rejects(
      () => replyAsUser(String(hostId), "SUPPORT", created.id, "Any update?"),
      (err: unknown) => err instanceof ApiError && err.status === 409
    );
    await adminUpdate(String(adminId), "SUPPORT", created.id, { status: "AWAITING_USER", note: "Which booking code?" });
    await replyAsUser(String(hostId), "SUPPORT", created.id, "It is the booking from Sunday.");
    const seen = await getCaseForUser(String(hostId), "SUPPORT", created.id);
    assert.equal(seen.status, "UNDER_REVIEW");
    await assert.rejects(
      () => replyAsUser(String(driverId), "SUPPORT", created.id, "I should not be able to write here."),
      (err: unknown) => err instanceof ApiError && err.status === 404
    );
  });

  it("keeps internal notes off the user's conversation", async () => {
    const created = await createSupportTicket(String(driverId), {
      category: "BUG",
      subject: "Map jumps",
      description: "The home map recenters after it finishes loading on my phone.",
    });
    await adminMessage(String(adminId), "SUPPORT", created.id, "Check the geolocation permission first.", "INTERNAL");
    const seen = await getCaseForUser(String(driverId), "SUPPORT", created.id);
    const messages = seen.messages as { visibility?: string; body?: string }[];
    assert.equal(messages.length, 0);
    assert.equal(await TicketMessage.countDocuments({ ticketId: created.id, visibility: "INTERNAL" }), 1);
  });

  it("requires a note before resolving and rejects an illegal status jump", async () => {
    const created = await createSupportTicket(String(driverId), {
      category: "OTHER",
      subject: "General question",
      description: "I want to know how long a pending hold lasts before it expires.",
    });
    await assert.rejects(
      () => adminUpdate(String(adminId), "SUPPORT", created.id, { status: "RESOLVED", note: "short" }),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
    await adminUpdate(String(adminId), "SUPPORT", created.id, { status: "RESOLVED", note: "Holds last until the payment window ends." });
    await assert.rejects(
      () => adminUpdate(String(adminId), "SUPPORT", created.id, { status: "OPEN" }),
      (err: unknown) => err instanceof ApiError && err.status === 409
    );
    assert.equal(canTransitionTicket("RESOLVED", "OPEN"), false);
    assert.equal(canTransitionTicket("OPEN", "UNDER_REVIEW"), true);
  });

  it("wires support routes to their own rate limits", () => {
    const src = readFileSync(new URL("../routes/index.ts", import.meta.url), "utf8");
    assert.match(src, /rateLimit\(\s*"support-report"/);
    assert.match(src, /rateLimit\(\s*"support-ticket"/);
    assert.match(src, /rateLimit\(\s*"support-message"/);
    assert.match(src, /rateLimit\(\s*"support-evidence"/);
    const consoleSrc = readFileSync(new URL("../routes/console.ts", import.meta.url), "utf8");
    assert.match(consoleSrc, /requirePermission\("support.write"\)/);
  });

  it("rejects evidence that is not a jpeg, png, or webp", () => {
    assert.throws(
      () => validateUploadFile({ mimetype: "image/gif", size: 12, buffer: Buffer.from("GIF89a-test") }),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
  });
});
