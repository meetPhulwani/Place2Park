import type { Request, Response, NextFunction } from "express";

/** Production driver booking cap. Tests must not change these values. */
export const BOOKING_RATE_LIMIT = 10;
export const BOOKING_RATE_WINDOW_MS = 10 * 60_000;

/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for a single-node deployment; swap the store for Redis when scaling out.
 */
const buckets = new Map<string, number[]>();

/** Test-only: clear the in-process store so suites do not inherit prior hits. */
export function resetRateLimitStore() {
  buckets.clear();
}

export function rateLimitHit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/** Express middleware factory. Keyed by user id when authenticated, else IP. */
export function rateLimit(name: string, limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const who = (req as Request & { userId?: string }).userId ?? req.ip ?? "anon";
    if (!rateLimitHit(`${name}:${who}`, limit, windowMs)) {
      res.status(429).json({ success: false, message: "Too many requests. Try again shortly." });
      return;
    }
    next();
  };
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    const fresh = v.filter((t) => now - t < 15 * 60000);
    if (fresh.length === 0) buckets.delete(k);
    else buckets.set(k, fresh);
  }
}, 5 * 60000);
cleanup.unref();
