import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const faqFeedbackSchema = new Schema(
  {
    faqId: { type: Schema.Types.ObjectId, ref: "Faq", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    helpful: { type: Boolean, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: baseToJSON }
);

export const FaqFeedback = mongoose.model("FaqFeedback", faqFeedbackSchema);
