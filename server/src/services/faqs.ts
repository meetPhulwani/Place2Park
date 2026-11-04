import mongoose from "mongoose";
import { Faq, FaqFeedback } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { escapeRegex } from "../utils/location.js";
import { FAQ_CATEGORIES, type FaqCategory } from "../utils/faq-constants.js";
import { FAQ_SEED } from "./faq-content.js";

export interface FaqView {
  id: string;
  key: string;
  category: string;
  question: string;
  answer: string;
  order: number;
  featured: boolean;
  active: boolean;
  related: string[];
}

function present(row: { toJSON: () => Record<string, unknown> }): FaqView {
  return row.toJSON() as unknown as FaqView;
}

let seeding: Promise<void> | null = null;

export async function ensureFaqs() {
  if (!seeding) {
    seeding = (async () => {
      const keys = FAQ_SEED.map((item) => item.key);
      const existing = new Set((await Faq.find({ key: { $in: keys } }).select("key")).map((row) => row.key));
      const missing = FAQ_SEED.filter((item) => !existing.has(item.key));
      if (!missing.length) return;
      await Faq.insertMany(missing, { ordered: false }).catch((err: { code?: number }) => {
        if (err?.code !== 11000) throw err;
      });
    })().finally(() => {
      seeding = null;
    });
  }
  await seeding;
}

function categoryOf(value?: string): FaqCategory | undefined {
  if (!value) return undefined;
  return (FAQ_CATEGORIES as readonly string[]).includes(value) ? (value as FaqCategory) : undefined;
}

export async function listPublic(query: { q?: string; category?: string }) {
  await ensureFaqs();
  const filter: Record<string, unknown> = { active: true };
  const category = categoryOf(query.category);
  if (category) filter.category = category;
  const q = query.q?.trim();
  if (q) {
    const pattern = escapeRegex(q);
    filter.$or = [{ question: { $regex: pattern, $options: "i" } }, { answer: { $regex: pattern, $options: "i" } }];
  }
  const rows = await Faq.find(filter).sort({ featured: -1, order: 1, question: 1 });
  return rows.map((row) => present(row));
}

export async function listAdmin() {
  await ensureFaqs();
  const rows = await Faq.find().sort({ category: 1, order: 1, question: 1 });
  return rows.map((row) => present(row));
}

export async function createFaq(input: {
  question: string;
  answer: string;
  category: FaqCategory;
  featured?: boolean;
  active?: boolean;
  order?: number;
  related?: string[];
}) {
  const last = await Faq.findOne({ category: input.category }).sort({ order: -1 }).select("order");
  const doc = await Faq.create({
    key: `custom-${new mongoose.Types.ObjectId().toString()}`,
    category: input.category,
    question: input.question.trim(),
    answer: input.answer.trim(),
    featured: !!input.featured,
    active: input.active !== false,
    order: input.order ?? (last?.order ?? 0) + 1,
    related: input.related ?? [],
  });
  return present(doc);
}

export async function updateFaq(
  id: string,
  input: Partial<{ question: string; answer: string; category: FaqCategory; featured: boolean; active: boolean; order: number; related: string[] }>
) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "FAQ not found.");
  const doc = await Faq.findById(id);
  if (!doc) throw new ApiError(404, "FAQ not found.");
  if (input.question !== undefined) doc.question = input.question.trim();
  if (input.answer !== undefined) doc.answer = input.answer.trim();
  if (input.category) doc.category = input.category;
  if (input.featured !== undefined) doc.featured = input.featured;
  if (input.active !== undefined) doc.active = input.active;
  if (input.order !== undefined) doc.order = input.order;
  if (input.related) doc.related = input.related;
  await doc.save();
  return present(doc);
}

export async function deleteFaq(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "FAQ not found.");
  const doc = await Faq.findByIdAndDelete(id);
  if (!doc) throw new ApiError(404, "FAQ not found.");
  return { deleted: true };
}

export async function reorderFaqs(ids: string[]) {
  const valid = ids.filter((id) => mongoose.isValidObjectId(id));
  await Promise.all(valid.map((id, order) => Faq.updateOne({ _id: id }, { $set: { order } })));
  return { updated: valid.length };
}

export async function recordFeedback(id: string, helpful: boolean, userId?: string) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "FAQ not found.");
  const doc = await Faq.findOne({ _id: id, active: true }).select("_id");
  if (!doc) throw new ApiError(404, "FAQ not found.");
  await FaqFeedback.create({ faqId: doc._id, helpful, userId: userId && mongoose.isValidObjectId(userId) ? userId : undefined });
  return { helpful };
}
