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
  const match = new RegExp(`^${spa!.source}$`);
  for (const excluded of ["/sitemap.xml", "/robots.txt", "/api/parking/search"]) {
    assert.equal(match.test(excluded), false, `${excluded} must not be rewritten to index.html`);
  }
  for (const page of ["/", "/search", "/faqs", "/become-a-host", "/support", "/parking/example"]) {
    assert.equal(match.test(page), true, `${page} remains a client route`);
  }
  const sitemapType = (config.headers ?? [])
    .filter((entry) => entry.source === "/sitemap.xml")
    .flatMap((entry) => entry.headers)
    .find((header) => header.key === "Content-Type");
  assert.equal(sitemapType?.value, "application/xml; charset=utf-8");
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
  assert.ok(csp.includes("https://www.googletagmanager.com"), `${label} must allow the GA4 tag`);
  assert.ok(connectSrc.includes("https://www.google-analytics.com"), `${label} must allow GA4 collection`);
  assert.equal(
    byKey.get("Cross-Origin-Opener-Policy"),
    "same-origin-allow-popups",
    `${label} must keep Google Identity Services popups working`
  );
  assert.notEqual(byKey.get("Cross-Origin-Opener-Policy"), "unsafe-none");
  assert.equal(byKey.get("X-Frame-Options"), "DENY", `${label} must set X-Frame-Options`);
}

const PRIVATE_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/dashboard",
  "/bookings",
  "/history",
  "/saved",
  "/payments",
  "/profile",
  "/settings",
  "/help",
  "/host",
  "/admin",
  "/api",
  "/search/results",
];

function publicSitemap() {
  const file = path.join(SERVER_ROOT, "..", "client", "public", "sitemap.xml");
  const xml = fs.readFileSync(file, "utf8");
  assert.equal(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), true);
  assert.equal(xml.includes("<html"), false);
  assert.equal(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), true);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
  assert.equal(new Set(locs).size, locs.length, "sitemap URLs must be unique");
  assert.ok(locs.length > 0);
  for (const loc of locs) {
    const url = new URL(loc!);
    assert.equal(url.protocol, "https:");
    assert.equal(url.host, "www.place2park.me");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(PRIVATE_PATHS.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)), false, loc);
  }
  assert.equal(locs.includes("https://www.place2park.me/"), true);
  assert.equal(xml.includes("<lastmod>"), false);
  const robots = fs.readFileSync(path.join(SERVER_ROOT, "..", "client", "public", "robots.txt"), "utf8");
  assert.equal(robots.includes("Sitemap: https://www.place2park.me/sitemap.xml"), true);
  return locs;
}

describe("Vercel SPA rewrite", () => {
  it("rewrites client routes to index.html and does not send /api to the SPA", () => {
    spaRewrite(readVercelConfig("client/vercel.json"));
    spaRewrite(readVercelConfig("vercel.json"));
  });

  it("publishes an XML sitemap of public pages and points robots.txt at it", () => {
    const locs = publicSitemap();
    assert.deepEqual(locs, [
      "https://www.place2park.me/",
      "https://www.place2park.me/search",
      "https://www.place2park.me/become-a-host",
      "https://www.place2park.me/support",
      "https://www.place2park.me/faqs",
    ]);
  });

  it("sets CSP and clickjacking headers without blocking GIS, Maps, API, or Razorpay", () => {
    securityHeaders(readVercelConfig("client/vercel.json"), "client/vercel.json");
    securityHeaders(readVercelConfig("vercel.json"), "vercel.json");
  });
});
