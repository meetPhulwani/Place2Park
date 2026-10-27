import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env } from "../config/env.js";
import {
  deliverPasswordResetLink,
  describeSmtpError,
  evaluateEmailDeliveryConfig,
  extractEmailAddress,
  isPlaceholderEmail,
  describeEmailError,
  isEmailConfigured,
  isResendConfigured,
  isSmtpConfigured,
  sendMail,
  sendSmtpTestMessage,
  smtpTransportOptions,
  RESEND_EMAILS_URL,
} from "./email.js";

describe("SMTP env wiring", () => {
  it("exposes SMTP fields loaded from server/.env", () => {
    assert.equal(typeof env.SMTP_HOST, "string");
    assert.equal(typeof env.SMTP_PORT, "number");
    assert.equal(typeof env.SMTP_USER, "string");
    assert.equal(typeof env.SMTP_PASS, "string");
    assert.equal(typeof env.EMAIL_FROM, "string");
    assert.equal(typeof env.ADMIN_NOTIFICATION_EMAIL, "string");
    assert.equal(typeof env.SMTP_TEST_RECIPIENT, "string");
    assert.equal(typeof env.RESEND_API_KEY, "string");
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
      /Email is not configured/
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

describe("explicit SMTP test message", () => {
  const deliverable = {
    ...smtpReady,
    EMAIL_FROM: "Parkly <hello@place2park.app>",
    ADMIN_NOTIFICATION_EMAIL: "ops@place2park.app",
    SMTP_TEST_RECIPIENT: "me@place2park.app",
  };

  it("sends only when confirm is true and the recipient is the configured test inbox", async () => {
    const sent: { to?: string; from?: string; subject?: string; text?: string }[] = [];
    const result = await sendSmtpTestMessage(
      { to: "me@place2park.app", confirm: true },
      {
        cfg: deliverable,
        isProd: true,
        send: async (msg) => {
          sent.push(msg);
        },
      }
    );
    assert.equal(result.sent, true);
    assert.equal(result.to, "me@place2park.app");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "me@place2park.app");
    assert.match(String(sent[0]?.from), /hello@place2park.app/);
    assert.match(String(sent[0]?.subject), /Place2Park SMTP test/i);
    assert.doesNotMatch(JSON.stringify(result), /smtp-secret-should-never-appear/);
  });

  it("does not send without explicit confirm, to fixtures, or to an unlisted address", async () => {
    const sent: unknown[] = [];
    const send = async (msg: unknown) => {
      sent.push(msg);
    };
    await assert.rejects(
      () => sendSmtpTestMessage({ to: "me@place2park.app", confirm: false }, { cfg: deliverable, isProd: true, send }),
      /confirm/i
    );
    await assert.rejects(
      () => sendSmtpTestMessage({ to: "host-payout@parkly.test", confirm: true }, { cfg: deliverable, isProd: true, send }),
      /deliverable|placeholder|configured/i
    );
    await assert.rejects(
      () => sendSmtpTestMessage({ to: "driver@parkly.dev", confirm: true }, { cfg: deliverable, isProd: true, send }),
      /configured|placeholder|deliverable/i
    );
    await assert.rejects(
      () => sendSmtpTestMessage({ to: "someone-else@gmail.com", confirm: true }, { cfg: deliverable, isProd: true, send }),
      /configured test recipient/i
    );
    assert.equal(sent.length, 0);
  });
});

const resendOnly = {
  SMTP_HOST: "",
  SMTP_PORT: 0,
  SMTP_USER: "",
  SMTP_PASS: "",
  RESEND_API_KEY: "re_test_secret_should_never_appear",
  EMAIL_FROM: "Place2Park <hello@place2park.app>",
  ADMIN_NOTIFICATION_EMAIL: "ops@place2park.app",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("Resend HTTPS delivery", () => {
  it("treats a Resend API key as configured email even without SMTP", () => {
    assert.equal(isResendConfigured(resendOnly), true);
    assert.equal(isEmailConfigured(resendOnly), true);
    assert.equal(isSmtpConfigured(resendOnly), false);
    assert.equal(
      isEmailConfigured({
        SMTP_HOST: "",
        SMTP_PORT: 0,
        SMTP_USER: "",
        SMTP_PASS: "",
        RESEND_API_KEY: "",
      }),
      false
    );
    const report = evaluateEmailDeliveryConfig(resendOnly, true);
    assert.equal(report.sendEnabled, true);
    assert.equal(report.adminNotifyEnabled, true);
  });

  it("sends through the Resend HTTPS API and does not use SMTP", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const logs: string[] = [];
    await sendMail(
      { to: "driver@place2park.app", subject: "Booking confirmed 🎉", text: "Your parking is confirmed." },
      {
        cfg: resendOnly,
        isProd: true,
        log: (line) => logs.push(line),
        fetch: async (url, init) => {
          calls.push({ url, init });
          return jsonResponse(200, { id: "msg_1" });
        },
      }
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, RESEND_EMAILS_URL);
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.equal(body.from, resendOnly.EMAIL_FROM);
    assert.deepEqual(body.to, ["driver@place2park.app"]);
    assert.equal(body.subject, "Booking confirmed 🎉");
    assert.equal(body.text, "Your parking is confirmed.");
    assert.match(String((calls[0]?.init.headers as { Authorization?: string }).Authorization), /Bearer re_/);
    assert.equal(logs.some((line) => line.includes("re_test_secret_should_never_appear")), false);
  });

  it("maps provider errors without logging the API key or message body", async () => {
    const logs: string[] = [];
    await assert.rejects(
      () =>
        sendMail(
          { to: "driver@place2park.app", subject: "Booking cancelled", text: "secret booking body NEFT999" },
          {
            cfg: resendOnly,
            isProd: true,
            log: (line) => logs.push(line),
            fetch: async () => jsonResponse(403, { name: "validation_error", message: "domain not verified NEFT999" }),
          }
        ),
      /Resend 403/
    );
    const described = describeEmailError(
      Object.assign(new Error("Resend 403 validation_error"), {
        provider: "resend",
        status: 403,
        name: "validation_error",
      })
    );
    assert.match(described, /Resend/);
    assert.match(described, /403/);
    assert.doesNotMatch(described, /re_test_secret_should_never_appear/);
    assert.doesNotMatch(described, /NEFT999/);
    assert.equal(logs.some((line) => line.includes("re_test_secret_should_never_appear")), false);
    assert.equal(logs.some((line) => line.includes("NEFT999")), false);
  });

  it("times out a hung Resend request without treating it as sent", async () => {
    await assert.rejects(
      () =>
        sendMail(
          { to: "driver@place2park.app", subject: "Host payout", text: "paid" },
          {
            cfg: resendOnly,
            isProd: true,
            timeoutMs: 25,
            fetch: () => new Promise(() => undefined),
          }
        ),
      /timeout contacting Resend/i
    );
  });

  it("refuses to send when no Resend key or SMTP transport is configured", async () => {
    await assert.rejects(
      () =>
        sendMail(
          { to: "driver@place2park.app", subject: "Reset", text: "link" },
          {
            cfg: {
              SMTP_HOST: "",
              SMTP_PORT: 0,
              SMTP_USER: "",
              SMTP_PASS: "",
              RESEND_API_KEY: "",
              EMAIL_FROM: "Place2Park <hello@place2park.app>",
            },
            isProd: true,
          }
        ),
      /Email is not configured/
    );
  });

  it("skips placeholder recipients on the Resend path and does not call the provider", async () => {
    const calls: unknown[] = [];
    const warnings: string[] = [];
    await assert.rejects(
      () =>
        sendMail(
          { to: "host-payout@parkly.test", subject: "Payout", text: "paid ref NEFT123" },
          {
            cfg: resendOnly,
            isProd: true,
            fetch: async (url, init) => {
              calls.push({ url, init });
              return jsonResponse(200, { id: "should-not-send" });
            },
            log: (line) => warnings.push(line),
          }
        ),
      /placeholder|deliverable/i
    );
    assert.equal(calls.length, 0);
    assert.equal(warnings.some((line) => /placeholder|parkly\.test/i.test(line)), true);
    assert.equal(warnings.some((line) => line.includes("re_test_secret_should_never_appear")), false);
    assert.equal(warnings.some((line) => line.includes("NEFT123")), false);
  });
});
