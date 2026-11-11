import type { Request } from "express";
import { ConsoleAudit, ConsoleAuditHead } from "../models/ConsoleAudit.js";
import { sha256 } from "../utils/admin-secret.js";

const GENESIS = "genesis";
const APPEND_ATTEMPTS = 128;
const SECRET_KEYS = /password|otp|answer|secret|token|cookie|authorization|credential/i;

type AuditHead = { seq?: number; eventHash?: string } | null;

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
}, hooks?: { beforeInsert?: (seq: number) => Promise<void> | void }) {
  await ensureChainIndexes();
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
  let linked: { seq: number; prevHash: string; eventHash: string } | null = null;
  for (let attempt = 0; attempt < APPEND_ATTEMPTS; attempt += 1) {
    if (linked) {
      await repairHead();
      if (await eventIsLinked(linked.seq, linked.eventHash)) {
        void archiveAudit({ ...body, seq: linked.seq, prevHash: linked.prevHash, eventHash: linked.eventHash });
        return;
      }
      continue;
    }
    const head = await readHead();
    const baseSeq = head?.seq ?? 0;
    const prevHash = baseSeq > 0 && head?.eventHash ? head.eventHash : GENESIS;
    const seq = baseSeq + 1;
    const eventHash = sha256(canonicalAudit({ ...body, seq, prevHash }));
    if (hooks?.beforeInsert) await hooks.beforeInsert(seq);
    try {
      await ConsoleAudit.create({ ...body, seq, prevHash, eventHash, createdAt });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      await repairHead();
      continue;
    }
    linked = { seq, prevHash, eventHash };
    if (await advanceHead(baseSeq, seq, eventHash) || await eventIsLinked(seq, eventHash)) {
      void archiveAudit({ ...body, seq, prevHash, eventHash });
      return;
    }
  }
  throw new Error(`Console audit append did not commit (${body.action})`);
}

let chainIndexesReady: Promise<void> | null = null;

/** The seq unique index is what makes two overlapping inserts pick different events. */
function ensureChainIndexes() {
  if (!chainIndexesReady) {
    chainIndexesReady = Promise.all([
      ConsoleAudit.createIndexes(),
      ConsoleAuditHead.createIndexes(),
    ]).then(() => undefined).catch((err: unknown) => {
      chainIndexesReady = null;
      throw err;
    });
  }
  return chainIndexesReady;
}

function isDuplicateKey(err: unknown) {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as { code?: unknown; codeName?: string; cause?: { code?: unknown } };
  return candidate.code === 11000 || candidate.code === "11000" || candidate.codeName === "DuplicateKey" || candidate.cause?.code === 11000;
}

async function readHead(): Promise<AuditHead> {
  return ConsoleAuditHead.findById("head").select("seq eventHash").lean();
}

async function eventIsLinked(seq: number, eventHash: string) {
  const head = await readHead();
  if (!head || (head.seq ?? 0) < seq) return false;
  if (head.seq === seq) return head.eventHash === eventHash;
  const row = await ConsoleAudit.findOne({ seq }).select("eventHash").lean();
  return row?.eventHash === eventHash;
}

/** Moves the head forward along events that are already stored. Audit rows are never deleted or rewritten. */
async function repairHead() {
  for (let step = 0; step < APPEND_ATTEMPTS; step += 1) {
    const head = await readHead();
    const baseSeq = head?.seq ?? 0;
    const expectedPrev = baseSeq > 0 && head?.eventHash ? head.eventHash : GENESIS;
    const next = await ConsoleAudit.findOne({ seq: baseSeq + 1 }).select("seq prevHash eventHash").lean();
    if (!next || next.prevHash !== expectedPrev) return;
    const moved = await advanceHead(baseSeq, next.seq, next.eventHash);
    if (moved) continue;
    const current = await readHead();
    if ((current?.seq ?? 0) <= baseSeq) return;
  }
}

async function advanceHead(baseSeq: number, seq: number, eventHash: string) {
  if (!baseSeq) {
    try {
      await ConsoleAuditHead.create({ _id: "head", seq, eventHash, lockedAt: null });
      return true;
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
    const moved = await ConsoleAuditHead.updateOne(
      { _id: "head", seq: 0 },
      { $set: { seq, eventHash, lockedAt: null } }
    );
    if (moved.modifiedCount > 0) return true;
    const current = await readHead();
    return current?.seq === seq && current.eventHash === eventHash;
  }
  const moved = await ConsoleAuditHead.updateOne(
    { _id: "head", seq: baseSeq },
    { $set: { seq, eventHash, lockedAt: null } }
  );
  return moved.modifiedCount > 0;
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
