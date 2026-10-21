import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Response } from "express";
import { ParkingSpace, User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { authorize, type AuthedRequest } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { applyListingModeration, listingCreateState, statusOnPublish } from "./listings.js";
import { searchSpaces } from "./search.js";
import { validateWindow } from "./availability.js";
import { createListing, listListings as listHostListings } from "../controllers/host.controller.js";
import { listListings as listAdminListings, moderateListing } from "../controllers/admin.controller.js";
import type { ListingInput } from "../utils/validation.js";

let memory: MongoMemoryServer;
let hostId: string;
let adminId: string;
let driverId: string;

const prevNodeEnv = env.NODE_ENV;

function jsonRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

function authed(userId: string, userRole: string, extras: Record<string, unknown> = {}) {
  return { userId, userRole, ...extras } as AuthedRequest;
}

function listingInput(overrides: Partial<ListingInput> = {}): ListingInput {
  return {
    title: "Covered stall near Juhu beach",
    description: "Host-owned covered parking",
    propertyType: "INDIVIDUAL",
    spaceType: "PRIVATE",
    covered: true,
    level: "GROUND",
    vehicleTypes: ["CAR"],
    evCharging: false,
    cctv: true,
    securityGuard: false,
    gated: true,
    address: "12 Juhu Tara Road",
    formattedAddress: "12 Juhu Tara Road, Mumbai",
    locality: "Juhu",
    sublocality: "",
    area: "Juhu",
    city: "Mumbai",
    district: "Mumbai Suburban",
    state: "Maharashtra",
    pincode: "400049",
    postalCode: "400049",
    latitude: 19.1076,
    longitude: 72.8263,
    placeId: "",
    accessInstructions: "Ring the intercom",
    vehicleSizeNotes: "",
    overnightAllowed: false,
    selfParkingConfirmed: true,
    rules: [],
    pricePerHour: 5000,
    minDurationMins: 60,
    maxDurationMins: 1440,
    images: [],
    availability: [],
    blockedDates: [],
    publish: true,
    ...overrides,
  };
}

async function createPublishedListing(nodeEnv: string) {
  env.NODE_ENV = nodeEnv;
  const res = jsonRes();
  await createListing(authed(hostId, "HOST", { body: listingInput() }), res);
  env.NODE_ENV = prevNodeEnv;
  const body = res.body as { data: { listing: { id: string; status: string; verified: boolean } } };
  return body.data.listing;
}

function windowFor(status: string) {
  const start = new Date(Date.now() + 3 * 3600000);
  const end = new Date(start.getTime() + 60 * 60000);
  return validateWindow(
    {
      status,
      minDurationMins: 60,
      maxDurationMins: 1440,
      availability: [],
      overnightAllowed: false,
      blockedDates: [],
    },
    start,
    end
  );
}

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-moderation-test"));
  const [host, admin, driver] = await User.create([
    { name: "Host User", email: "host-mod@parkly.test", role: "HOST" },
    { name: "Admin User", email: "admin-mod@parkly.test", role: "ADMIN" },
    { name: "Driver User", email: "driver-mod@parkly.test", role: "DRIVER" },
  ]);
  hostId = String(host._id);
  adminId = String(admin._id);
  driverId = String(driver._id);
});

after(async () => {
  env.NODE_ENV = prevNodeEnv;
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  env.NODE_ENV = prevNodeEnv;
  await ParkingSpace.deleteMany({});
});

describe("listing publish status", () => {
  it("starts a published production listing in PENDING_REVIEW", () => {
    assert.deepEqual(statusOnPublish("production"), { status: "PENDING_REVIEW", verified: false });
    assert.deepEqual(listingCreateState(true, "production"), { status: "PENDING_REVIEW", verified: false });
  });

  it("auto-verifies published listings outside production", () => {
    assert.deepEqual(statusOnPublish("development"), { status: "VERIFIED", verified: true });
    assert.deepEqual(listingCreateState(true, "test"), { status: "VERIFIED", verified: true });
  });

  it("keeps unpublished listings as drafts", () => {
    assert.deepEqual(listingCreateState(false, "production"), { status: "DRAFT", verified: false });
  });

  it("persists PENDING_REVIEW when a host publishes in production", async () => {
    const listing = await createPublishedListing("production");
    assert.equal(listing.status, "PENDING_REVIEW");
    assert.equal(listing.verified, false);
    const reloaded = await ParkingSpace.findById(listing.id);
    assert.equal(reloaded?.status, "PENDING_REVIEW");
  });
});

describe("admin listing moderation", () => {
  it("lets an admin approve a pending listing and persists VERIFIED after reload", async () => {
    const listing = await createPublishedListing("production");
    const res = jsonRes();
    await moderateListing(authed(adminId, "ADMIN", { params: { id: listing.id }, body: { action: "approve" } }), res);
    const body = res.body as { data: { listing: { status: string; verified: boolean } } };
    assert.equal(body.data.listing.status, "VERIFIED");
    assert.equal(body.data.listing.verified, true);
    const reloaded = await ParkingSpace.findById(listing.id);
    assert.equal(reloaded?.status, "VERIFIED");
    assert.equal(reloaded?.verified, true);
  });

  it("lets an admin reject a pending listing", async () => {
    const listing = await createPublishedListing("production");
    const res = jsonRes();
    await moderateListing(authed(adminId, "ADMIN", { params: { id: listing.id }, body: { action: "reject" } }), res);
    const body = res.body as { data: { listing: { status: string; verified: boolean } } };
    assert.equal(body.data.listing.status, "REJECTED");
    assert.equal(body.data.listing.verified, false);
    const reloaded = await ParkingSpace.findById(listing.id);
    assert.equal(reloaded?.status, "REJECTED");
  });

  it("rejects unknown moderation actions without changing the listing", async () => {
    const listing = await createPublishedListing("production");
    await assert.rejects(
      () => moderateListing(authed(adminId, "ADMIN", { params: { id: listing.id }, body: { action: "publish" } }), jsonRes()),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
    const reloaded = await ParkingSpace.findById(listing.id);
    assert.equal(reloaded?.status, "PENDING_REVIEW");
  });

  it("blocks non-admins in the controller and authorize middleware", async () => {
    const listing = await createPublishedListing("production");
    await assert.rejects(
      () => moderateListing(authed(hostId, "HOST", { params: { id: listing.id }, body: { action: "approve" } }), jsonRes()),
      (err: unknown) => err instanceof ApiError && err.status === 403
    );
    await assert.rejects(
      () => moderateListing(authed(driverId, "DRIVER", { params: { id: listing.id }, body: { action: "reject" } }), jsonRes()),
      (err: unknown) => err instanceof ApiError && err.status === 403
    );

    let hostErr: unknown;
    authorize("ADMIN")(authed(hostId, "HOST"), jsonRes(), (err) => {
      hostErr = err;
    });
    assert.ok(hostErr instanceof ApiError && hostErr.status === 403);

    let allowed = false;
    authorize("ADMIN")(authed(adminId, "ADMIN"), jsonRes(), (err) => {
      allowed = err === undefined;
    });
    assert.equal(allowed, true);

    const reloaded = await ParkingSpace.findById(listing.id);
    assert.equal(reloaded?.status, "PENDING_REVIEW");
  });
});

describe("public search and booking filters", () => {
  it("includes approved listings in public search and excludes pending or rejected ones", async () => {
    const pending = await createPublishedListing("production");
    const approvedRes = jsonRes();
    await moderateListing(authed(adminId, "ADMIN", { params: { id: pending.id }, body: { action: "approve" } }), approvedRes);

    env.NODE_ENV = "production";
    const rejectedRes = jsonRes();
    await createListing(
      authed(hostId, "HOST", { body: listingInput({ title: "Rejected basement stall Juhu" }) }),
      rejectedRes
    );
    env.NODE_ENV = prevNodeEnv;
    const rejected = (rejectedRes.body as { data: { listing: { id: string } } }).data.listing;
    await moderateListing(authed(adminId, "ADMIN", { params: { id: rejected.id }, body: { action: "reject" } }), jsonRes());

    env.NODE_ENV = "production";
    await createListing(
      authed(hostId, "HOST", { body: listingInput({ title: "Still waiting covered stall Juhu" }) }),
      jsonRes()
    );
    env.NODE_ENV = prevNodeEnv;

    const results = await searchSpaces({ q: "Juhu", lat: 19.1076, lng: 72.8263 });
    const titles = results.map((r) => r.title);
    assert.ok(titles.includes("Covered stall near Juhu beach"));
    assert.ok(!titles.includes("Rejected basement stall Juhu"));
    assert.ok(!titles.includes("Still waiting covered stall Juhu"));
  });

  it("treats pending and rejected listings as not bookable", () => {
    assert.equal(windowFor("PENDING_REVIEW").ok, false);
    assert.equal(windowFor("PENDING_REVIEW").error, "NOT_ACTIVE");
    assert.equal(windowFor("REJECTED").ok, false);
    assert.equal(windowFor("REJECTED").error, "NOT_ACTIVE");
    assert.equal(windowFor("VERIFIED").ok, true);
    assert.equal(windowFor("ACTIVE").ok, true);
  });
});

describe("host visibility of own listings", () => {
  it("lets a host see pending and rejected listings with their moderation status", async () => {
    const pending = await createPublishedListing("production");
    env.NODE_ENV = "production";
    const rejectedRes = jsonRes();
    await createListing(
      authed(hostId, "HOST", { body: listingInput({ title: "Rejected host-visible stall" }) }),
      rejectedRes
    );
    env.NODE_ENV = prevNodeEnv;
    const rejected = (rejectedRes.body as { data: { listing: { id: string } } }).data.listing;
    await moderateListing(authed(adminId, "ADMIN", { params: { id: rejected.id }, body: { action: "reject" } }), jsonRes());

    const res = jsonRes();
    await listHostListings(authed(hostId, "HOST"), res);
    const listings = (res.body as { data: { listings: { id: string; status: string }[] } }).data.listings;
    const byId = new Map(listings.map((l) => [l.id, l.status]));
    assert.equal(byId.get(pending.id), "PENDING_REVIEW");
    assert.equal(byId.get(rejected.id), "REJECTED");
  });

  it("lists pending listings for admins without auto-approving them", async () => {
    const pending = await createPublishedListing("production");
    const res = jsonRes();
    await listAdminListings(authed(adminId, "ADMIN", { query: { status: "PENDING_REVIEW" } }), res);
    const listings = (res.body as { data: { listings: { id: string; status: string }[] } }).data.listings;
    assert.equal(listings.length, 1);
    assert.equal(listings[0]?.id, pending.id);
    assert.equal(listings[0]?.status, "PENDING_REVIEW");
    const reloaded = await ParkingSpace.findById(pending.id);
    assert.equal(reloaded?.status, "PENDING_REVIEW");
  });
});

describe("applyListingModeration", () => {
  it("maps approve and reject without exposing extra fields", () => {
    assert.deepEqual(applyListingModeration("approve"), { status: "VERIFIED", verified: true });
    assert.deepEqual(applyListingModeration("reject"), { status: "REJECTED", verified: false });
  });
});
