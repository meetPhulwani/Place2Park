import type { Response } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { createFaq, deleteFaq, listAdmin, listPublic, recordFeedback, reorderFaqs, updateFaq } from "../services/faqs.js";
import type { FaqCategory } from "../utils/faq-constants.js";

export async function list(req: AuthedRequest, res: Response) {
  const faqs = await listPublic({
    q: typeof req.query.q === "string" ? req.query.q : "",
    category: typeof req.query.category === "string" ? req.query.category : "",
  });
  res.json({ success: true, data: { faqs } });
}

export async function feedback(req: AuthedRequest, res: Response) {
  const data = await recordFeedback(String(req.params.id), req.body.helpful === true, req.userId);
  res.status(201).json({ success: true, data });
}

export async function adminList(_req: AuthedRequest, res: Response) {
  const faqs = await listAdmin();
  res.json({ success: true, data: { faqs } });
}

export async function adminCreate(req: AuthedRequest, res: Response) {
  const data = await createFaq(req.body);
  res.status(201).json({ success: true, data });
}

export async function adminUpdate(req: AuthedRequest, res: Response) {
  const data = await updateFaq(String(req.params.id), {
    question: req.body.question,
    answer: req.body.answer,
    category: req.body.category as FaqCategory | undefined,
    featured: req.body.featured,
    active: req.body.active,
    order: req.body.order,
    related: req.body.related,
  });
  res.json({ success: true, data });
}

export async function adminDelete(req: AuthedRequest, res: Response) {
  const data = await deleteFaq(String(req.params.id));
  res.json({ success: true, data });
}

export async function adminReorder(req: AuthedRequest, res: Response) {
  const data = await reorderFaqs(req.body.ids as string[]);
  res.json({ success: true, data });
}
