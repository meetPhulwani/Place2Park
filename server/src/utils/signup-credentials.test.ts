import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { passwordIssue, PASSWORD_MESSAGE } from "./password.js";
import { normalizeIndianMobile } from "./phone.js";
import { deliverSignupOtp } from "../services/sms.js";
import { otpResendWaitMs } from "../services/phone-otp.js";
import { signupSchema } from "./validation.js";

describe("signup credentials", () => {
  it("requires an uppercase letter, a number, a special character, and 8 characters", () => {
    assert.equal(passwordIssue("short1!"), PASSWORD_MESSAGE);
    assert.equal(passwordIssue("lowercase1!"), PASSWORD_MESSAGE);
    assert.equal(passwordIssue("NoNumber!"), PASSWORD_MESSAGE);
    assert.equal(passwordIssue("NoSpecial1"), PASSWORD_MESSAGE);
    assert.equal(passwordIssue("GoodPass1!"), null);
  });

  it("accepts Indian mobiles and stores them as +91", () => {
    assert.equal(normalizeIndianMobile("9876543210"), "+919876543210");
    assert.equal(normalizeIndianMobile("+91 98765 43210"), "+919876543210");
    assert.equal(normalizeIndianMobile("09876543210"), "+919876543210");
    assert.equal(normalizeIndianMobile("12345"), null);
    assert.equal(normalizeIndianMobile("5876543210"), null);
  });

  it("rejects a signup that skips the phone code or uses a weak password", () => {
    const weak = signupSchema.safeParse({
      name: "Aarav Mehta",
      email: "aarav@example.com",
      password: "password",
      phone: "9876543210",
      otp: "123456",
    });
    assert.equal(weak.success, false);

    const missingCode = signupSchema.safeParse({
      name: "Aarav Mehta",
      email: "aarav@example.com",
      password: "GoodPass1!",
      phone: "9876543210",
      otp: "",
    });
    assert.equal(missingCode.success, false);

    const ok = signupSchema.safeParse({
      name: "Aarav Mehta",
      email: "Aarav@Example.com",
      password: "GoodPass1!",
      phone: "9876543210",
      otp: "123456",
    });
    assert.equal(ok.success, true);
    if (ok.success) {
      assert.equal(ok.data.phone, "+919876543210");
      assert.equal(ok.data.email, "aarav@example.com");
    }
  });

  it("logs a development code only when SMS is not configured", async () => {
    const lines: string[] = [];
    const logged = await deliverSignupOtp("+919876543210", "123456", {
      isProd: false,
      cfg: {},
      log: (msg) => lines.push(msg),
    });
    assert.equal(logged, "logged");
    assert.equal(lines.some((line) => line.includes("123456")), true);

    await assert.rejects(
      () => deliverSignupOtp("+919876543210", "123456", { isProd: true, cfg: {}, log: () => {} }),
      /SMS is not configured/
    );
  });

  it("freezes the next code for one minute after a send", () => {
    const sentAt = new Date("2026-10-31T12:00:00.000Z");
    assert.equal(otpResendWaitMs(sentAt, sentAt.getTime() + 1_000), 59_000);
    assert.equal(otpResendWaitMs(sentAt, sentAt.getTime() + 60_000), 0);
    assert.equal(otpResendWaitMs(null), 0);
  });

  it("does not log the code when a sender is configured", async () => {
    const lines: string[] = [];
    let sent = "";
    const result = await deliverSignupOtp("+919876543210", "654321", {
      isProd: true,
      send: async (_phone, code) => {
        sent = code;
      },
      log: (msg) => lines.push(msg),
    });
    assert.equal(result, "sent");
    assert.equal(sent, "654321");
    assert.equal(lines.length, 0);
  });
});
