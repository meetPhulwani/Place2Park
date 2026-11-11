import type { Request, Response } from "express";
import { isProd } from "../config/env.js";
import type { ConsoleRequest } from "../middleware/console-auth.js";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  STEP_COOKIE,
  readCookie,
  reauthenticate,
  resendAdminOtp,
  revokeConsoleSession,
  CONSOLE_ABSOLUTE_MS,
  startAdminLogin,
  verifyAdminAnswer,
  verifyAdminOtp,
  verifyAdminTotp,
} from "../services/admin-auth.js";
import { SECURITY_QUESTIONS } from "../utils/admin-access.js";

const STEP_MS = 15 * 60 * 1000;

function cookie(res: Response, name: string, value: string, maxAge: number, httpOnly: boolean) {
  res.cookie(name, value, {
    httpOnly,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

function clearCookie(res: Response, name: string) {
  res.clearCookie(name, { path: "/" });
}

export async function start(req: Request, res: Response) {
  const body = req.body as { email?: string; password?: string };
  const result = await startAdminLogin({ email: String(body.email ?? ""), password: String(body.password ?? "") }, req);
  cookie(res, STEP_COOKIE, result.token, STEP_MS, true);
  res.json({ success: true, data: { stage: result.stage } });
}

export async function otp(req: Request, res: Response) {
  const result = await verifyAdminOtp(readCookie(req, STEP_COOKIE), String((req.body as { code?: string }).code ?? ""), req);
  res.json({ success: true, data: result });
}

export async function resend(req: Request, res: Response) {
  await resendAdminOtp(readCookie(req, STEP_COOKIE), req);
  res.json({ success: true, data: { stage: "otp" } });
}

export async function question(req: Request, res: Response) {
  const result = await verifyAdminAnswer(readCookie(req, STEP_COOKIE), String((req.body as { answer?: string }).answer ?? ""), req);
  res.json({ success: true, data: result });
}

export async function totp(req: Request, res: Response) {
  const result = await verifyAdminTotp(readCookie(req, STEP_COOKIE), String((req.body as { code?: string }).code ?? ""), req);
  clearCookie(res, STEP_COOKIE);
  cookie(res, SESSION_COOKIE, result.session.token, CONSOLE_ABSOLUTE_MS, true);
  cookie(res, CSRF_COOKIE, result.session.csrf, CONSOLE_ABSOLUTE_MS, false);
  res.json({ success: true, data: { admin: result.admin } });
}

export async function logout(req: Request, res: Response) {
  await revokeConsoleSession(readCookie(req, SESSION_COOKIE), req);
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, CSRF_COOKIE);
  clearCookie(res, STEP_COOKIE);
  res.json({ success: true, data: {} });
}

export async function session(req: Request, res: Response) {
  const admin = (req as ConsoleRequest).adminAccount;
  res.json({ success: true, data: { admin } });
}

export async function reauth(req: Request, res: Response) {
  const body = req.body as { password?: string; code?: string };
  const current = req as ConsoleRequest;
  await reauthenticate(current.adminAccount.id, current.consoleSession.token, String(body.password ?? ""), String(body.code ?? ""), req);
  res.json({ success: true, data: {} });
}

export function questions(_req: Request, res: Response) {
  res.json({ success: true, data: { questions: SECURITY_QUESTIONS } });
}
