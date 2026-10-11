/**
 * Driver booking-flow checks.
 * Default: isolated in-process API (fresh rate-limit store, ephemeral port).
 * Set API_URL to target an already-running server instead.
 * Run: npx tsx src/scripts/test-booking-flow.ts
 */
import type { Server } from "node:http";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { createApp } from "../app.js";

let BASE = process.env.API_URL ?? "";
let isolatedServer: Server | undefined;

async function startIsolatedApi() {
  await connectDb();
  const app = createApp();
  await new Promise<void>((resolve, reject) => {
    isolatedServer = app.listen(0, "127.0.0.1", () => resolve());
    isolatedServer.once("error", reject);
  });
  const addr = isolatedServer?.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Isolated booking-flow API failed to bind a port.");
  }
  BASE = `http://127.0.0.1:${addr.port}/api`;
  console.log(`[booking-flow] isolated API ${BASE}`);
}

async function stopIsolatedApi() {
  if (!isolatedServer) return;
  await new Promise<void>((resolve, reject) => {
    isolatedServer?.close((err) => (err ? reject(err) : resolve()));
  });
  isolatedServer = undefined;
}

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const createdIds: string[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: Record<string, unknown>;
  };
  return { status: res.status, json };
}

function atHour(daysAhead: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextWeekday(fromDays: number, weekday: number) {
  const d = atHour(fromDays, 10);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

async function login(email: string, password = "password123") {
  const res = await req("/auth/login", { method: "POST", body: { email, password } });
  return (res.json.data as { token?: string } | undefined)?.token;
}

async function main() {
  if (!process.env.API_URL) {
    await startIsolatedApi();
  }

  const driverToken = await login("driver@parkly.dev");
  const otherDriverToken = await login("kabir@parkly.dev");
  const listingHostToken = await login("rohan@parkly.dev");
  const otherHostToken = await login("host@parkly.dev");
  record("driver login", !!driverToken);
  record("other driver login", !!otherDriverToken);
  record("listing host login", !!listingHostToken);
  record("other host login", !!otherHostToken);
  if (!driverToken || !otherDriverToken || !listingHostToken || !otherHostToken) {
    console.error("Cannot continue without demo accounts.");
    process.exit(1);
  }

  const search = await req("/parking/search?q=Shahad&lat=19.2478&lng=73.1589&radius=12");
  const listings =
    (search.json.data?.results as { id: string; title?: string; latitude?: number; longitude?: number }[] | undefined) ??
    (search.json.data?.spaces as { id: string; title?: string; latitude?: number; longitude?: number }[] | undefined) ??
    [];
  record(
    "geospatial search still returns listings",
    search.status === 200 && listings.length > 0,
    `${listings.length} spaces`
  );
  record(
    "search results include map marker coordinates",
    listings.some((l) => Number.isFinite(l.latitude) && Number.isFinite(l.longitude))
  );
  const shahad =
    listings.find((l) => /shahad/i.test(l.title ?? "")) ?? listings[0];
  const spaceId = shahad?.id;
  if (!spaceId) process.exit(1);

  const publicDetail = await req(`/parking/${spaceId}`);
  const publicSpace = publicDetail.json.data?.space as
    | { address?: string; accessInstructions?: string; placeId?: string }
    | undefined;
  record(
    "public listing hides exact address",
    publicDetail.status === 200 &&
      !publicSpace?.address &&
      !publicSpace?.accessInstructions &&
      !publicSpace?.placeId
  );

  const pastIso = new Date(Date.now() - 86400000).toISOString();
  const past = await req(`/parking/${spaceId}/quote?start=${encodeURIComponent(pastIso)}&durationMins=120`);
  record(
    "rejects past start time",
    past.status === 200 && past.json.data?.available === false && past.json.data?.error === "IN_PAST",
    String(past.json.data?.message ?? past.json.message)
  );

  const badDuration = await req(
    `/parking/${spaceId}/quote?start=${encodeURIComponent(atHour(4, 10).toISOString())}&durationMins=17`
  );
  record("rejects invalid duration", badDuration.status === 422, badDuration.json.message);

  const overnight = await req(
    `/parking/${spaceId}/quote?start=${encodeURIComponent(atHour(4, 23).toISOString())}&durationMins=120`
  );
  record(
    "rejects overnight when listing forbids it",
    overnight.status === 200 && overnight.json.data?.available === false,
    String(overnight.json.data?.error ?? overnight.json.message)
  );

  const unauth = await req("/bookings", {
    method: "POST",
    body: { spaceId, start: atHour(4, 10).toISOString(), durationMins: 120, vehicleType: "CAR" },
  });
  record("rejects unauthenticated create", unauth.status === 401 || unauth.status === 403);

  const malformedCreate = await req("/bookings", {
    method: "POST",
    token: driverToken,
    body: { spaceId: "not-an-id", start: atHour(4, 10).toISOString(), durationMins: 120, vehicleType: "CAR" },
  });
  record("rejects malformed listing id", [400, 404].includes(malformedCreate.status), String(malformedCreate.status));

  const badDate = await req("/bookings", {
    method: "POST",
    token: otherDriverToken,
    body: { spaceId, start: "not-a-date", durationMins: 120, vehicleType: "CAR" },
  });
  record("rejects malformed start date", badDate.status === 422, badDate.json.message);

  const missingFields = await req("/bookings", {
    method: "POST",
    token: otherDriverToken,
    body: { spaceId },
  });
  record("rejects missing booking fields", missingFields.status === 422, missingFields.json.message);

  const badBookingId = await req("/bookings/not-an-id", { token: driverToken });
  record("rejects malformed booking id", badBookingId.status === 404, String(badBookingId.status));

  const badCancel = await req("/bookings/not-an-id/cancel", { method: "POST", token: driverToken });
  record("rejects cancel with malformed id", [400, 404].includes(badCancel.status), String(badCancel.status));

  const suggest = await req("/parking/places/suggest?q=Shahad");
  const suggestions = (suggest.json.data?.predictions as unknown[] | undefined) ?? [];
  record(
    "location autocomplete still returns suggestions",
    suggest.status === 200 && suggestions.length > 0,
    `${suggestions.length} suggestions`
  );

  const bkcSearch = await req("/parking/search?q=BKC&lat=19.0662&lng=72.8656&radius=8");
  const bkcList =
    (bkcSearch.json.data?.results as { id: string; title?: string }[] | undefined) ?? [];
  const bkc = bkcList.find((l) => /BKC|office tower/i.test(l.title ?? ""));
  if (bkc) {
    const saturday = nextWeekday(3, 6);
    const closed = await req(
      `/parking/${bkc.id}/quote?start=${encodeURIComponent(saturday.toISOString())}&durationMins=120`
    );
    record(
      "rejects time outside weekly schedule",
      closed.status === 200 && closed.json.data?.available === false,
      String(closed.json.data?.error ?? closed.json.message)
    );
  } else {
    record("rejects time outside weekly schedule", false, "BKC weekday listing not found");
  }

  let slotA = atHour(6, 10);
  let quote = await req(
    `/parking/${spaceId}/quote?start=${encodeURIComponent(slotA.toISOString())}&durationMins=120`
  );
  for (let extra = 1; extra <= 4 && quote.json.data?.available !== true; extra++) {
    slotA = atHour(6 + extra, 10);
    quote = await req(
      `/parking/${spaceId}/quote?start=${encodeURIComponent(slotA.toISOString())}&durationMins=120`
    );
  }
  const quoted = (quote.json.data?.quote as { total?: number; parkingFee?: number; platformFee?: number } | undefined) ?? {};
  record("quote reports availability from backend", quote.status === 200 && quote.json.data?.available === true);

  const created = await req("/bookings", {
    method: "POST",
    token: driverToken,
    body: {
      spaceId,
      start: slotA.toISOString(),
      durationMins: 120,
      vehicleType: "CAR",
      hostId: "ffffffffffffffffffffffff",
      totalAmount: 1,
      status: "CONFIRMED",
    },
  });
  const bookingId = created.json.data?.bookingId as string | undefined;
  if (bookingId) createdIds.push(bookingId);
  record(
    "creates PENDING booking from trusted server fields",
    created.status === 201 &&
      created.json.data?.status === "PENDING" &&
      created.json.data?.paymentStatus === "PAYMENT_PENDING" &&
      created.json.data?.total === quoted.total &&
      created.json.data?.total !== 1,
    `status=${String(created.json.data?.status)} payment=${String(created.json.data?.paymentStatus)} total=${String(created.json.data?.total)}`
  );

  const mockPay = await req("/payments/mock-confirm", {
    method: "POST",
    token: driverToken,
    body: { bookingId, outcome: "success" },
  });
  record("mock payment does not mark paid", mockPay.status === 403, mockPay.json.message);

  const overlap1030 = await req("/bookings", {
    method: "POST",
    token: driverToken,
    body: {
      spaceId,
      start: new Date(slotA.getTime() + 30 * 60000).toISOString(),
      durationMins: 60,
      vehicleType: "CAR",
    },
  });
  record("10:30–11:30 conflicts with 10:00–12:00", overlap1030.status === 409, overlap1030.json.message);

  const overlap1100 = await req("/bookings", {
    method: "POST",
    token: driverToken,
    body: {
      spaceId,
      start: new Date(slotA.getTime() + 60 * 60000).toISOString(),
      durationMins: 120,
      vehicleType: "CAR",
    },
  });
  record("11:00–13:00 conflicts with 10:00–12:00", overlap1100.status === 409, overlap1100.json.message);

  const adjacent = await req("/bookings", {
    method: "POST",
    token: driverToken,
    body: {
      spaceId,
      start: new Date(slotA.getTime() + 120 * 60000).toISOString(),
      durationMins: 120,
      vehicleType: "CAR",
    },
  });
  const adjacentId = adjacent.json.data?.bookingId as string | undefined;
  if (adjacentId) createdIds.push(adjacentId);
  record("12:00–14:00 is allowed after 10:00–12:00", adjacent.status === 201, adjacent.json.message);

  const mine = await req("/bookings?scope=upcoming", { token: driverToken });
  const mineRows = (mine.json.data?.bookings as { id: string }[] | undefined) ?? [];
  record("upcoming list includes the new booking", mine.status === 200 && mineRows.some((b) => b.id === bookingId));

  const otherList = await req("/bookings?scope=upcoming", { token: otherDriverToken });
  const otherRows = (otherList.json.data?.bookings as { id: string }[] | undefined) ?? [];
  record("other driver does not see this booking in their list", otherList.status === 200 && !otherRows.some((b) => b.id === bookingId));

  const otherGet = await req(`/bookings/${bookingId}`, { token: otherDriverToken });
  record("other driver cannot open this booking", otherGet.status === 403);

  const detail = await req(`/bookings/${bookingId}`, { token: driverToken });
  const detailBooking = (detail.json.data?.booking ?? {}) as {
    status?: string;
    spaceId?: { address?: string; accessInstructions?: string };
  };
  record(
    "pending detail hides exact address",
    detail.status === 200 &&
      detailBooking.status === "PENDING" &&
      !detail.json.data?.revealExactLocation &&
      !detailBooking.spaceId?.address &&
      !detailBooking.spaceId?.accessInstructions
  );
  record(
    "pending booking hides access code",
    detail.status === 200 && !(detail.json.data?.booking as { accessCode?: string } | undefined)?.accessCode
  );

  const forged = await req("/bookings", {
    method: "GET",
    token: "not-a-jwt",
  });
  record("rejects forged JWT", forged.status === 401);

  const persist = await req(`/bookings/${bookingId}`, { token: driverToken });
  const persistBooking = persist.json.data?.booking as { status?: string } | undefined;
  const persistPay = persist.json.data?.payment as { status?: string } | undefined;
  record(
    "booking persists as PENDING / payment CREATED",
    persist.status === 200 && persistBooking?.status === "PENDING" && persistPay?.status === "CREATED",
    `booking=${persistBooking?.status} payment=${persistPay?.status}`
  );

  const hostA = await req(`/bookings/${bookingId}`, { token: listingHostToken });
  const hostB = await req(`/bookings/${bookingId}`, { token: otherHostToken });
  const ownerIsA = hostA.status === 200;
  const ownerIsB = hostB.status === 200;
  record(
    "only the listing host can view the booking",
    ownerIsA !== ownerIsB && (hostA.status === 403 || hostB.status === 403),
    `rohan=${hostA.status} priya=${hostB.status}`
  );
  const ownerToken = ownerIsA ? listingHostToken : ownerIsB ? otherHostToken : listingHostToken;
  const strangerHostToken = ownerIsA ? otherHostToken : listingHostToken;

  const hostList = await req("/host/bookings", { token: ownerToken });
  const hostRows = (hostList.json.data?.bookings as { id: string }[] | undefined) ?? [];
  record("listing host list includes own booking", hostList.status === 200 && hostRows.some((b) => b.id === bookingId));

  const otherHostList = await req("/host/bookings", { token: strangerHostToken });
  const otherHostRows = (otherHostList.json.data?.bookings as { id: string }[] | undefined) ?? [];
  record(
    "other host list excludes this booking",
    otherHostList.status === 200 && !otherHostRows.some((b) => b.id === bookingId)
  );

  const hostCancel = await req(`/bookings/${bookingId}/cancel`, { method: "POST", token: ownerToken });
  record("host cannot cancel a driver's booking", hostCancel.status === 403, hostCancel.json.message);

  const blockedStart = atHour(8, 10);
  const blockedEnd = atHour(8, 12);
  const block = await req("/host/calendar/block", {
    method: "POST",
    token: ownerToken,
    body: { spaceId, start: blockedStart.toISOString(), end: blockedEnd.toISOString(), reason: "flow-test" },
  });
  const blockId = (block.json.data?.slot as { id?: string } | undefined)?.id;
  record("host can block a date window", block.status === 201, block.json.message);
  const blockedBook = await req(
    `/parking/${spaceId}/quote?start=${encodeURIComponent(blockedStart.toISOString())}&durationMins=120`
  );
  record(
    "rejects host-blocked interval",
    blockedBook.status === 200 && blockedBook.json.data?.available === false,
    String(blockedBook.json.data?.error ?? blockedBook.json.message)
  );
  if (blockId) {
    await req(`/host/calendar/block/${blockId}`, { method: "DELETE", token: ownerToken });
  }

  const cancel = await req(`/bookings/${bookingId}/cancel`, { method: "POST", token: driverToken });
  record("driver can cancel own pending booking", cancel.status === 200, `refunded=${String(cancel.json.data?.refunded)}`);

  const afterCancel = await req(`/bookings/${bookingId}`, { token: driverToken });
  const cancelledStatus = (afterCancel.json.data?.booking as { status?: string } | undefined)?.status;
  record("cancelled booking persists as CANCELLED", afterCancel.status === 200 && cancelledStatus === "CANCELLED", cancelledStatus);

  const history = await req("/bookings?scope=cancelled", { token: driverToken });
  const historyRows = (history.json.data?.bookings as { id: string; status?: string }[] | undefined) ?? [];
  record(
    "cancelled scope returns only cancelled or expired rows",
    history.status === 200 &&
      historyRows.every((b) => ["CANCELLED", "EXPIRED"].includes(b.status ?? "")) &&
      cancelledStatus === "CANCELLED"
  );

  const refill = await req("/bookings", {
    method: "POST",
    token: driverToken,
    body: { spaceId, start: slotA.toISOString(), durationMins: 120, vehicleType: "CAR" },
  });
  if (refill.json.data?.bookingId) createdIds.push(String(refill.json.data.bookingId));
  record("slot is released after cancellation", refill.status === 201, refill.json.message);

  let raceSlot = atHour(13, 17);
  for (let extra = 0; extra < 5; extra++) {
    const probe = await req(
      `/parking/${spaceId}/quote?start=${encodeURIComponent(atHour(13 + extra, 17).toISOString())}&durationMins=60`
    );
    if (probe.json.data?.available === true) {
      raceSlot = atHour(13 + extra, 17);
      break;
    }
  }
  const [raceA, raceB] = await Promise.all([
    req("/bookings", {
      method: "POST",
      token: otherDriverToken,
      body: { spaceId, start: raceSlot.toISOString(), durationMins: 60, vehicleType: "CAR" },
    }),
    req("/bookings", {
      method: "POST",
      token: driverToken,
      body: { spaceId, start: raceSlot.toISOString(), durationMins: 60, vehicleType: "CAR" },
    }),
  ]);
  const raceStatuses = [raceA.status, raceB.status].sort();
  for (const row of [raceA, raceB]) {
    const id = row.json.data?.bookingId;
    if (row.status === 201 && id) createdIds.push(String(id));
  }
  record(
    "simultaneous overlapping requests accept only one booking",
    raceStatuses[0] === 201 && raceStatuses[1] === 409,
    `${raceA.status}/${raceB.status}`
  );

  const persistAgain = await req(`/bookings/${bookingId}`, { token: driverToken });
  record(
    "cancelled booking remains CANCELLED after re-fetch",
    persistAgain.status === 200 &&
      (persistAgain.json.data?.booking as { status?: string } | undefined)?.status === "CANCELLED"
  );

  for (const id of createdIds) {
    if (id === bookingId) continue;
    await req(`/bookings/${id}/cancel`, { method: "POST", token: driverToken });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopIsolatedApi();
    if (!process.env.API_URL) {
      await mongoose.disconnect().catch(() => undefined);
    }
  });
