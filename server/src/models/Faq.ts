import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";
import { FAQ_CATEGORIES } from "../utils/faq-constants.js";

const faqSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    category: { type: String, enum: FAQ_CATEGORIES, required: true, index: true },
    question: { type: String, required: true, trim: true, maxlength: 200 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
    order: { type: Number, default: 0 },
    featured: { type: Boolean, default: false, index: true },
    active: { type: Boolean, default: true, index: true },
    related: { type: [String], default: [] },
  },
  { timestamps: true, toJSON: baseToJSON }
);

faqSchema.index({ category: 1, order: 1 });

export const Faq = mongoose.model("Faq", faqSchema);
