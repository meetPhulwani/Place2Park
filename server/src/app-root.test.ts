import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { createApp } from "./app.js";

function listen(app: ReturnType<typeof createApp>) {
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

describe("API root and health", () => {
  it("answers GET / and GET /health, and keeps unknown routes as JSON 404", async () => {
    const server = await listen(createApp());
    try {
      const root = await fetch(`http://127.0.0.1:${server.port}/`);
      const rootBody = (await root.json()) as { success: boolean; message: string };
      assert.equal(root.status, 200);
      assert.deepEqual(rootBody, { success: true, message: "Place2Park API is running." });

      const health = await fetch(`http://127.0.0.1:${server.port}/health`);
      const healthBody = (await health.json()) as { success: boolean; data: { status: string; service: string } };
      assert.equal(health.status, 200);
      assert.deepEqual(healthBody, {
        success: true,
        data: { status: "ok", service: "Place2Park API" },
      });

      const missing = await fetch(`http://127.0.0.1:${server.port}/not-a-route`);
      const missingBody = (await missing.json()) as { success: boolean; message: string };
      assert.equal(missing.status, 404);
      assert.deepEqual(missingBody, { success: false, message: "Not found." });
    } finally {
      await server.close();
    }
  });
});
