import type { Server } from "node:http";

/** Docker's stop grace period is 20s, so this deadline finishes first. */
export const SHUTDOWN_DEADLINE_MS = 15_000;

export type RedisCloseResult = "closed" | "absent";

export type ShutdownHooks = {
  server: Server;
  deadlineMs?: number;
  stopBackground?: () => void;
  disconnectMongo?: () => Promise<unknown>;
  disconnectRedis?: () => Promise<RedisCloseResult | void>;
  exit?: (code: number) => void;
};

/**
 * Stops new HTTP work and closes MongoDB and Redis.
 * In-flight requests, including payments, finish on their own.
 * Shutdown does not retry charges, captures, refunds, bookings, or payouts,
 * and it does not mark a payment failed.
 */
export function createShutdown(hooks: ShutdownHooks) {
  let closing = false;
  let storesClosed = false;
  return function shutdown(signal: string) {
    if (closing) {
      console.info("[server] shutdown already in progress");
      return;
    }
    closing = true;
    console.info(`[server] ${signal} received, closing`);
    try {
      hooks.stopBackground?.();
    } catch {
      console.error("[server] background stop failed");
    }

    const exit = hooks.exit ?? ((code: number) => process.exit(code));
    const deadlineMs = hooks.deadlineMs ?? SHUTDOWN_DEADLINE_MS;
    let exited = false;
    const leave = (code: number) => {
      if (exited) return;
      exited = true;
      exit(code);
    };

    const closeStores = async () => {
      if (storesClosed) return;
      storesClosed = true;
      try {
        await hooks.disconnectMongo?.();
        console.info("[server] database disconnected");
      } catch {
        console.error("[server] database disconnect failed");
      }
      try {
        const redis = await hooks.disconnectRedis?.();
        console.info(redis === "absent" ? "[server] redis was not connected" : "[server] redis disconnected");
      } catch {
        console.error("[server] redis disconnect failed");
      }
    };

    const idle = setInterval(() => {
      if (typeof hooks.server.closeIdleConnections === "function") hooks.server.closeIdleConnections();
    }, 200);
    idle.unref();
    const stopIdle = () => clearInterval(idle);
    const force = setTimeout(() => {
      stopIdle();
      console.error("[server] shutdown deadline reached");
      void closeStores().finally(() => leave(1));
      setTimeout(() => leave(1), 1_000);
    }, deadlineMs);
    console.info("[server] stopped accepting connections");
    hooks.server.close(() => {
      stopIdle();
      void closeStores().finally(() => {
        clearTimeout(force);
        leave(0);
      });
    });
  };
}
