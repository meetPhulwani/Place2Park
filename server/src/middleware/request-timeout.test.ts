import assert from "node:assert/strict";
import http from "node:http";
import { after, describe, it } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { mongoConnectOptions, timeouts } from "../config/timeouts.js";
import { isCriticalRequest, requestTimeout, REQUEST_TIMEOUT_MESSAGE } from "./request-timeout.js";
import { CONSOLE_ABSOLUTE_MS, CONSOLE_IDLE_MS, CONSOLE_MAX_STEP_ATTEMPTS, CONSOLE_OTP_TTL_MS } from "../services/admin-auth.js";

function listen(app: express.Express) {
  const server = http.createServer(app);
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        port,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe("request timeout", () => {
  const previous = {
    request: process.env.REQUEST_TIMEOUT_MS,
    payment: process.env.PAYMENT_REQUEST_TIMEOUT_MS,
  };
  after(() => {
    if (previous.request === undefined) delete process.env.REQUEST_TIMEOUT_MS;
    else process.env.REQUEST_TIMEOUT_MS = previous.request;
    if (previous.payment === undefined) delete process.env.PAYMENT_REQUEST_TIMEOUT_MS;
    else process.env.PAYMENT_REQUEST_TIMEOUT_MS = previous.payment;
  });

  it("answers 503 when a normal handler never finishes", async () => {
    process.env.REQUEST_TIMEOUT_MS = "40";
    const app = express();
    app.use(requestTimeout);
    app.get("/api/slow", () => undefined);
    const server = await listen(app);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/slow`);
      const body = (await response.json()) as { success: boolean; message: string };
      assert.equal(response.status, 503);
      assert.equal(body.success, false);
      assert.equal(body.message, REQUEST_TIMEOUT_MESSAGE);
    } finally {
      await server.close();
    }
  });

  it("lets a payment verification finish inside its own budget", async () => {
    process.env.REQUEST_TIMEOUT_MS = "30";
    process.env.PAYMENT_REQUEST_TIMEOUT_MS = "400";
    const app = express();
    app.use(express.json());
    app.use(requestTimeout);
    app.post("/api/payments/verify", (_req, res) => {
      setTimeout(() => res.json({ success: true, data: { checked: true } }), 80);
    });
    const server = await listen(app);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/payments/verify`, { method: "POST" });
      const body = (await response.json()) as { success: boolean };
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(isCriticalRequest({ method: "POST", originalUrl: "/api/payments/verify" } as express.Request), true);
      assert.equal(isCriticalRequest({ method: "GET", originalUrl: "/api/bookings" } as express.Request), false);
    } finally {
      await server.close();
    }
  });
});

describe("database and admin session budgets", () => {
  it("bounds MongoDB server selection and keeps the console session policy", () => {
    const options = mongoConnectOptions();
    assert.equal(options.serverSelectionTimeoutMS, timeouts.mongoServerSelectionMs);
    assert.ok(options.connectTimeoutMS > 0);
    assert.ok(options.socketTimeoutMS >= options.serverSelectionTimeoutMS);
    assert.equal(options.retryReads, true);
    assert.equal(options.retryWrites, true);
    assert.equal(CONSOLE_IDLE_MS, 30 * 60 * 1000);
    assert.equal(CONSOLE_ABSOLUTE_MS, 8 * 60 * 60 * 1000);
    assert.equal(CONSOLE_OTP_TTL_MS, 5 * 60 * 1000);
    assert.equal(CONSOLE_MAX_STEP_ATTEMPTS, 5);
  });

  it("rejects a MongoDB server that does not answer", async () => {
    const connection = mongoose.createConnection();
    await assert.rejects(() =>
      connection.openUri("mongodb://127.0.0.1:1/parkly-timeout", {
        serverSelectionTimeoutMS: 300,
        connectTimeoutMS: 300,
      })
    );
    await connection.close().catch(() => undefined);
  });
});
