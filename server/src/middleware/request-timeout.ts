import type { NextFunction, Request, Response } from "express";
import { timeouts } from "../config/timeouts.js";

export const REQUEST_TIMEOUT_MESSAGE = "The request took too long. Please try again.";

/** Payment and booking mutations finish their own provider timeout before this backstop. */
export function isCriticalRequest(req: Request) {
  const path = req.originalUrl.split("?")[0] ?? "";
  if (req.method !== "POST") return false;
  if (/^\/api\/payments\/(verify|webhook|orders)$/.test(path)) return true;
  if (path === "/api/bookings") return true;
  return /^\/api\/bookings\/[^/]+\/cancel$/.test(path);
}

/**
 * Ends a request that never responds. A late handler cannot send a second body.
 * The socket stays open for payment and booking routes so their own timeout can
 * record an uncertain provider result instead of guessing that the charge failed.
 */
export function requestTimeout(req: Request, res: Response, next: NextFunction) {
  const ms = isCriticalRequest(req) ? timeouts.paymentRequestMs : timeouts.requestMs;
  let settled = false;
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    settled = true;
    if (timer) clearTimeout(timer);
  };
  timer = setTimeout(() => {
    if (settled || res.headersSent) return;
    settled = true;
    res.status(503);
    originalJson({ success: false, message: REQUEST_TIMEOUT_MESSAGE });
  }, ms);
  res.on("finish", finish);
  res.on("close", finish);
  res.send = ((body?: unknown) => {
    if (res.headersSent) return res;
    finish();
    return originalSend(body);
  }) as typeof res.send;
  res.json = ((body?: unknown) => {
    if (settled || res.headersSent) return res;
    return originalJson(body);
  }) as typeof res.json;
  next();
}
