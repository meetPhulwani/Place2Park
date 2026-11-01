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

function cspDirective(csp: string, name: string) {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `)) ?? "";
}

function securityHeaders(config: VercelConfig, label: string) {
  const headers = (config.headers ?? []).flatMap((entry) => entry.headers);
  const cspHeaders = headers.filter((header) => header.key === "Content-Security-Policy");
  const coopHeaders = headers.filter((header) => header.key === "Cross-Origin-Opener-Policy");
  assert.equal(cspHeaders.length, 1, `${label} must send one CSP header`);
  assert.equal(coopHeaders.length, 1, `${label} must send one COOP header`);
  const byKey = new Map(headers.map((h) => [h.key, h.value]));
  const csp = byKey.get("Content-Security-Policy") ?? "";
  const imgSrc = cspDirective(csp, "img-src");
  const connectSrc = cspDirective(csp, "connect-src");
  assert.ok(csp.includes("frame-ancestors 'none'"), `${label} CSP must block framing`);
  assert.ok(csp.includes("https://accounts.google.com"), `${label} CSP must allow Google Identity Services`);
  assert.ok(csp.includes("https://maps.googleapis.com"), `${label} CSP must allow Google Maps`);
  assert.ok(csp.includes("https://checkout.razorpay.com"), `${label} CSP must allow Razorpay checkout`);
  assert.ok(csp.includes("https://api.razorpay.com"), `${label} CSP must allow Razorpay API frames/connect`);
  assert.ok(imgSrc.includes("https://*.onrender.com"), `${label} img-src must keep the Render image host`);
  assert.ok(imgSrc.includes("https://res.cloudinary.com"), `${label} img-src must keep Cloudinary`);
  assert.ok(imgSrc.includes("https://api.place2park.me"), `${label} img-src must allow API demo images`);
  assert.ok(connectSrc.includes("https://*.onrender.com"), `${label} connect-src must keep the Render API origin`);
  assert.ok(connectSrc.includes("https://api.place2park.me"), `${label} connect-src must allow the API domain`);
  assert.equal(
    byKey.get("Cross-Origin-Opener-Policy"),
    "same-origin-allow-popups",
    `${label} must keep Google Identity Services popups working`
  );
  assert.notEqual(byKey.get("Cross-Origin-Opener-Policy"), "unsafe-none");
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
