import type { NextFunction, Request, Response } from "express";
import type { AuthedRequest } from "./auth.js";
import { ApiError } from "./error.js";
import {
  csrfMatches,
  readConsoleSession,
  readCookie,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from "../services/admin-auth.js";
import { hasPermission, type AdminRole } from "../utils/admin-access.js";

export interface ConsoleRequest extends AuthedRequest {
  adminAccount: { id: string; role: AdminRole; email: string };
  consoleSession: { token: string; reauthUntil: number };
}

const HIDDEN = { success: false, message: "Not found." };

export async function requireConsole(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readCookie(req, SESSION_COOKIE);
    const loaded = await readConsoleSession(token);
    if (!loaded) {
      res.status(404).json(HIDDEN);
      return;
    }
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const header = String(req.headers["x-csrf-token"] ?? "");
      const cookie = readCookie(req, CSRF_COOKIE);
      if (!csrfMatches(header, cookie, loaded.session.csrfHash)) {
        res.status(403).json({ success: false, message: "Request blocked." });
        return;
      }
    }
    const admin = loaded.account;
    (req as ConsoleRequest).adminAccount = {
      id: String(admin._id),
      role: admin.role as AdminRole,
      email: admin.email,
    };
    (req as ConsoleRequest).consoleSession = {
      token,
      reauthUntil: loaded.session.reauthUntil?.getTime() ?? 0,
    };
    (req as ConsoleRequest).userId = String(admin._id);
    (req as ConsoleRequest).userRole = "ADMIN";
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as ConsoleRequest).adminAccount?.role;
    if (!role || !hasPermission(role, permission)) {
      next(new ApiError(403, "You don't have access to this."));
      return;
    }
    next();
  };
}

export function requireRecentAuth(req: Request, _res: Response, next: NextFunction) {
  const until = (req as ConsoleRequest).consoleSession?.reauthUntil ?? 0;
  if (until < Date.now()) {
    next(new ApiError(401, "Confirm your password and authenticator code to continue."));
    return;
  }
  next();
}
