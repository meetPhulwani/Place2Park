import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const supportEvidenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    attached: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: baseToJSON }
);

export const SupportEvidence = mongoose.model("SupportEvidence", supportEvidenceSchema);
