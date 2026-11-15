import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const reviewReportSchema = new Schema(
  {
    reviewId: { type: Schema.Types.ObjectId, ref: "Review", required: true, index: true },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, enum: ["ABUSIVE", "SPAM", "PRIVATE_INFO", "OTHER"], required: true },
    details: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true, toJSON: baseToJSON }
);

reviewReportSchema.index({ reviewId: 1, reporterId: 1 }, { unique: true });

export const ReviewReport = mongoose.model("ReviewReport", reviewReportSchema);
