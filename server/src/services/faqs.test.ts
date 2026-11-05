import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Faq, FaqFeedback } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { createFaq, deleteFaq, listPublic, recordFeedback, reorderFaqs, updateFaq } from "./faqs.js";

let memory: MongoMemoryServer;

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-faqs"));
});

after(async () => {
  await mongoose.disconnect();
  await memory.stop();
});

describe("faq help center", () => {
  it("seeds answers and searches questions and answers", async () => {
    const rows = await listPublic({ q: "60 minutes" });
    assert.ok(rows.some((row) => row.key === "cancel"));
    assert.ok(rows.some((row) => String(row.answer).includes("60 minutes")));
    const commission = await listPublic({ q: "commission" });
    const text = String(commission.find((row) => row.key === "commission")?.answer);
    assert.match(text, /10%/);
    assert.match(text, /5%/);
  });

  it("filters by category", async () => {
    const rows = await listPublic({ category: "PAYOUTS" });
    assert.ok(rows.length >= 4);
    assert.ok(rows.every((row) => row.category === "PAYOUTS"));
    const none = await listPublic({ q: "this phrase is not in any answer xyz" });
    assert.equal(none.length, 0);
  });

  it("hides inactive FAQs from the public list", async () => {
    const created = await createFaq({
      category: "TECHNICAL",
      question: "Where is the hidden answer?",
      answer: "This answer should disappear after it is deactivated for the public list.",
    });
    await updateFaq(String(created.id), { active: false });
    const rows = await listPublic({ q: "hidden answer" });
    assert.equal(rows.some((row) => row.id === created.id), false);
    await deleteFaq(String(created.id));
  });

  it("records helpful feedback and rejects feedback on an inactive FAQ", async () => {
    const [first] = await listPublic({ q: "What is Place2Park" });
    const saved = await recordFeedback(String(first.id), false);
    assert.equal(saved.helpful, false);
    assert.equal(await FaqFeedback.countDocuments({ faqId: first.id, helpful: false }), 1);
    const created = await createFaq({
      category: "ACCOUNT",
      question: "Inactive feedback target?",
      answer: "Feedback should not be stored after this question is turned off.",
    });
    await updateFaq(String(created.id), { active: false });
    await assert.rejects(
      () => recordFeedback(String(created.id), true),
      (err: unknown) => err instanceof ApiError && err.status === 404
    );
  });

  it("reorders FAQs and keeps admin routes behind adminOnly", async () => {
    const created = await createFaq({
      category: "DRIVERS",
      question: "Reorder me please now",
      answer: "This custom question exists only to check that order can be saved.",
    });
    await reorderFaqs([String(created.id)]);
    assert.equal((await Faq.findById(created.id))?.order, 0);
    const src = readFileSync(new URL("../routes/console.ts", import.meta.url), "utf8");
    assert.match(src, /requireConsole/);
    assert.match(src, /requirePermission\("faqs.write"\)/);
    const userRoutes = readFileSync(new URL("../routes/index.ts", import.meta.url), "utf8");
    assert.match(userRoutes, /rateLimit\(\s*"faq-feedback"/);
  });
});
