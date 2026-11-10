import type { Response } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { accountSecurity, deleteOwnAccount } from "../services/account-deletion.js";

export async function security(req: AuthedRequest, res: Response) {
  const data = await accountSecurity(req.userId!);
  res.json({ success: true, data });
}

export async function remove(req: AuthedRequest, res: Response) {
  const data = await deleteOwnAccount(req.userId!, req.body);
  res.json({ success: true, data });
}
