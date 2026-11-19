import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleSignInConfigured } from "./google-config";

describe("google configuration", () => {
  it("stays off until the web client id is configured", () => {
    assert.equal(googleSignInConfigured({}), false);
    assert.equal(googleSignInConfigured({ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web-client.apps.googleusercontent.com" }), true);
  });
});
