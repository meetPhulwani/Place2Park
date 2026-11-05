import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { rateLimit as expressRateLimit, type Store, type IncrementResponse } from "express-rate-limit";
import { ApiError } from "../middleware/error.js";
import { counterUnavailable, processCounter, sharedCounter, type SharedCounter } from "./shared-counter.js";

/** Production driver booking cap. Tests must not change these values. */
export const BOOKING_RATE_LIMIT = 10;
export const BOOKING_RATE_WINDOW_MS = 10 * 60_000;

/** Payment order creation cap. Keyed by authenticated user. */
export const PAYMENT_ORDER_LIMIT = 10;
export const PAYMENT_ORDER_WINDOW_MS = 10 * 60_000;

export const API_LIMIT = 120;
export const API_WINDOW_MS = 60_000;

export const LOGIN_LIMIT = 10;
export const LOGIN_WINDOW_MS = 15 * 60_000;

export const SIGNUP_LIMIT = 5;
export const SIGNUP_WINDOW_MS = 15 * 60_000;

export const OTP_VERIFY_LIMIT = 5;
export const OTP_VERIFY_WINDOW_MS = 10 * 60_000;

export const OTP_RESEND_LIMIT = 3;
export const OTP_RESEND_WINDOW_MS = 15 * 60_000;

export const PASSWORD_RESET_LIMIT = 3;
export const PASSWORD_RESET_WINDOW_MS = 15 * 60_000;

export const GOOGLE_AUTH_LIMIT = 10;
export const GOOGLE_AUTH_WINDOW_MS = 15 * 60_000;

/** High ceiling so Razorpay retries are not cut off with the public API budget. */
export const WEBHOOK_RATE_LIMIT = 300;
export const WEBHOOK_RATE_WINDOW_MS = 60_000;

const WINDOW_MAX_MS = 24 * 60 * 60_000;

/**
 * Optional override. Empty, zero, and non-integers keep the coded default.
 */
export function positiveIntEnv(name: string, fallback: number, max = 1_000_000) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) return fallback;
  return n;
}

const RATE_LIMIT_MESSAGE = "Too many requests. Try again shortly.";

type AuditCategory = "api" | "auth" | "otp" | "booking" | "payment";

type AuthedRequest = Request & { userId?: string };

/** Local fallback window used only by non-sensitive limiters when Redis is down. */
const buckets = new Map<string, number[]>();
const denyCounts = new Map<string, number>();

/** Test-only: clear the in-process store so suites do not inherit prior hits. */
export function resetRateLimitStore() {
  buckets.clear();
  denyCounts.clear();
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

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** Express `req.ip` only. The leftmost X-Forwarded-For value is not trusted on its own. */
export function clientAddress(req: Request): string {
  return req.ip || "anon";
}

export function ipKey(req: Request): string {
  return `ip:${hashId(clientAddress(req))}`;
}

export function actorKey(req: Request): string {
  const userId = (req as AuthedRequest).userId;
  if (userId) return `user:${hashId(userId)}`;
  return ipKey(req);
}

function bodyField(req: Request, field: string): string {
  const body = req.body as Record<string, unknown> | undefined;
  return String(body?.[field] ?? "").trim();
}

export function emailKey(req: Request): string {
  const email = bodyField(req, "email").toLowerCase();
  return email ? `email:${hashId(email)}` : "email:missing";
}

export function challengeKey(req: Request): string {
  const token = bodyField(req, "pendingToken");
  return token ? `challenge:${hashId(token)}` : "challenge:missing";
}

export function resetTokenKey(req: Request): string {
  const token = bodyField(req, "token");
  return token ? `reset:${hashId(token)}` : "reset:missing";
}

class SlidingWindowStore implements Store {
  localKeys = true;
  windowMs = 60_000;
  prefix: string;
  constructor(prefix: string) {
    this.prefix = prefix;
  }
  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
  }
  increment(key: string): IncrementResponse {
    const full = `${this.prefix}${key}`;
    const now = Date.now();
    const hits = (buckets.get(full) ?? []).filter((t) => now - t < this.windowMs);
    hits.push(now);
    buckets.set(full, hits);
    const oldest = hits[0] ?? now;
    return { totalHits: hits.length, resetTime: new Date(oldest + this.windowMs) };
  }
  decrement(key: string) {
    const full = `${this.prefix}${key}`;
    const hits = buckets.get(full);
    if (hits?.length) hits.pop();
  }
  resetKey(key: string) {
    buckets.delete(`${this.prefix}${key}`);
  }
  resetAll() {
    for (const key of [...buckets.keys()]) {
      if (key.startsWith(this.prefix)) buckets.delete(key);
    }
  }
}

/** Store that always fails, so tests can prove the fallback still enforces a limit. */
export class UnavailableRateLimitStore implements Store {
  localKeys = true;
  prefix = "unavailable:";
  init() {}
  increment(): IncrementResponse {
    throw new Error("rate limit store unavailable");
  }
  decrement() {}
  resetKey() {}
}

function resilientStore(primary: Store, fallback: SlidingWindowStore): Store {
  return {
    localKeys: true,
    prefix: primary.prefix,
    init(options) {
      primary.init?.(options);
      fallback.init?.(options);
    },
    async increment(key) {
      try {
        return await primary.increment(key);
      } catch (err) {
        if (err instanceof ApiError) throw err;
        console.error("[rate-limit] shared counter unavailable; enforcing local limit", {
          name: err instanceof Error ? err.name : "Error",
        });
        return fallback.increment(key);
      }
    },
    decrement(key) {
      try {
        primary.decrement(key);
      } catch {
        fallback.decrement(key);
      }
    },
    resetKey(key) {
      try {
        primary.resetKey(key);
      } catch {
        fallback.resetKey(key);
      }
    },
    resetAll() {
      primary.resetAll?.();
      fallback.resetAll?.();
    },
  };
}

function sensitiveLimiter(name: string) {
  return /^(console-|login|signup|google|otp|password-reset|forgot|reset)/.test(name);
}

function auditFor(name: string, explicit?: AuditCategory): AuditCategory | undefined {
  if (explicit) return explicit;
  if (name === "api") return "api";
  if (name === "booking") return "booking";
  if (name === "pay-order" || name === "pay-verify") return "payment";
  if (name.startsWith("login") || name.startsWith("signup") || name === "google" || name.startsWith("forgot") || name.startsWith("reset")) {
    return "auth";
  }
  if (name.startsWith("email-otp") || name.startsWith("otp")) return "otp";
  return undefined;
}

function noteViolation(category: AuditCategory | undefined, limiter: string, key: string) {
  if (!category) return;
  const id = `${category}:${limiter}:${hashId(key)}`;
  const count = (denyCounts.get(id) ?? 0) + 1;
  denyCounts.set(id, count);
  if (category === "api" && count % 10 !== 0) return;
  const event = count >= 3 ? "rate_limit_abuse" : "rate_limit_exceeded";
  console.warn(JSON.stringify({ event, category, limiter, keyHash: hashId(key).slice(0, 12), count }));
}

type RateLimitOptions = {
  key?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  audit?: AuditCategory;
  store?: Store;
  /** Auth and admin limits reject the request when the shared counter is down. */
  failClosed?: boolean;
  counter?: SharedCounter;
};

class SharedWindowStore implements Store {
  localKeys = true;
  windowMs = 60_000;
  prefix: string;
  failClosed: boolean;
  counter: SharedCounter;
  constructor(prefix: string, counter: SharedCounter, failClosed: boolean) {
    this.prefix = prefix;
    this.counter = counter;
    this.failClosed = failClosed;
  }
  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
  }
  async increment(key: string): Promise<IncrementResponse> {
    try {
      return await this.counter.increment(`${this.prefix}${key}`, this.windowMs);
    } catch (err) {
      if (this.failClosed) throw counterUnavailable();
      throw err;
    }
  }
  async decrement(key: string) {
    await this.counter.decrement(`${this.prefix}${key}`);
  }
  async resetKey(key: string) {
    await this.counter.reset(`${this.prefix}${key}`);
  }
  async resetAll() {
    await this.counter.reset(this.prefix);
  }
}

const testStores: Array<{ resetAll?: () => void }> = [];

/** Clears in-memory windows. Used by security tests so one process can exercise many login attempts. */
export function resetRateLimitStoresForTests() {
  if (process.env.NODE_ENV === "production") return;
  for (const store of testStores) store.resetAll?.();
  void processCounter.reset();
}

/** Express middleware. Defaults to the authenticated user id, otherwise the trusted client IP. */
export function rateLimit(name: string, limit: number, windowMs: number, options: RateLimitOptions = {}): RequestHandler {
  const keyFn = options.key ?? actorKey;
  const failClosed = options.failClosed ?? sensitiveLimiter(name);
  const primary =
    options.store ??
    new SharedWindowStore(`${name}:`, options.counter ?? sharedCounter(), failClosed);
  const store = failClosed ? primary : resilientStore(primary, new SlidingWindowStore(`${name}:fallback:`));
  testStores.push(store);
  const category = auditFor(name, options.audit);
  return expressRateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    passOnStoreError: false,
    store,
    skip: (req) => options.skip?.(req) ?? false,
    keyGenerator: (req) => keyFn(req),
    handler: (req, res) => {
      noteViolation(category, name, keyFn(req));
      if (res.getHeader("Retry-After") == null) {
        const info = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
        const resetMs = info?.resetTime instanceof Date ? info.resetTime.getTime() - Date.now() : windowMs;
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil(resetMs / 1000))));
      }
      res.status(429).json({ success: false, message: RATE_LIMIT_MESSAGE });
    },
  });
}

export const apiLimiter = rateLimit(
  "api",
  positiveIntEnv("RATE_LIMIT_API", API_LIMIT),
  positiveIntEnv("RATE_LIMIT_API_WINDOW_MS", API_WINDOW_MS, WINDOW_MAX_MS),
  {
    key: ipKey,
    skip: (req) => req.path === "/payments/webhook",
  }
);

export const loginIpLimiter = rateLimit(
  "login-ip",
  positiveIntEnv("RATE_LIMIT_LOGIN", LOGIN_LIMIT),
  positiveIntEnv("RATE_LIMIT_LOGIN_WINDOW_MS", LOGIN_WINDOW_MS, WINDOW_MAX_MS),
  { key: ipKey, audit: "auth" }
);
export const loginAccountLimiter = rateLimit(
  "login-account",
  positiveIntEnv("RATE_LIMIT_LOGIN", LOGIN_LIMIT),
  positiveIntEnv("RATE_LIMIT_LOGIN_WINDOW_MS", LOGIN_WINDOW_MS, WINDOW_MAX_MS),
  { key: emailKey, audit: "auth" }
);

export const signupIpLimiter = rateLimit(
  "signup-ip",
  positiveIntEnv("RATE_LIMIT_SIGNUP", SIGNUP_LIMIT),
  positiveIntEnv("RATE_LIMIT_SIGNUP_WINDOW_MS", SIGNUP_WINDOW_MS, WINDOW_MAX_MS),
  { key: ipKey, audit: "auth" }
);
export const signupAccountLimiter = rateLimit(
  "signup-account",
  positiveIntEnv("RATE_LIMIT_SIGNUP", SIGNUP_LIMIT),
  positiveIntEnv("RATE_LIMIT_SIGNUP_WINDOW_MS", SIGNUP_WINDOW_MS, WINDOW_MAX_MS),
  { key: emailKey, audit: "auth" }
);

export const googleAuthLimiter = rateLimit(
  "google",
  positiveIntEnv("RATE_LIMIT_GOOGLE", GOOGLE_AUTH_LIMIT),
  positiveIntEnv("RATE_LIMIT_GOOGLE_WINDOW_MS", GOOGLE_AUTH_WINDOW_MS, WINDOW_MAX_MS),
  { key: ipKey, audit: "auth" }
);

export const otpVerifyChallengeLimiter = rateLimit(
  "otp-verify-challenge",
  positiveIntEnv("RATE_LIMIT_OTP_VERIFY", OTP_VERIFY_LIMIT),
  positiveIntEnv("RATE_LIMIT_OTP_VERIFY_WINDOW_MS", OTP_VERIFY_WINDOW_MS, WINDOW_MAX_MS),
  { key: challengeKey, audit: "otp" }
);
export const otpVerifyIpLimiter = rateLimit(
  "otp-verify-ip",
  positiveIntEnv("RATE_LIMIT_OTP_VERIFY_IP", 20),
  positiveIntEnv("RATE_LIMIT_OTP_VERIFY_WINDOW_MS", OTP_VERIFY_WINDOW_MS, WINDOW_MAX_MS),
  { key: ipKey, audit: "otp" }
);

export const otpResendAccountLimiter = rateLimit(
  "otp-resend-account",
  positiveIntEnv("RATE_LIMIT_OTP_RESEND", OTP_RESEND_LIMIT),
  positiveIntEnv("RATE_LIMIT_OTP_RESEND_WINDOW_MS", OTP_RESEND_WINDOW_MS, WINDOW_MAX_MS),
  { key: challengeKey, audit: "otp" }
);
export const otpResendIpLimiter = rateLimit(
  "otp-resend-ip",
  positiveIntEnv("RATE_LIMIT_OTP_RESEND_IP", 10),
  positiveIntEnv("RATE_LIMIT_OTP_RESEND_WINDOW_MS", OTP_RESEND_WINDOW_MS, WINDOW_MAX_MS),
  { key: ipKey, audit: "otp" }
);

export const passwordResetIpLimiter = rateLimit(
  "password-reset-ip",
  positiveIntEnv("RATE_LIMIT_PASSWORD_RESET", PASSWORD_RESET_LIMIT),
  positiveIntEnv("RATE_LIMIT_PASSWORD_RESET_WINDOW_MS", PASSWORD_RESET_WINDOW_MS, WINDOW_MAX_MS),
  { key: ipKey, audit: "auth" }
);
export const passwordResetAccountLimiter = rateLimit(
  "password-reset-account",
  positiveIntEnv("RATE_LIMIT_PASSWORD_RESET", PASSWORD_RESET_LIMIT),
  positiveIntEnv("RATE_LIMIT_PASSWORD_RESET_WINDOW_MS", PASSWORD_RESET_WINDOW_MS, WINDOW_MAX_MS),
  { key: emailKey, audit: "auth" }
);
export const passwordResetTokenLimiter = rateLimit(
  "password-reset-token",
  positiveIntEnv("RATE_LIMIT_PASSWORD_RESET", PASSWORD_RESET_LIMIT),
  positiveIntEnv("RATE_LIMIT_PASSWORD_RESET_WINDOW_MS", PASSWORD_RESET_WINDOW_MS, WINDOW_MAX_MS),
  { key: resetTokenKey, audit: "auth" }
);

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    const fresh = v.filter((t) => now - t < 15 * 60000);
    if (fresh.length === 0) buckets.delete(k);
    else buckets.set(k, fresh);
  }
}, 5 * 60000);
cleanup.unref();
