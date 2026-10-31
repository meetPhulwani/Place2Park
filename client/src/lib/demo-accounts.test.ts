import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("login page", () => {
  it("does not show demo account credentials", () => {
    const source = fs.readFileSync(path.join(here, "..", "pages", "auth", "login.tsx"), "utf8");
    assert.doesNotMatch(source, /password123/);
    assert.doesNotMatch(source, /parkly\.dev/);
    assert.doesNotMatch(source, /Demo accounts/);
    assert.doesNotMatch(source, /shouldShowDemoAccounts/);
  });
});
