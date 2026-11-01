import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedCorsOrigins } from "./cors.js";

describe("CORS origins", () => {
  it("allows both production site hosts and the configured client", () => {
    const origins = allowedCorsOrigins("https://www.place2park.me", "production");
    assert.ok(origins.includes("https://www.place2park.me"));
    assert.ok(origins.includes("https://place2park.me"));
    assert.equal(origins.includes("http://localhost:5173"), false);
    assert.equal(origins.includes("http://127.0.0.1:5173"), false);
  });

  it("keeps localhost origins for development", () => {
    const origins = allowedCorsOrigins("http://localhost:5173", "development");
    assert.ok(origins.includes("http://localhost:5173"));
    assert.ok(origins.includes("http://127.0.0.1:5173"));
    assert.ok(origins.includes("https://www.place2park.me"));
    assert.ok(origins.includes("https://place2park.me"));
  });

  it("still allows an extra configured origin such as a preview host", () => {
    const origins = allowedCorsOrigins("https://preview.place2park.me", "production");
    assert.ok(origins.includes("https://preview.place2park.me"));
    assert.ok(origins.includes("https://www.place2park.me"));
  });
});
