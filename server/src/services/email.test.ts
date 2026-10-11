import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env } from "../config/env.js";
import {
  deliverPasswordResetLink,
  describeSmtpError,
  isSmtpConfigured,
  smtpTransportOptions,
} from "./email.js";

describe("SMTP env wiring", () => {
  it("exposes SMTP fields loaded from server/.env", () => {
    assert.equal(typeof env.SMTP_HOST, "string");
    assert.equal(typeof env.SMTP_PORT, "number");
    assert.equal(typeof env.SMTP_USER, "string");
    assert.equal(typeof env.SMTP_PASS, "string");
    assert.equal(typeof env.EMAIL_FROM, "string");
  });

  it("treats SMTP as configured only when host, port, user, and pass are present", () => {
    assert.equal(
      isSmtpConfigured({ SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "u", SMTP_PASS: "p" }),
      false
    );
    assert.equal(
      isSmtpConfigured({ SMTP_HOST: "smtp.example.com", SMTP_PORT: 0, SMTP_USER: "u", SMTP_PASS: "p" }),
      false
    );
    assert.equal(
      isSmtpConfigured({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: 587,
        SMTP_USER: "u",
        SMTP_PASS: "p",
      }),
      true
    );
  });

  it("builds STARTTLS options for 587 and implicit TLS for 465", () => {
    const starttls = smtpTransportOptions({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 587,
      SMTP_USER: "user",
      SMTP_PASS: "pass",
    });
    assert.equal(starttls.host, "smtp.example.com");
    assert.equal(starttls.port, 587);
    assert.equal(starttls.secure, false);
    assert.ok(starttls.auth);

    const implicit = smtpTransportOptions({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 465,
      SMTP_USER: "user",
      SMTP_PASS: "pass",
    });
    assert.equal(implicit.secure, true);
  });
});

describe("password-reset email delivery", () => {
  const token = "reset-token-fixture";
  const input = {
    email: "driver@example.com",
    token,
    clientUrl: "http://localhost:5173",
  };

  it("sends the reset link through SMTP and does not log the raw token", async () => {
    const sent: { to?: string; subject?: string; text?: string }[] = [];
    const logs: string[] = [];
    const result = await deliverPasswordResetLink(input, {
      smtpReady: true,
      isProd: false,
      send: async (msg) => {
        sent.push(msg);
      },
      log: (msg) => logs.push(msg),
    });
    assert.equal(result, "sent");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, input.email);
    assert.match(String(sent[0]?.text), /\/reset-password\?token=reset-token-fixture/);
    assert.equal(
      logs.some((line) => line.includes(token) || line.includes("reset-password?token=")),
      false
    );
  });

  it("logs the reset link only in development when SMTP is not configured", async () => {
    const logs: string[] = [];
    const result = await deliverPasswordResetLink(input, {
      smtpReady: false,
      isProd: false,
      send: async () => {
        throw new Error("SMTP should not be called");
      },
      log: (msg) => logs.push(msg),
    });
    assert.equal(result, "logged");
    assert.equal(logs.length, 1);
    assert.match(logs[0] ?? "", /\/reset-password\?token=reset-token-fixture/);
  });

  it("does not log the token in production when SMTP is missing; fails instead", async () => {
    const logs: string[] = [];
    await assert.rejects(
      () =>
        deliverPasswordResetLink(input, {
          smtpReady: false,
          isProd: true,
          send: async () => undefined,
          log: (msg) => logs.push(msg),
        }),
      /SMTP is not configured/
    );
    assert.equal(
      logs.some((line) => line.includes(token) || line.includes("reset-password?token=")),
      false
    );
  });

  it("surfaces send failures so the API cannot report a false success", async () => {
    await assert.rejects(
      () =>
        deliverPasswordResetLink(input, {
          smtpReady: true,
          isProd: true,
          send: async () => {
            throw Object.assign(new Error("connect"), { code: "ECONNECTION" });
          },
          log: () => undefined,
        }),
      /ECONNECTION|connect|SMTP/
    );
  });

  it("describes SMTP errors without passwords or reset tokens", () => {
    const desc = describeSmtpError({
      code: "EAUTH",
      command: "AUTH LOGIN",
      responseCode: 535,
      message: "Invalid login pass=super-secret token=reset-token-fixture",
    });
    assert.match(desc, /EAUTH/);
    assert.match(desc, /535/);
    assert.doesNotMatch(desc, /super-secret/);
    assert.doesNotMatch(desc, /reset-token-fixture/);
  });
});
