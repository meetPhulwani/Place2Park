import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env } from "../config/env.js";
import {
  deliverPasswordResetLink,
  describeSmtpError,
  evaluateEmailDeliveryConfig,
  extractEmailAddress,
  isPlaceholderEmail,
  isSmtpConfigured,
  sendMail,
  smtpTransportOptions,
} from "./email.js";

describe("SMTP env wiring", () => {
  it("exposes SMTP fields loaded from server/.env", () => {
    assert.equal(typeof env.SMTP_HOST, "string");
    assert.equal(typeof env.SMTP_PORT, "number");
    assert.equal(typeof env.SMTP_USER, "string");
    assert.equal(typeof env.SMTP_PASS, "string");
    assert.equal(typeof env.EMAIL_FROM, "string");
    assert.equal(typeof env.ADMIN_NOTIFICATION_EMAIL, "string");
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
        deliverPasswordResetLink(
          { ...input, email: "driver@place2park.app" },
          {
          smtpReady: true,
          isProd: true,
          send: async () => {
            throw Object.assign(new Error("connect"), { code: "ECONNECTION" });
          },
          log: () => undefined,
          cfg: {
            SMTP_HOST: "smtp.example.com",
            SMTP_PORT: 587,
            SMTP_USER: "apikey",
            SMTP_PASS: "x",
            EMAIL_FROM: "Parkly <hello@place2park.app>",
          },
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

const smtpReady = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 587,
  SMTP_USER: "apikey",
  SMTP_PASS: "smtp-secret-should-never-appear",
  EMAIL_FROM: "Parkly <no-reply@parkly.example>",
  ADMIN_NOTIFICATION_EMAIL: "host-payout@parkly.test",
};

describe("production email address policy", () => {
  it("treats reserved and fixture domains as placeholders", () => {
    assert.equal(extractEmailAddress("Parkly <no-reply@parkly.example>"), "no-reply@parkly.example");
    assert.equal(isPlaceholderEmail("host-payout@parkly.test"), true);
    assert.equal(isPlaceholderEmail("admin@parkly.dev"), true);
    assert.equal(isPlaceholderEmail("no-reply@parkly.example"), true);
    assert.equal(isPlaceholderEmail("ops@place2park.app"), false);
  });

  it("does not send production mail to .test placeholder recipients", async () => {
    const sent: unknown[] = [];
    const warnings: string[] = [];
    await assert.rejects(
      () =>
        sendMail(
          { to: "host-payout@parkly.test", subject: "Payout", text: "paid ref NEFT123" },
          {
            cfg: { ...smtpReady, EMAIL_FROM: "Parkly <hello@place2park.app>" },
            isProd: true,
            send: async (msg) => {
              sent.push(msg);
            },
            log: (line) => warnings.push(line),
          }
        ),
      (err: unknown) => err instanceof Error && /placeholder|deliverable/i.test(err.message)
    );
    assert.equal(sent.length, 0);
    assert.equal(warnings.some((line) => line.includes("parkly.test")), true);
    assert.equal(warnings.some((line) => line.includes("smtp-secret-should-never-appear")), false);
    assert.equal(warnings.some((line) => line.includes("NEFT123")), false);
  });

  it("disables production sending when the sender or admin recipient is a placeholder", () => {
    const report = evaluateEmailDeliveryConfig({ ...smtpReady }, true);
    assert.equal(report.sendEnabled, false);
    assert.equal(report.adminNotifyEnabled, false);
    assert.ok(report.warnings.some((line) => line.includes("EMAIL_FROM")));
    assert.ok(report.warnings.some((line) => line.includes("ADMIN_NOTIFICATION_EMAIL")));
    assert.equal(report.warnings.some((line) => line.includes("smtp-secret-should-never-appear")), false);
  });

  it("enables production sending only with real sender and admin addresses", () => {
    const report = evaluateEmailDeliveryConfig(
      {
        ...smtpReady,
        EMAIL_FROM: "Parkly <hello@place2park.app>",
        ADMIN_NOTIFICATION_EMAIL: "ops@place2park.app",
      },
      true
    );
    assert.equal(report.sendEnabled, true);
    assert.equal(report.adminNotifyEnabled, true);
    assert.equal(report.adminRecipient, "ops@place2park.app");
  });

  it("warns and disables admin payout mail when ADMIN_NOTIFICATION_EMAIL is missing", () => {
    const report = evaluateEmailDeliveryConfig(
      {
        ...smtpReady,
        EMAIL_FROM: "Parkly <hello@place2park.app>",
        ADMIN_NOTIFICATION_EMAIL: "",
      },
      true
    );
    assert.equal(report.sendEnabled, true);
    assert.equal(report.adminNotifyEnabled, false);
    assert.ok(report.warnings.some((line) => line.includes("ADMIN_NOTIFICATION_EMAIL")));
  });
});
