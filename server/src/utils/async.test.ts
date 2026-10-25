import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withTimeout } from "./async.js";

describe("withTimeout", () => {
  it("resolves when the work finishes in time", async () => {
    assert.equal(await withTimeout(Promise.resolve("ok"), 50, "timeout"), "ok");
  });

  it("rejects with the timeout message when work never finishes", async () => {
    await assert.rejects(
      () => withTimeout(new Promise<void>(() => undefined), 15, "timeout contacting Razorpay"),
      /timeout contacting Razorpay/
    );
  });
});
