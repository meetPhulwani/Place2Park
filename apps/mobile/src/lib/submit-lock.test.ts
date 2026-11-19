import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSubmitLock } from "./submit-lock";

describe("submit lock", () => {
  it("ignores a second submission while the first is still running", async () => {
    const run = createSubmitLock();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const first = run(async () => {
      calls += 1;
      await gate;
      return "done";
    });
    const second = await run(async () => {
      calls += 1;
      return "again";
    });
    assert.equal(second, undefined);
    release();
    assert.equal(await first, "done");
    assert.equal(calls, 1);
  });
});
