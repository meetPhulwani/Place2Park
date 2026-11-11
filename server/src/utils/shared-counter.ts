import { createRequire } from "node:module";
import { timeouts } from "../config/timeouts.js";
import { ApiError } from "../middleware/error.js";

export type CounterHit = { totalHits: number; resetTime: Date };

/** Atomic windowed counter. Two API processes must share one backend. */
export interface SharedCounter {
  increment(key: string, windowMs: number): Promise<CounterHit>;
  decrement(key: string): Promise<void>;
  reset(prefix?: string): Promise<void>;
}

/**
 * In-process counter whose increments are serialized.
 * Tests use one instance from two stores to stand in for two API processes.
 */
export class MemorySharedCounter implements SharedCounter {
  private hits = new Map<string, number[]>();
  private tail: Promise<unknown> = Promise.resolve();

  increment(key: string, windowMs: number): Promise<CounterHit> {
    const run = this.tail.then(() => {
      const now = Date.now();
      const fresh = (this.hits.get(key) ?? []).filter((at) => now - at < windowMs);
      fresh.push(now);
      this.hits.set(key, fresh);
      const oldest = fresh[0] ?? now;
      return { totalHits: fresh.length, resetTime: new Date(oldest + windowMs) };
    });
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  decrement(key: string): Promise<void> {
    const run = this.tail.then(() => {
      const hits = this.hits.get(key);
      if (hits?.length) hits.pop();
    });
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async reset(prefix?: string) {
    if (!prefix) {
      this.hits.clear();
      return;
    }
    for (const key of [...this.hits.keys()]) {
      if (key.startsWith(prefix)) this.hits.delete(key);
    }
  }
}

export const processCounter = new MemorySharedCounter();

const INCR = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

type RedisLike = {
  eval(script: string, keyCount: number, key: string, arg: string): Promise<unknown>;
  scan(cursor: string, ...args: string[]): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<unknown>;
};

export class RedisSharedCounter implements SharedCounter {
  constructor(private redis: RedisLike) {}

  async increment(key: string, windowMs: number): Promise<CounterHit> {
    const raw = (await this.redis.eval(INCR, 1, key, String(windowMs))) as [number, number];
    const totalHits = Number(raw?.[0] ?? 0);
    const ttl = Number(raw?.[1] ?? windowMs);
    return { totalHits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
  }

  async decrement(key: string) {
    await this.redis.eval("return redis.call('DECR', KEYS[1])", 1, key, "0");
  }

  async reset(prefix?: string) {
    let cursor = "0";
    const match = `${prefix ?? ""}*`;
    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", match, "COUNT", "100");
      cursor = next;
      if (keys.length) await this.redis.del(...keys);
    } while (cursor !== "0");
  }
}

let redisCounter: SharedCounter | null = null;

export function sharedCounter(): SharedCounter {
  const url = String(process.env.REDIS_URL ?? "").trim();
  if (!url) return processCounter;
  if (!redisCounter) redisCounter = new RedisSharedCounter(connectRedis(url));
  return redisCounter;
}

function connectRedis(url: string): RedisLike {
  const require = createRequire(import.meta.url);
  const Redis = require("ioredis") as new (
    url: string,
    options: object
  ) => RedisLike & { on: (event: string, fn: () => void) => void };
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: timeouts.redisConnectMs,
    commandTimeout: timeouts.redisCommandMs,
  });
  client.on("error", () => {
    console.error("[rate-limit] shared counter unavailable");
  });
  return client;
}

export function counterUnavailable() {
  return new ApiError(503, "We couldn't complete that step. Try again shortly.");
}

export function assertRedisUrl(nodeEnv: string, url: string) {
  if (nodeEnv !== "production") return;
  if (!/^rediss?:\/\//.test(url)) {
    throw new Error("REDIS_URL must be a redis:// or rediss:// connection string in production.");
  }
}
