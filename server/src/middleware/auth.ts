import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/index.js";
import { ApiError } from "./error.js";

export interface AuthedRequest extends Request {
  userId: string;
  userRole: string;
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "7d", algorithm: "HS256" });
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/**
 * Requires a valid JWT AND an active account. Role/status always come from the
 * database — never from the token or the client.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw new ApiError(401, "Please log in to continue.");
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    } catch {
      throw new ApiError(401, "Your session has expired. Please log in again.");
    }
    const user = await User.findById(payload.sub).select("role status");
    if (!user) throw new ApiError(401, "Account not found.");
    if (user.status === "SUSPENDED") throw new ApiError(403, "This account has been suspended.");
    (req as AuthedRequest).userId = String(user._id);
    (req as AuthedRequest).userRole = user.role;
    next();
  } catch (e) {
    next(e);
  }
}

/** Optional auth: attaches user if a valid token exists, continues otherwise. */
export async function maybeAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    const user = await User.findById(payload.sub).select("role status");
    if (user && user.status !== "SUSPENDED") {
      (req as AuthedRequest).userId = String(user._id);
      (req as AuthedRequest).userRole = user.role;
    }
  } catch {
    /* invalid token — treat as anonymous */
  }
  next();
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as AuthedRequest).userRole;
    if (!role || !roles.includes(role)) {
      next(new ApiError(403, "You don't have access to this."));
      return;
    }
    next();
  };
}

export const hostOnly = authorize("HOST", "BOTH", "ADMIN");
export const adminOnly = authorize("ADMIN");
