import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { logoIntroSrc, shouldPlayLogoIntro } from "./logo-intro.ts";

describe("logo intro", () => {
  it("points at the public logo file", () => {
    assert.equal(logoIntroSrc("/"), "/branding/place2park-logo.png");
    assert.equal(logoIntroSrc("/__console_base__/"), "/__console_base__/branding/place2park-logo.png");
  });

  it("plays on the homepage once, and skips reduced motion and other routes", () => {
    assert.equal(shouldPlayLogoIntro("/", false, null), true);
    assert.equal(shouldPlayLogoIntro("/", false, "1"), false);
    assert.equal(shouldPlayLogoIntro("/", true, null), false);
    assert.equal(shouldPlayLogoIntro("/login", false, null), false);
    assert.equal(shouldPlayLogoIntro("/bookings", false, null), false);
    assert.equal(shouldPlayLogoIntro("/host", false, null), false);
  });
});
