import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { showHostColumn } from "./footer.tsx";

describe("footer host column", () => {
  it("shows host links to visitors, providers, and all-rounders", () => {
    assert.equal(showHostColumn(null), true);
    assert.equal(showHostColumn(undefined), true);
    assert.equal(showHostColumn("HOST"), true);
    assert.equal(showHostColumn("BOTH"), true);
  });

  it("hides host links from a seeker", () => {
    assert.equal(showHostColumn("DRIVER"), false);
    assert.equal(showHostColumn("driver"), false);
  });
});
