import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { SERVER_ROOT } from "./paths.js";

type VercelConfig = {
  rewrites?: { source: string; destination: string }[];
  headers?: { source: string; headers: { key: string; value: string }[] }[];
};

function readVercelConfig(rel: string) {
  const file = path.join(SERVER_ROOT, "..", rel);
  assert.equal(fs.existsSync(file), true, `${rel} must exist`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as VercelConfig;
}

function spaRewrite(config: VercelConfig) {
  const rewrites = config.rewrites ?? [];
  assert.ok(rewrites.some((r) => r.destination === "/index.html"));
  const spa = rewrites.find((r) => r.destination === "/index.html");
  assert.ok(spa?.source.includes("api"), "SPA rewrite must exclude /api");
  assert.ok(!rewrites.some((r) => r.source.startsWith("/api") && r.destination === "/index.html"));
}

function securityHeaders(config: VercelConfig, label: string) {
  const headers = (config.headers ?? []).flatMap((entry) => entry.headers);
  const byKey = new Map(headers.map((h) => [h.key, h.value]));
  const csp = byKey.get("Content-Security-Policy") ?? "";
  assert.ok(csp.includes("frame-ancestors 'none'"), `${label} CSP must block framing`);
  assert.ok(csp.includes("https://accounts.google.com"), `${label} CSP must allow Google Identity Services`);
  assert.ok(csp.includes("https://maps.googleapis.com"), `${label} CSP must allow Google Maps`);
  assert.ok(csp.includes("https://checkout.razorpay.com"), `${label} CSP must allow Razorpay checkout`);
  assert.ok(csp.includes("https://api.razorpay.com"), `${label} CSP must allow Razorpay API frames/connect`);
  assert.ok(csp.includes("https://*.onrender.com"), `${label} CSP must allow the Render API origin`);
  assert.ok(csp.includes("https://res.cloudinary.com"), `${label} CSP must allow Cloudinary images`);
  assert.equal(byKey.get("X-Frame-Options"), "DENY", `${label} must set X-Frame-Options`);
}

describe("Vercel SPA rewrite", () => {
  it("rewrites client routes to index.html and does not send /api to the SPA", () => {
    spaRewrite(readVercelConfig("client/vercel.json"));
    spaRewrite(readVercelConfig("vercel.json"));
  });

  it("sets CSP and clickjacking headers without blocking GIS, Maps, API, or Razorpay", () => {
    securityHeaders(readVercelConfig("client/vercel.json"), "client/vercel.json");
    securityHeaders(readVercelConfig("vercel.json"), "vercel.json");
  });
});
