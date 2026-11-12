import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { createShutdown } from "./shutdown.js";
import { closeSharedCounter, useCounterClientForTests } from "./utils/shared-counter.js";

function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  return new Promise<http.Server>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function portOf(server: http.Server) {
  const address = server.address();
  return typeof address === "object" && address ? address.port : 0;
}

describe("API shutdown", () => {
  it("finishes an ordinary request, then closes the database and redis once", async () => {
    let stopped = 0;
    let mongo = 0;
    let redis = 0;
    const exits: number[] = [];
    const server = await listen((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("done");
      }, 80);
    });
    const shutdown = createShutdown({
      server,
      deadlineMs: 2_000,
      stopBackground: () => {
        stopped += 1;
      },
      disconnectMongo: async () => {
        mongo += 1;
      },
      disconnectRedis: async () => {
        redis += 1;
        return "closed";
      },
      exit: (code) => {
        exits.push(code);
      },
    });

    const pending = fetch(`http://127.0.0.1:${portOf(server)}/health`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    shutdown("SIGTERM");
    shutdown("SIGINT");
    const response = await pending;
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "done");
    for (let i = 0; i < 20 && exits.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.deepEqual(exits, [0]);
    assert.equal(stopped, 1);
    assert.equal(mongo, 1);
    assert.equal(redis, 1);
    await assert.rejects(fetch(`http://127.0.0.1:${portOf(server)}/health`));
  });

  it("forces exit at the deadline without a second database close", async () => {
    let mongo = 0;
    const exits: number[] = [];
    const server = {
      closeIdleConnections() {},
      close() {},
    } as unknown as http.Server;
    const shutdown = createShutdown({
      server,
      deadlineMs: 30,
      disconnectMongo: async () => {
        mongo += 1;
      },
      disconnectRedis: async () => "absent",
      exit: (code) => {
        exits.push(code);
      },
    });
    shutdown("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(exits, [1]);
    assert.equal(mongo, 1);
  });
});

describe("shared redis close", () => {
  it("quits the open client and does nothing the next time", async () => {
    let quit = 0;
    useCounterClientForTests({
      eval: async () => [0, 0],
      scan: async () => ["0", []],
      del: async () => 0,
      quit: async () => {
        quit += 1;
      },
      disconnect() {},
      on() {},
    });
    assert.equal(await closeSharedCounter(), "closed");
    assert.equal(quit, 1);
    assert.equal(await closeSharedCounter(), "absent");
  });
});
