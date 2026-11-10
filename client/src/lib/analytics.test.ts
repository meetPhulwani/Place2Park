import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyticsAllowed,
  analyticsPagePath,
  analyticsSkipReason,
  browserPrivacyOptOut,
  createPageTracker,
  googleTagSrc,
  isRecognizedGtagCommand,
  measurementId,
  sanitizeAnalyticsParams,
} from "./analytics.js";

describe("GA4 analytics guard", () => {
  it("accepts only a measurement ID shape and never a hardcoded fallback", () => {
    assert.equal(measurementId("g-abc12345"), "G-ABC12345");
    assert.equal(measurementId(" UA-123 "), null);
    assert.equal(measurementId(""), null);
    assert.equal(measurementId(undefined), null);
    assert.equal(measurementId("undefined"), null);
    assert.equal(googleTagSrc(measurementId(undefined)), null);
    assert.equal(googleTagSrc("G-TEST1234"), "https://www.googletagmanager.com/gtag/js?id=G-TEST1234");
  });

  it("loads only on the public production site when privacy settings allow it", () => {
    const id = measurementId("G-TEST1234");
    assert.equal(analyticsAllowed({ production: true, measurementId: id, console: false, privacyOptOut: false }), true);
    assert.equal(analyticsAllowed({ production: false, measurementId: id, console: false, privacyOptOut: false }), false);
    assert.equal(analyticsAllowed({ production: true, measurementId: id, console: true, privacyOptOut: false }), false);
    assert.equal(analyticsAllowed({ production: true, measurementId: null, console: false, privacyOptOut: false }), false);
    assert.equal(analyticsAllowed({ production: true, measurementId: id, console: false, privacyOptOut: true }), false);
    assert.equal(browserPrivacyOptOut({ globalPrivacyControl: true }), true);
    assert.equal(browserPrivacyOptOut({ doNotTrack: "1" }), true);
    assert.equal(browserPrivacyOptOut({ doNotTrack: "unspecified" }), false);
  });

  it("recognizes only official gtag Arguments commands", () => {
    const dataLayer: unknown[] = [];
    function gtag(..._args: unknown[]) {
      dataLayer.push(arguments);
    }
    gtag("js", new Date());
    gtag("config", "G-TEST1234", { send_page_view: false });
    gtag("event", "page_view", { page_path: "/" });
    assert.equal(isRecognizedGtagCommand(["config", "G-TEST1234"]), false);
    assert.equal(isRecognizedGtagCommand(dataLayer[0]), true);
    assert.equal(isRecognizedGtagCommand(dataLayer[1]), true);
    assert.equal(isRecognizedGtagCommand(dataLayer[2]), true);
    assert.equal((dataLayer[1] as ArrayLike<unknown>)[0], "config");
    assert.equal((dataLayer[2] as ArrayLike<unknown>)[1], "page_view");
  });

  it("reports why the tag stays off without inventing consent", () => {
    const id = measurementId("G-TEST1234");
    assert.equal(analyticsSkipReason({ production: false, measurementId: id, console: false, privacyOptOut: false }), "not-production");
    assert.equal(analyticsSkipReason({ production: true, measurementId: null, console: false, privacyOptOut: false }), "missing-measurement-id");
    assert.equal(analyticsSkipReason({ production: true, measurementId: id, console: true, privacyOptOut: false }), "admin-console");
    assert.equal(analyticsSkipReason({ production: true, measurementId: id, console: false, privacyOptOut: true }), "privacy-opt-out");
    assert.equal(analyticsSkipReason({ production: true, measurementId: id, console: false, privacyOptOut: false }), null);
  });

  it("sends a page path once and drops query tokens", () => {
    const seen: string[] = [];
    const track = createPageTracker((path) => seen.push(path));
    assert.equal(track("/search?q=bandra&token=secret"), true);
    assert.equal(track("/search?token=another"), false);
    assert.equal(track("/parking/abc"), true);
    assert.deepEqual(seen, ["/search", "/parking/abc"]);
    assert.equal(analyticsPagePath("/reset-password?token=abc"), "/reset-password");
  });

  it("drops passwords, emails, phone numbers, bank details, and tokens", () => {
    const safe = sanitizeAnalyticsParams({
      method: "password",
      result_count: 3,
      email: "driver@example.com",
      password: "secret",
      phone: "9876543210",
      account_number: "123456789",
      token: "jwt",
      note: "reach me at a@b.co",
    });
    assert.deepEqual(safe, { method: "password", result_count: 3 });
  });
});
