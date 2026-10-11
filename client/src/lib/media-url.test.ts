import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMediaUrl } from "./media-url.js";

describe("resolveMediaUrl", () => {
  it("leaves relative API bases untouched so the Vite proxy still works", () => {
    assert.equal(resolveMediaUrl("/uploads/a.jpg", "/api"), "/uploads/a.jpg");
    assert.equal(resolveMediaUrl("/demo/p1.svg", "/api"), "/demo/p1.svg");
    assert.equal(resolveMediaUrl("/uploads/a.jpg", ""), "/uploads/a.jpg");
  });

  it("prefixes listing media with the API origin when the SPA is on another host", () => {
    assert.equal(
      resolveMediaUrl("/uploads/a.jpg", "https://api.example.com/api"),
      "https://api.example.com/uploads/a.jpg"
    );
    assert.equal(
      resolveMediaUrl("/demo/p1.svg", "https://api.example.com/api/"),
      "https://api.example.com/demo/p1.svg"
    );
  });

  it("does not double-prefix already-absolute URLs", () => {
    assert.equal(
      resolveMediaUrl("https://cdn.example.com/uploads/a.jpg", "https://api.example.com/api"),
      "https://cdn.example.com/uploads/a.jpg"
    );
    assert.equal(
      resolveMediaUrl("https://api.example.com/uploads/a.jpg", "https://api.example.com/api"),
      "https://api.example.com/uploads/a.jpg"
    );
    assert.equal(resolveMediaUrl("//cdn.example.com/p.jpg", "https://api.example.com/api"), "//cdn.example.com/p.jpg");
    assert.equal(resolveMediaUrl("data:image/png;base64,aaa", "/api"), "data:image/png;base64,aaa");
  });

  it("leaves non-media paths unchanged", () => {
    assert.equal(resolveMediaUrl("/parking/abc", "https://api.example.com/api"), "/parking/abc");
    assert.equal(resolveMediaUrl("", "https://api.example.com/api"), "");
    assert.equal(resolveMediaUrl(null, "https://api.example.com/api"), "");
  });
});
