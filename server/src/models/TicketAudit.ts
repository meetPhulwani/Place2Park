import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const ticketAuditSchema = new Schema(
  {
    ticketKind: { type: String, enum: ["USER_REPORT", "SUPPORT"], required: true },
    ticketId: { type: Schema.Types.ObjectId, required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    fromStatus: { type: String, default: "" },
    toStatus: { type: String, default: "" },
    note: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: baseToJSON }
);

ticketAuditSchema.index({ ticketKind: 1, ticketId: 1, createdAt: 1 });

export const TicketAudit = mongoose.model("TicketAudit", ticketAuditSchema);
