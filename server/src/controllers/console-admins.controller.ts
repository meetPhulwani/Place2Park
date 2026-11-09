import type { Request, Response } from "express";
import { ApiError } from "../middleware/error.js";
import { AdminAccount } from "../models/AdminAccount.js";
import { ConsoleAudit } from "../models/ConsoleAudit.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import type { ConsoleRequest } from "../middleware/console-auth.js";
import {
  confirmDelegatedAdmin,
  createDelegatedAdmin,
  lockAdminAccount,
  setAdminRole,
} from "../services/admin-auth.js";
import { writeConsoleAudit } from "../services/console-audit.js";
import type { SecurityQuestionId } from "../utils/admin-access.js";

export async function list(_req: Request, res: Response) {
  const rows = await AdminAccount.find().sort({ createdAt: 1 }).select("email name role status createdAt");
  res.json({
    success: true,
    data: {
      admins: rows.map((row) => ({
        id: String(row._id),
        email: row.email,
        name: row.name,
        role: row.role,
        status: row.status,
      })),
    },
  });
}

export async function create(req: Request, res: Response) {
  const current = req as ConsoleRequest;
  const body = req.body as {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
    questionId?: SecurityQuestionId;
    answer?: string;
  };
  const created = await createDelegatedAdmin(
    current.adminAccount.role,
    {
      email: String(body.email ?? ""),
      name: String(body.name ?? ""),
      password: String(body.password ?? ""),
      role: String(body.role ?? ""),
      questionId: body.questionId as SecurityQuestionId,
      answer: String(body.answer ?? ""),
    },
    req
  );
  res.status(201).json({ success: true, data: created });
}

export async function confirm(req: Request, res: Response) {
  const current = req as ConsoleRequest;
  await confirmDelegatedAdmin(current.adminAccount.role, req.params.id, String((req.body as { code?: string }).code ?? ""), req);
  res.json({ success: true, data: {} });
}

export async function role(req: Request, res: Response) {
  const current = req as ConsoleRequest;
  await setAdminRole(current.adminAccount.id, current.adminAccount.role, req.params.id, String((req.body as { role?: string }).role ?? ""), req);
  res.json({ success: true, data: {} });
}

export async function lock(req: Request, res: Response) {
  const current = req as ConsoleRequest;
  await lockAdminAccount(current.adminAccount.id, current.adminAccount.role, req.params.id, req);
  res.json({ success: true, data: {} });
}

export async function audits(req: Request, res: Response) {
  const current = req as ConsoleRequest;
  const filter = current.adminAccount.role === "SUPER_ADMIN" ? {} : { adminId: current.adminAccount.id };
  const rows = await ConsoleAudit.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: { audits: rows } });
}

export function publicNoticeText(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim().slice(0, 240);
}

export async function publicNotice(_req: Request, res: Response) {
  const row = await PlatformSetting.findOne({ key: "platform" });
  res.json({ success: true, data: { message: publicNoticeText(row?.maintenanceBanner ?? "") } });
}

export async function readSettings(_req: Request, res: Response) {
  const row = await PlatformSetting.findOne({ key: "platform" });
  res.json({
    success: true,
    data: {
      maintenanceBanner: row?.maintenanceBanner ?? "",
      listingsRequireReview: row?.listingsRequireReview ?? true,
    },
  });
}

export async function updateSettings(req: Request, res: Response) {
  const body = req.body as { maintenanceBanner?: string; listingsRequireReview?: boolean; confirm?: string };
  if (body.confirm !== "UPDATE") throw new ApiError(400, "Confirm this change.");
  const banner = publicNoticeText(String(body.maintenanceBanner ?? ""));
  await PlatformSetting.findOneAndUpdate(
    { key: "platform" },
    { $set: { maintenanceBanner: banner, listingsRequireReview: body.listingsRequireReview !== false } },
    { upsert: true }
  );
  res.json({ success: true, data: {} });
}

export async function updatePassword(req: Request, res: Response) {
  const current = req as ConsoleRequest;
  if (current.adminAccount.role !== "SUPER_ADMIN") throw new ApiError(404, "Not found.");
  const bcrypt = await import("bcryptjs");
  const { passwordIssue } = await import("../utils/password.js");
  const next = String((req.body as { password?: string }).password ?? "");
  const issue = passwordIssue(next);
  if (issue) {
    res.status(400).json({ success: false, message: issue });
    return;
  }
  const { AdminAccount } = await import("../models/AdminAccount.js");
  await AdminAccount.updateOne({ _id: current.adminAccount.id }, { $set: { passwordHash: await bcrypt.default.hash(next, 12) } });
  await writeConsoleAudit({ action: "admin.password", adminId: current.adminAccount.id, outcome: "SUCCESS", req });
  res.json({ success: true, data: {} });
}
