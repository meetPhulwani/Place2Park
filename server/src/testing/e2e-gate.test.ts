import assert from "node:assert/strict";
import test from "node:test";
import { e2eHooksEnabled } from "./e2e-gate.js";

test("browser hooks stay off in production and unless the test flag is set", () => {
  const previousFlag = process.env.E2E_TEST_HOOKS;
  const previousEnv = process.env.NODE_ENV;
  try {
    process.env.E2E_TEST_HOOKS = "1";
    process.env.NODE_ENV = "production";
    assert.equal(e2eHooksEnabled(), false);
    process.env.NODE_ENV = "test";
    process.env.E2E_TEST_HOOKS = "";
    assert.equal(e2eHooksEnabled(), false);
    process.env.E2E_TEST_HOOKS = "1";
    assert.equal(e2eHooksEnabled(), true);
  } finally {
    if (previousFlag === undefined) delete process.env.E2E_TEST_HOOKS;
    else process.env.E2E_TEST_HOOKS = previousFlag;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});
