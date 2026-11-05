import type { Request } from "express";
import { ConsoleAudit, ConsoleAuditHead } from "../models/ConsoleAudit.js";
import { sha256 } from "../utils/admin-secret.js";

const GENESIS = "genesis";
const SECRET_KEYS = /password|otp|answer|secret|token|cookie|authorization|credential/i;

export function canonicalAudit(record: Record<string, string | number | null>) {
  const keys = Object.keys(record).sort();
  return JSON.stringify(Object.fromEntries(keys.map((key) => [key, record[key]])));
}

export async function writeConsoleAudit(input: {
  action: string;
  adminId?: string | null;
  target?: string;
  outcome: "SUCCESS" | "FAILURE";
  req?: Request;
}) {
  const createdAt = new Date();
  const body = {
    action: input.action.slice(0, 80),
    adminId: /^[a-f0-9]{24}$/i.test(String(input.adminId ?? "")) ? String(input.adminId) : null,
    target: String(input.target ?? "").slice(0, 120),
    outcome: input.outcome,
    ip: String(input.req?.ip ?? "").slice(0, 64),
    userAgent: String(input.req?.headers?.["user-agent"] ?? "").slice(0, 200),
    createdAt: createdAt.toISOString(),
  };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const claimed = await claimAuditHead();
    if (!claimed) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      continue;
    }
    const seq = claimed.seq + 1;
    const prevHash = claimed.seq > 0 ? claimed.eventHash : GENESIS;
    const eventHash = sha256(canonicalAudit({ ...body, seq, prevHash }));
    let createdId: unknown;
    try {
      const doc = await ConsoleAudit.create({ ...body, seq, prevHash, eventHash, createdAt });
      createdId = doc._id;
      await ConsoleAuditHead.updateOne({ _id: "head" }, { $set: { seq, eventHash, lockedAt: null } });
      void archiveAudit({ ...body, seq, prevHash, eventHash });
      return;
    } catch {
      if (createdId) await ConsoleAudit.collection.deleteOne({ _id: createdId });
      await ConsoleAuditHead.updateOne({ _id: "head", lockedAt: claimed.lockedAt }, { $set: { lockedAt: null } });
    }
  }
  console.error("[audit] chain append failed");
}

async function claimAuditHead() {
  const lockedAt = new Date();
  const stale = new Date(lockedAt.getTime() - 5_000);
  const held = await ConsoleAuditHead.findOneAndUpdate(
    { _id: "head", $or: [{ lockedAt: null }, { lockedAt: { $exists: false } }, { lockedAt: { $lt: stale } }] },
    { $set: { lockedAt } }
  );
  if (held) return { seq: held.seq ?? 0, eventHash: held.eventHash || GENESIS, lockedAt };
  if (await ConsoleAuditHead.exists({ _id: "head" })) return null;
  try {
    await ConsoleAuditHead.create({ _id: "head", seq: 0, eventHash: GENESIS, lockedAt });
    return { seq: 0, eventHash: GENESIS, lockedAt };
  } catch {
    return null;
  }
}

export async function verifyConsoleAuditChain() {
  const rows = await ConsoleAudit.find().sort({ seq: 1 }).lean();
  const problems: string[] = [];
  let prev = GENESIS;
  rows.forEach((row, index) => {
    const seq = index + 1;
    if (row.seq !== seq) problems.push(`sequence gap at ${row.seq}`);
    if (row.prevHash !== prev) problems.push(`previous hash mismatch at ${row.seq}`);
    const eventHash = sha256(
      canonicalAudit({
        action: row.action,
        adminId: row.adminId ? String(row.adminId) : null,
        target: row.target ?? "",
        outcome: row.outcome,
        ip: row.ip ?? "",
        userAgent: row.userAgent ?? "",
        createdAt: new Date(row.createdAt as Date).toISOString(),
        seq: row.seq,
        prevHash: row.prevHash,
      })
    );
    if (eventHash !== row.eventHash) problems.push(`hash mismatch at ${row.seq}`);
    prev = row.eventHash;
  });
  const head = await ConsoleAuditHead.findById("head").lean();
  if (rows.length && head?.eventHash !== rows[rows.length - 1]?.eventHash) problems.push("head does not match the last event");
  if (!rows.length && head) problems.push("head exists without events");
  return { ok: problems.length === 0, problems, count: rows.length };
}

async function archiveAudit(event: Record<string, string | number | null>) {
  const url = String(process.env.AUDIT_ARCHIVE_URL ?? "").trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: canonicalAudit(event),
    });
  } catch {
    console.error("[audit] external archive unavailable");
  }
}

export function safeAuditMeta(body: unknown) {
  if (!body || typeof body !== "object") return {};
  return Object.fromEntries(Object.entries(body).filter(([key]) => !SECRET_KEYS.test(key)));
}
