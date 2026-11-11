import type { Response } from "express";
import { ApiError } from "../middleware/error.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { accountSecurity, deleteOwnAccount } from "../services/account-deletion.js";
import {
  changePassword,
  confirmEmailChange,
  confirmPhoneChange,
  exportOwnData,
  getAccountSettings,
  requestEmailChange,
  requestPhoneChange,
  revokeAllSessions,
  setAccountPhoto,
  updateAccountName,
  updateNotificationPrefs,
  updatePrivacyPrefs,
} from "../services/account-settings.js";
import { storeListingImage, UPLOAD_ERROR_MESSAGE } from "../services/media.js";

export async function security(req: AuthedRequest, res: Response) {
  const data = await accountSecurity(req.userId!);
  res.json({ success: true, data });
}

export async function settings(req: AuthedRequest, res: Response) {
  const data = await getAccountSettings(req.userId!);
  res.json({ success: true, data });
}

export async function name(req: AuthedRequest, res: Response) {
  const data = await updateAccountName(req.userId!, req.body.name);
  res.json({ success: true, data, message: "Name updated." });
}

export async function emailRequest(req: AuthedRequest, res: Response) {
  const data = await requestEmailChange(req.userId!, req.body.email);
  res.json({ success: true, data, message: "Check your new email for a verification code." });
}

export async function emailConfirm(req: AuthedRequest, res: Response) {
  const data = await confirmEmailChange(req.userId!, req.body.pendingToken, req.body.otp);
  res.json({ success: true, data, message: "Email updated." });
}

export async function phoneRequest(req: AuthedRequest, res: Response) {
  const data = await requestPhoneChange(req.userId!, req.body.phone);
  res.json({ success: true, data, message: "Check your email for a verification code." });
}

export async function phoneConfirm(req: AuthedRequest, res: Response) {
  const data = await confirmPhoneChange(req.userId!, req.body.pendingToken, req.body.otp);
  res.json({ success: true, data, message: "Phone number updated." });
}

export async function password(req: AuthedRequest, res: Response) {
  const data = await changePassword(req.userId!, req.body.currentPassword, req.body.newPassword);
  res.json({ success: true, data, message: "Password updated. Other devices have been signed out." });
}

export async function sessions(req: AuthedRequest, res: Response) {
  await revokeAllSessions(req.userId!);
  res.json({ success: true, message: "Every login has been signed out." });
}

export async function notifications(req: AuthedRequest, res: Response) {
  const data = await updateNotificationPrefs(req.userId!, req.body);
  res.json({ success: true, data, message: "Notification preferences saved." });
}

export async function privacy(req: AuthedRequest, res: Response) {
  const data = await updatePrivacyPrefs(req.userId!, req.body);
  res.json({ success: true, data, message: "Privacy preferences saved." });
}

export async function photo(req: AuthedRequest, res: Response) {
  const file = req.file;
  if (!file?.buffer) throw new ApiError(400, UPLOAD_ERROR_MESSAGE);
  const stored = await storeListingImage(file, { hostId: req.userId });
  const data = await setAccountPhoto(req.userId!, stored.url);
  res.json({ success: true, data, message: "Profile photo updated." });
}

export async function removePhoto(req: AuthedRequest, res: Response) {
  const data = await setAccountPhoto(req.userId!, "");
  res.json({ success: true, data, message: "Profile photo removed." });
}

export async function download(req: AuthedRequest, res: Response) {
  const data = await exportOwnData(req.userId!);
  res.json({ success: true, data });
}

export async function remove(req: AuthedRequest, res: Response) {
  const data = await deleteOwnAccount(req.userId!, req.body);
  res.json({ success: true, data });
}
