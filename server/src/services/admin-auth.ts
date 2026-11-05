import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { AdminAccount } from "../models/AdminAccount.js";
import { AdminConsoleSession } from "../models/AdminConsoleSession.js";
import { AdminLoginChallenge } from "../models/AdminLoginChallenge.js";
import { ApiError } from "../middleware/error.js";
import { buildEmailFailureEvent, deliverVerificationCode, type OutboundMailDeps } from "./email.js";
import { writeConsoleAudit } from "./console-audit.js";
import {
  hasPermission,
  isAdminRole,
  normalizeSecurityAnswer,
  questionText,
  type AdminRole,
  type SecurityQuestionId,
} from "../utils/admin-access.js";
import { openSecret, randomToken, sealSecret, sha256 } from "../utils/admin-secret.js";
import { randomBase32, totpMatches, totpUri } from "../utils/totp.js";
import { passwordIssue } from "../utils/password.js";
import type { Request } from "express";

const OTP_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_TTL_MS = 15 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_STEP_ATTEMPTS = 5;
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const REAUTH_MS = 10 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

export const SESSION_COOKIE = "p2p_adm";
export const CSRF_COOKIE = "p2p_adm_csrf";
export const STEP_COOKIE = "p2p_adm_step";

const BAD_LOGIN = "Those details are incorrect.";
const BAD_CODE = "That code is incorrect.";
const BAD_ANSWER = "That answer is incorrect.";
const EXPIRED = "This sign-in attempt has expired. Start again.";
const TOO_MANY = "Too many incorrect attempts. Start again.";

let mailOverride: OutboundMailDeps | undefined;
let dummyHashPromise: Promise<string> | null = null;

export function setConsoleMailDeps(deps?: OutboundMailDeps) {
  mailOverride = deps;
}
function dummyHash() {
  dummyHashPromise ??= bcrypt.hash("invalid-admin-login", BCRYPT_ROUNDS);
  return dummyHashPromise;
}

/** The Windows provision prompt can store a trailing CR/LF with the password. */
async function passwordMatches(password: string, hash: string) {
  const stripped = password.replace(/[\r\n]+$/g, "");
  const candidates = [...new Set([password, stripped, `${stripped}\r`, `${stripped}\n`, `${stripped}\r\n`])].filter(Boolean);
  let matched = false;
  for (const candidate of candidates) {
    matched = (await bcrypt.compare(candidate, hash)) || matched;
  }
  return matched;
}

export async function rejectAdminPassword(password: string) {
  await bcrypt.compare(password, await dummyHash());
}

function otpHash(code: string, challengeId: string) {
  return sha256(`${challengeId}:${code}`);
}

function recipientDomain(email: string) {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return /^[a-z0-9.-]+$/.test(domain) ? domain : "invalid";
}

function logAdminOtp(event: {
  stage: "generated" | "accepted" | "failed" | "skipped";
  category: string;
  provider: string;
  providerStatus: number | null;
  recipientDomain?: string;
}) {
  const line = {
    stage: event.stage,
    category: event.category,
    provider: event.provider,
    providerStatus: event.providerStatus,
    ...(event.recipientDomain ? { recipientDomain: event.recipientDomain } : {}),
  };
  if (event.stage === "failed") console.error("[admin-otp]", line);
  else console.info("[admin-otp]", line);
}

export function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return "";
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function emailBelongsToAdmin(email: string) {
  return Boolean(await AdminAccount.exists({ email: email.toLowerCase().trim() }));
}

export async function provisionSuperAdmin(input: {
  email: string;
  name: string;
  password: string;
  questionId: SecurityQuestionId;
  answer: string;
  totpCode: string;
  totpSecret?: string;
}) {
  if (await AdminAccount.exists({ role: "SUPER_ADMIN" })) {
    throw new ApiError(409, "A Super Admin already exists.");
  }
  const issue = passwordIssue(input.password);
  if (issue) throw new ApiError(400, issue);
  const answer = normalizeSecurityAnswer(input.answer);
  if (answer.length < 3 || answer.length > 80) throw new ApiError(400, "Use a security answer between 3 and 80 characters.");
  if (!questionText(input.questionId)) throw new ApiError(400, "Choose a security question from the list.");
  const secret = input.totpSecret || randomBase32();
  if (!totpMatches(secret, input.totpCode)) throw new ApiError(400, "That authenticator code is incorrect.");
  const account = await AdminAccount.create({
    email: input.email.toLowerCase().trim(),
    name: input.name.trim().slice(0, 80),
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    questionId: input.questionId,
    answerHash: await bcrypt.hash(answer, BCRYPT_ROUNDS),
    totpSecret: sealSecret(secret),
  });
  return { id: String(account._id), uri: totpUri(account.email, secret) };
}

export async function recoverAdminAccount(input: {
  email: string;
  password: string;
  questionId: SecurityQuestionId;
  answer: string;
  totpCode: string;
  totpSecret: string;
}) {
  const email = input.email.toLowerCase().trim();
  const { sharedCounter } = await import("../utils/shared-counter.js");
  try {
    const hit = await sharedCounter().increment(`console-recover:${sha256(email)}`, 15 * 60_000);
    if (hit.totalHits > 5) throw new ApiError(429, "Too many attempts. Try again later.");
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(503, "We couldn't complete that step. Try again shortly.");
  }
  const account = await AdminAccount.findOne({ email }).select("+passwordHash +answerHash +totpSecret");
  if (!account) throw new ApiError(404, "Administrator not found.");
  const issue = passwordIssue(input.password);
  if (issue) throw new ApiError(400, issue);
  const answer = normalizeSecurityAnswer(input.answer);
  if (answer.length < 3 || !questionText(input.questionId) || !totpMatches(input.totpSecret, input.totpCode)) {
    throw new ApiError(400, "Recovery details were not accepted.");
  }
  account.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  account.answerHash = await bcrypt.hash(answer, BCRYPT_ROUNDS);
  account.totpSecret = sealSecret(input.totpSecret);
  account.questionId = input.questionId;
  account.status = "ACTIVE";
  account.lockedUntil = null;
  account.sessionVersion = (account.sessionVersion ?? 0) + 1;
  await account.save();
  await AdminConsoleSession.updateMany({ adminId: account._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await writeConsoleAudit({ action: "admin.recover", adminId: String(account._id), outcome: "SUCCESS" });
  return { id: String(account._id) };
}

export async function lockAdminByEmail(email: string) {
  const account = await AdminAccount.findOne({ email: email.toLowerCase().trim() });
  if (!account) throw new ApiError(404, "Administrator not found.");
  account.status = "LOCKED";
  account.sessionVersion = (account.sessionVersion ?? 0) + 1;
  await account.save();
  await AdminConsoleSession.updateMany({ adminId: account._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await writeConsoleAudit({ action: "admin.lock", adminId: String(account._id), outcome: "SUCCESS" });
}

export async function startAdminLogin(
  input: { email: string; password: string },
  req: Request,
  deps?: OutboundMailDeps
) {
  const email = input.email.toLowerCase().trim();
  const account = await AdminAccount.findOne({ email }).select("+passwordHash +answerHash +totpSecret");
  const hash = account?.passwordHash || (await dummyHash());
  const match = await passwordMatches(input.password, hash);
  const locked = account?.lockedUntil && account.lockedUntil.getTime() > Date.now();
  const usable = Boolean(account && account.status === "ACTIVE" && !locked && match);
  if (!usable) {
    logAdminOtp({ stage: "skipped", category: "not_issued", provider: "none", providerStatus: null });
    await writeConsoleAudit({ action: "login.password", adminId: account ? String(account._id) : null, outcome: "FAILURE", req });
    return decoyChallenge();
  }
  if (account) await AdminLoginChallenge.deleteMany({ adminId: account._id });
  const token = randomToken();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const domain = recipientDomain(account!.email);
  const challenge = await AdminLoginChallenge.create({
    tokenHash: sha256(token),
    adminId: account!._id,
    stage: "OTP",
    otpHash: otpHash(code, sha256(token)),
    otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
    otpSentAt: new Date(),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  logAdminOtp({ stage: "generated", category: "persisted", provider: "none", providerStatus: null, recipientDomain: domain });
  try {
    const delivery = await deliverVerificationCode({ email: account!.email, code }, deps ?? mailOverride);
    logAdminOtp({
      stage: "accepted",
      category: "sent",
      provider: delivery.provider,
      providerStatus: delivery.providerStatus,
      recipientDomain: domain,
    });
  } catch (err) {
    const failure = buildEmailFailureEvent("admin-otp", err);
    logAdminOtp({
      stage: "failed",
      category: failure.category,
      provider: failure.provider,
      providerStatus: failure.providerStatus,
      recipientDomain: domain,
    });
    await challenge.deleteOne();
    await writeConsoleAudit({ action: "login.delivery", adminId: String(account!._id), outcome: "FAILURE", req });
    return decoyChallenge();
  }
  await writeConsoleAudit({ action: "login.otp_sent", adminId: String(account!._id), outcome: "SUCCESS", req });
  return { token, stage: "otp" as const };
}

async function decoyChallenge() {
  const token = randomToken();
  await AdminLoginChallenge.create({
    tokenHash: sha256(token),
    stage: "OTP",
    decoy: true,
    otpHash: sha256(randomToken()),
    otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
    otpSentAt: new Date(),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return { token, stage: "otp" as const };
}

async function loadChallenge(token: string) {
  if (!token) throw new ApiError(401, EXPIRED);
  const doc = await AdminLoginChallenge.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  if (!doc) throw new ApiError(401, EXPIRED);
  return doc;
}

export async function verifyAdminOtp(token: string, code: string, req: Request) {
  const doc = await loadChallenge(token);
  if (doc.stage !== "OTP") throw new ApiError(401, EXPIRED);
  if (doc.otpAttempts >= MAX_STEP_ATTEMPTS) {
    await doc.deleteOne();
    throw new ApiError(401, TOO_MANY);
  }
  const expired = !doc.otpExpiresAt || doc.otpExpiresAt.getTime() <= Date.now();
  const expected = Buffer.from(doc.otpHash);
  const given = Buffer.from(otpHash(code, doc.tokenHash));
  const match = !expired && expected.length === given.length && crypto.timingSafeEqual(expected, given);
  if (!match) {
    doc.otpAttempts += 1;
    if (doc.otpAttempts >= MAX_STEP_ATTEMPTS) {
      await doc.deleteOne();
      await writeConsoleAudit({ action: "login.otp", adminId: String(doc.adminId), outcome: "FAILURE", req });
      throw new ApiError(401, TOO_MANY);
    }
    await doc.save();
    await writeConsoleAudit({ action: "login.otp", adminId: String(doc.adminId), outcome: "FAILURE", req });
    throw new ApiError(401, expired ? "That code has expired." : BAD_CODE);
  }
  doc.stage = "QUESTION";
  doc.otpHash = sha256(randomToken());
  await doc.save();
  const account = await AdminAccount.findById(doc.adminId).select("questionId");
  const text = questionText(account?.questionId ?? "");
  if (!text) throw new ApiError(401, EXPIRED);
  await writeConsoleAudit({ action: "login.otp", adminId: String(doc.adminId), outcome: "SUCCESS", req });
  return { stage: "question" as const, question: text };
}

export async function resendAdminOtp(token: string, req: Request, deps?: OutboundMailDeps) {
  const doc = await loadChallenge(token);
  if (doc.stage !== "OTP") throw new ApiError(401, EXPIRED);
  if (doc.otpSentAt && Date.now() - doc.otpSentAt.getTime() < RESEND_MS) {
    throw new ApiError(429, "Wait a minute before requesting another code.");
  }
  const account = doc.adminId ? await AdminAccount.findById(doc.adminId).select("email status") : null;
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const canSend = Boolean(account && account.status === "ACTIVE" && !doc.get("decoy"));
  if (canSend && account) {
    const domain = recipientDomain(account.email);
    doc.otpHash = otpHash(code, doc.tokenHash);
    logAdminOtp({ stage: "generated", category: "persisted", provider: "none", providerStatus: null, recipientDomain: domain });
    try {
      const delivery = await deliverVerificationCode({ email: account.email, code }, deps ?? mailOverride);
      doc.otpAttempts = 0;
      logAdminOtp({
        stage: "accepted",
        category: "sent",
        provider: delivery.provider,
        providerStatus: delivery.providerStatus,
        recipientDomain: domain,
      });
      await writeConsoleAudit({ action: "login.otp_sent", adminId: String(account._id), outcome: "SUCCESS", req });
    } catch (err) {
      const failure = buildEmailFailureEvent("admin-otp", err);
      logAdminOtp({
        stage: "failed",
        category: failure.category,
        provider: failure.provider,
        providerStatus: failure.providerStatus,
        recipientDomain: domain,
      });
      doc.otpHash = sha256(randomToken());
      await writeConsoleAudit({ action: "login.delivery", adminId: String(account._id), outcome: "FAILURE", req });
    }
  } else {
    logAdminOtp({ stage: "skipped", category: "not_issued", provider: "none", providerStatus: null });
    doc.otpHash = sha256(randomToken());
  }
  doc.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  doc.otpSentAt = new Date();
  await doc.save();
}

export async function verifyAdminAnswer(token: string, answer: string, req: Request) {
  const doc = await loadChallenge(token);
  if (doc.stage !== "QUESTION") throw new ApiError(401, EXPIRED);
  if (doc.questionAttempts >= MAX_STEP_ATTEMPTS) {
    await doc.deleteOne();
    throw new ApiError(401, TOO_MANY);
  }
  const account = await AdminAccount.findById(doc.adminId).select("+answerHash status");
  if (!account || account.status !== "ACTIVE") throw new ApiError(401, EXPIRED);
  const match = await bcrypt.compare(normalizeSecurityAnswer(answer), account.answerHash);
  if (!match) {
    doc.questionAttempts += 1;
    if (doc.questionAttempts >= MAX_STEP_ATTEMPTS) {
      await doc.deleteOne();
      account.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await account.save();
      await writeConsoleAudit({ action: "login.question", adminId: String(account._id), outcome: "FAILURE", req });
      throw new ApiError(401, TOO_MANY);
    }
    await doc.save();
    await writeConsoleAudit({ action: "login.question", adminId: String(account._id), outcome: "FAILURE", req });
    throw new ApiError(401, BAD_ANSWER);
  }
  doc.stage = "TOTP";
  await doc.save();
  await writeConsoleAudit({ action: "login.question", adminId: String(account._id), outcome: "SUCCESS", req });
  return { stage: "totp" as const };
}

export async function verifyAdminTotp(token: string, code: string, req: Request) {
  const doc = await loadChallenge(token);
  if (doc.stage !== "TOTP") throw new ApiError(401, EXPIRED);
  if (doc.totpAttempts >= MAX_STEP_ATTEMPTS) {
    await doc.deleteOne();
    throw new ApiError(401, TOO_MANY);
  }
  const account = await AdminAccount.findById(doc.adminId).select("+totpSecret status sessionVersion email name role");
  if (!account || account.status !== "ACTIVE") throw new ApiError(401, EXPIRED);
  let secret = "";
  try {
    secret = openSecret(account.totpSecret);
  } catch {
    throw new ApiError(401, EXPIRED);
  }
  if (!totpMatches(secret, code)) {
    doc.totpAttempts += 1;
    if (doc.totpAttempts >= MAX_STEP_ATTEMPTS) await doc.deleteOne();
    else await doc.save();
    await writeConsoleAudit({ action: "login.totp", adminId: String(account._id), outcome: "FAILURE", req });
    throw new ApiError(401, doc.totpAttempts >= MAX_STEP_ATTEMPTS ? TOO_MANY : BAD_CODE);
  }
  await doc.deleteOne();
  const session = await createConsoleSession(String(account._id), account.sessionVersion ?? 0, req);
  await writeConsoleAudit({ action: "login.success", adminId: String(account._id), outcome: "SUCCESS", req });
  return {
    session,
    admin: { id: String(account._id), email: account.email, name: account.name, role: account.role as AdminRole },
  };
}

export async function createConsoleSession(adminId: string, sessionVersion: number, req: Request) {
  const token = randomToken();
  const csrf = randomToken();
  const now = new Date();
  await AdminConsoleSession.create({
    tokenHash: sha256(token),
    csrfHash: sha256(csrf),
    adminId,
    sessionVersion,
    lastSeenAt: now,
    absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS),
    reauthUntil: new Date(now.getTime() + REAUTH_MS),
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200),
    ip: String(req.ip ?? "").slice(0, 64),
  });
  return { token, csrf };
}

export async function readConsoleSession(token: string) {
  if (!token) return null;
  const session = await AdminConsoleSession.findOne({ tokenHash: sha256(token), revokedAt: null });
  if (!session) return null;
  const now = Date.now();
  if (session.absoluteExpiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > IDLE_MS) {
    session.revokedAt = new Date();
    await session.save();
    return null;
  }
  const account = await AdminAccount.findById(session.adminId).select("status role sessionVersion email name");
  if (!account || account.status !== "ACTIVE" || (account.sessionVersion ?? 0) !== session.sessionVersion) {
    session.revokedAt = new Date();
    await session.save();
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 60_000) {
    session.lastSeenAt = new Date();
    await session.save();
  }
  return { session, account };
}

export async function revokeConsoleSession(token: string, req?: Request) {
  if (!token) return;
  const session = await AdminConsoleSession.findOne({ tokenHash: sha256(token), revokedAt: null });
  if (!session) return;
  session.revokedAt = new Date();
  await session.save();
  await writeConsoleAudit({ action: "session.revoke", adminId: String(session.adminId), outcome: "SUCCESS", req });
}

export async function revokeAllConsoleSessions(adminId: string) {
  await AdminAccount.updateOne({ _id: adminId }, { $inc: { sessionVersion: 1 } });
  await AdminConsoleSession.updateMany({ adminId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export function csrfMatches(header: string, cookie: string, csrfHash: string) {
  if (!header || !cookie || header !== cookie) return false;
  const given = Buffer.from(sha256(header));
  const expected = Buffer.from(csrfHash);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export async function reauthenticate(adminId: string, token: string, password: string, code: string, req: Request) {
  const account = await AdminAccount.findById(adminId).select("+passwordHash +totpSecret status");
  if (!account || account.status !== "ACTIVE") throw new ApiError(401, BAD_LOGIN);
  const passwordOk = await passwordMatches(password, account.passwordHash);
  let secret = "";
  try {
    secret = openSecret(account.totpSecret);
  } catch {
    secret = "";
  }
  if (!passwordOk || !totpMatches(secret, code)) {
    await writeConsoleAudit({ action: "reauth", adminId, outcome: "FAILURE", req });
    throw new ApiError(401, BAD_LOGIN);
  }
  const session = await AdminConsoleSession.findOne({ tokenHash: sha256(token), revokedAt: null });
  if (!session) throw new ApiError(401, EXPIRED);
  session.reauthUntil = new Date(Date.now() + REAUTH_MS);
  await session.save();
  await writeConsoleAudit({ action: "reauth", adminId, outcome: "SUCCESS", req });
}

export async function createDelegatedAdmin(
  actorRole: AdminRole,
  input: { email: string; name: string; password: string; role: string; questionId: SecurityQuestionId; answer: string },
  req: Request
) {
  if (!hasPermission(actorRole, "*")) throw new ApiError(403, "You don't have access to this.");
  if (input.role === "SUPER_ADMIN" || !isAdminRole(input.role)) throw new ApiError(400, "Choose an operations, support, or finance role.");
  const issue = passwordIssue(input.password);
  if (issue) throw new ApiError(400, issue);
  if (!questionText(input.questionId)) throw new ApiError(400, "Choose a security question from the list.");
  const answer = normalizeSecurityAnswer(input.answer);
  if (answer.length < 3) throw new ApiError(400, "Use a security answer between 3 and 80 characters.");
  if (await AdminAccount.exists({ email: input.email.toLowerCase().trim() })) {
    throw new ApiError(400, "That administrator could not be created.");
  }
  const secret = randomBase32();
  const account = await AdminAccount.create({
    email: input.email.toLowerCase().trim(),
    name: input.name.trim().slice(0, 80),
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    role: input.role,
    status: "LOCKED",
    questionId: input.questionId,
    answerHash: await bcrypt.hash(answer, BCRYPT_ROUNDS),
    totpSecret: sealSecret(secret),
  });
  await writeConsoleAudit({
    action: "admin.create",
    adminId: String((req as Request & { adminAccount?: { id: string } }).adminAccount?.id ?? ""),
    target: String(account._id),
    outcome: "SUCCESS",
    req,
  });
  return { id: String(account._id), uri: totpUri(account.email, secret) };
}

export async function confirmDelegatedAdmin(actorRole: AdminRole, targetId: string, code: string, req: Request) {
  if (!hasPermission(actorRole, "*")) throw new ApiError(403, "You don't have access to this.");
  const account = await AdminAccount.findById(targetId).select("+totpSecret role status");
  if (!account || account.role === "SUPER_ADMIN") throw new ApiError(404, "Administrator not found.");
  let secret = "";
  try {
    secret = openSecret(account.totpSecret);
  } catch {
    throw new ApiError(400, "That authenticator code is incorrect.");
  }
  if (!totpMatches(secret, code)) throw new ApiError(400, "That authenticator code is incorrect.");
  account.status = "ACTIVE";
  await account.save();
  await writeConsoleAudit({
    action: "admin.confirm",
    adminId: String((req as Request & { adminAccount?: { id: string } }).adminAccount?.id ?? ""),
    target: targetId,
    outcome: "SUCCESS",
    req,
  });
}

export async function setAdminRole(actorId: string, actorRole: AdminRole, targetId: string, role: string, req: Request) {
  if (!hasPermission(actorRole, "*")) throw new ApiError(403, "You don't have access to this.");
  if (role === "SUPER_ADMIN" || !isAdminRole(role)) throw new ApiError(400, "That role cannot be assigned.");
  const target = await AdminAccount.findById(targetId);
  if (!target || target.role === "SUPER_ADMIN") throw new ApiError(404, "Administrator not found.");
  if (String(target._id) === actorId) throw new ApiError(400, "You can't change your own role.");
  target.role = role;
  await target.save();
  await revokeAllConsoleSessions(targetId);
  await writeConsoleAudit({ action: "admin.role", adminId: actorId, target: targetId, outcome: "SUCCESS", req });
}

export async function lockAdminAccount(actorId: string, actorRole: AdminRole, targetId: string, req: Request) {
  if (!hasPermission(actorRole, "*")) throw new ApiError(403, "You don't have access to this.");
  const target = await AdminAccount.findById(targetId);
  if (!target || target.role === "SUPER_ADMIN") throw new ApiError(404, "Administrator not found.");
  target.status = "LOCKED";
  await target.save();
  await revokeAllConsoleSessions(targetId);
  await writeConsoleAudit({ action: "admin.lock", adminId: actorId, target: targetId, outcome: "SUCCESS", req });
}

export { hasPermission };
