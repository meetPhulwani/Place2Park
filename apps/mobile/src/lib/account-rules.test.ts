import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESET_SENT_MESSAGE, emailIssue, loginIssues, normalizeIndianMobile, passwordIssue, resetIssues, signupIssues } from "./account-rules";

describe("account rules", () => {
  it("validates login before a request", () => {
    const empty = loginIssues("not-an-email", "");
    assert.equal(empty.email, "Enter a valid email.");
    assert.equal(empty.password, "Enter your password.");
    const ok = loginIssues("asha@place2park.test", "secret");
    assert.equal(ok.email, null);
    assert.equal(ok.password, null);
    assert.equal(loginIssues("asha@place2park.test", "x".repeat(101)).password, "Password must be 100 characters or fewer.");
  });

  it("follows the API password, phone, and signup rules", () => {
    assert.equal(passwordIssue("short"), passwordIssue("alllowercase1!"));
    assert.equal(passwordIssue("Secret123!"), null);
    assert.equal(normalizeIndianMobile("9876543210"), "+919876543210");
    assert.equal(normalizeIndianMobile("+91 98765 43210"), "+919876543210");
    assert.equal(normalizeIndianMobile("12345"), null);
    const issues = signupIssues({ name: "A", email: "bad", password: "nope", phone: "111" });
    assert.ok(issues.name && issues.email && issues.password && issues.phone);
    const reset = resetIssues("short", "Secret123!");
    assert.ok(reset.token);
    assert.equal(reset.password, null);
    assert.equal(emailIssue("asha@place2park.test"), null);
    assert.equal(RESET_SENT_MESSAGE.includes("does not exist"), false);
    assert.match(RESET_SENT_MESSAGE, /does not confirm/i);
  });
});
