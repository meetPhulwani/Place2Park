import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createApp } from "../app.js";
import {
  favoriteSchema,
  listingSchema,
  loginSchema,
  resolveReportSchema,
  reviewSchema,
  signupSchema,
} from "../utils/validation.js";
import { dayQuery, historyBookingStatus, publicSearchInput } from "../utils/request-input.js";

function request(port: number, path: string, body: string | Buffer, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "POST", headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

describe("request validation", () => {
  it("rejects operator objects, extra fields, and unsafe query values", () => {
    assert.equal(favoriteSchema.safeParse({ spaceId: { $gt: "" } }).success, false);
    assert.equal(favoriteSchema.safeParse({ spaceId: "507f1f77bcf86cd799439011", role: "ADMIN" }).success, false);
    assert.equal(favoriteSchema.safeParse({ spaceId: "507f1f77bcf86cd799439011" }).success, true);
    assert.equal(signupSchema.safeParse({
      name: "Aarav Mehta",
      email: "driver@example.com",
      password: "Password1!",
      phone: "9876543210",
      role: "ADMIN",
    }).success, false);
    assert.equal(loginSchema.safeParse({ email: "driver@example.com", password: "Password1!", hostVerified: true }).success, false);
    assert.equal(resolveReportSchema.safeParse({}).success, false);
    assert.equal(resolveReportSchema.safeParse({ action: "dismiss", note: "Not a listing issue." }).success, true);
    const priceIssues = (price: number) => {
      const parsed = listingSchema.safeParse({ pricePerHour: price });
      return parsed.success ? [] : parsed.error.issues.filter((issue) => issue.path[0] === "pricePerHour");
    };
    assert.ok(priceIssues(-1).length > 0);
    assert.ok(priceIssues(100_001).length > 0);
    assert.equal(priceIssues(1000).length, 0);
    const comment = "<script>alert(1)</script>";
    const review = reviewSchema.safeParse({
      bookingId: "507f1f77bcf86cd799439011",
      rating: 5,
      comment,
    });
    assert.equal(review.success, true);
    if (review.success) assert.equal(review.data.comment, comment);
    assert.equal(historyBookingStatus({ $gt: "" }), undefined);
    assert.equal(historyBookingStatus("COMPLETED"), "COMPLETED");
    assert.equal(dayQuery("not-a-date"), undefined);
    assert.ok(dayQuery("2026-11-05T00:00:00.000Z") instanceof Date);
    const search = publicSearchInput({ q: "x".repeat(200), durationMins: "17", lat: { $gt: "" }, maxPrice: "-5" });
    assert.equal(search.q?.length, 120);
    assert.equal(search.durationMins, undefined);
    assert.equal(search.lat, undefined);
    assert.equal(search.maxPriceRupees, undefined);
  });

  it("returns a safe 400 for malformed JSON and 413 for an oversized body", async () => {
    const app = createApp();
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const bad = await request(port, "/api/auth/login", "{", {
        "content-type": "application/json",
        "content-length": "1",
      });
      const badBody = JSON.parse(bad.body) as { message?: string; stack?: string };
      assert.equal(bad.status, 400);
      assert.equal(badBody.message, "Invalid JSON.");
      assert.equal(badBody.stack, undefined);

      const oversized = Buffer.alloc(1_100_000, 0x61);
      const huge = await request(port, "/api/auth/login", oversized, {
        "content-type": "application/json",
        "content-length": String(oversized.length),
      });
      const hugeBody = JSON.parse(huge.body) as { message?: string; stack?: string };
      assert.equal(huge.status, 413);
      assert.equal(hugeBody.message, "Request is too large.");
      assert.equal(hugeBody.stack, undefined);

      const id = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        http.get({ hostname: "127.0.0.1", port, path: "/api/bookings/not-an-id" }, (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        }).on("error", reject);
      });
      assert.equal(id.status, 400);
      assert.match(id.body, /Invalid id/);
    } finally {
      server.close();
    }
  });

  it("wires validation onto previously open mutation routes", () => {
    const routes = readFileSync(new URL("../routes/index.ts", import.meta.url), "utf8");
    for (const schema of ["favoriteSchema", "listingStatusSchema", "userStatusSchema", "verifiedFlagSchema", "moderationSchema", "resolveReportSchema", "emptyBodySchema"]) {
      assert.match(routes, new RegExp(`validate\\(${schema}\\)`));
    }
  });
});
