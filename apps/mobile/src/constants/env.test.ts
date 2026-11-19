import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiBaseUrl } from "./env";

describe("API base URL", () => {
  it("points login at the /api mount", () => {
    assert.equal(apiBaseUrl("https://api.place2park.me"), "https://api.place2park.me/api");
    assert.equal(apiBaseUrl("https://api.place2park.me/"), "https://api.place2park.me/api");
    assert.equal(apiBaseUrl("https://api.place2park.me/api"), "https://api.place2park.me/api");
    assert.equal(apiBaseUrl("http://10.0.2.2:5000/api/"), "http://10.0.2.2:5000/api");
  });

  it("refuses a missing or relative URL", () => {
    assert.throws(() => apiBaseUrl(""), /EXPO_PUBLIC_API_URL/);
    assert.throws(() => apiBaseUrl("/api"), /EXPO_PUBLIC_API_URL/);
  });
});
