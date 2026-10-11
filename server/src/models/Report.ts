import mongoose, { Schema } from "mongoose";
import { REPORT_REASONS } from "../utils/constants.js";
import { baseToJSON } from "./common.js";

const reportSchema = new Schema(
  {
    spaceId: { type: Schema.Types.ObjectId, ref: "ParkingSpace", required: true, index: true },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, default: "", maxlength: 2000 },
    status: { type: String, enum: ["OPEN", "RESOLVED", "DISMISSED"], default: "OPEN", index: true },
    resolvedById: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedNote: { type: String },
  },
  { timestamps: true, toJSON: baseToJSON }
);

export const Report = mongoose.model("Report", reportSchema);
