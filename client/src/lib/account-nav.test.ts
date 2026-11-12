import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountNavItems } from "./account-nav.js";

describe("account sidebar", () => {
  it("keeps the dashboard items and leaves parking search off the sidebar", () => {
    assert.deepEqual(
      accountNavItems.map((item) => item.label),
      ["Profile", "My bookings", "Saved", "Payments", "Settings", "Help Center"]
    );
    assert.equal(accountNavItems.some((item) => item.href === "/search" || item.label === "Find Parking"), false);
  });
});
