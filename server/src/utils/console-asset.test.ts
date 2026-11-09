import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consoleAssetType } from "./console-asset.js";

describe("console asset types", () => {
  it("serves stylesheets as CSS so browsers apply them", () => {
    assert.equal(consoleAssetType("client/dist-console/assets/console-abc.css"), "text/css; charset=utf-8");
    assert.equal(consoleAssetType("console.html"), "text/html; charset=utf-8");
    assert.equal(consoleAssetType("assets/console.js"), "text/javascript; charset=utf-8");
  });

  it("does not label a stylesheet as a generic download", () => {
    assert.notEqual(consoleAssetType("assets/console.css"), "application/octet-stream");
  });
});
