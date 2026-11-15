import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRAND_LOCKUP_SRC, BRAND_MARK_SRC, BRAND_TAGLINE_SRC, BRAND_WORDMARK_SRC } from "./brand.tsx";

describe("brand mark", () => {
  it("keeps the four official logo files", () => {
    assert.match(BRAND_MARK_SRC, /branding\/place2park-mark\.png$/);
    assert.match(BRAND_LOCKUP_SRC, /branding\/place2park-lockup\.png$/);
    assert.match(BRAND_WORDMARK_SRC, /branding\/place2park-wordmark\.png$/);
    assert.match(BRAND_TAGLINE_SRC, /branding\/place2park-tagline\.png$/);
  });
});
