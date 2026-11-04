import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";
import { DRIVER_REPORT_CATEGORIES, HOST_REPORT_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "../utils/support-constants.js";

const evidenceSchema = new Schema(
  { url: { type: String, required: true }, publicId: { type: String, default: "" } },
  { _id: false }
);

const userReportSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    direction: { type: String, enum: ["DRIVER_REPORTS_HOST", "HOST_REPORTS_DRIVER"], required: true },
    category: {
      type: String,
      enum: [...DRIVER_REPORT_CATEGORIES, ...HOST_REPORT_CATEGORIES],
      required: true,
    },
    description: { type: String, required: true, maxlength: 2000 },
    incidentAt: { type: Date },
    evidence: { type: [evidenceSchema], default: [] },
    status: { type: String, enum: TICKET_STATUSES, default: "OPEN", index: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: "NORMAL" },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    resolutionNote: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true, toJSON: baseToJSON }
);

userReportSchema.index({ reporterId: 1, reportedUserId: 1, bookingId: 1, category: 1, status: 1 });

export const UserReport = mongoose.model("UserReport", userReportSchema);
