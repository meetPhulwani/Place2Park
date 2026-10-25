import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { shouldShowDemoAccounts } from "./demo-accounts.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("demo account credentials", () => {
  it("are shown only when the client is in development mode", () => {
    assert.equal(shouldShowDemoAccounts(true), true);
    assert.equal(shouldShowDemoAccounts(false), false);
    assert.equal(shouldShowDemoAccounts(undefined), false);
  });

  it("are gated on the login page and not hardcoded as always-visible copy", () => {
    const source = fs.readFileSync(path.join(here, "..", "pages", "auth", "login.tsx"), "utf8");
    assert.match(source, /import\.meta\.env\.DEV && shouldShowDemoAccounts\(import\.meta\.env\.DEV\)/);
    assert.match(source, /password123/);
    assert.match(source, /\{import\.meta\.env\.DEV &&/);
  });
});
