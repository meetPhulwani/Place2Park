/** Isolated browser harness only. Production cannot enable this, even if the flag is present. */
export function e2eHooksEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.E2E_TEST_HOOKS === "1";
}
