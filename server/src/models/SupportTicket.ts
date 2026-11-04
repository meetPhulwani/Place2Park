import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";
import { SUPPORT_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "../utils/support-constants.js";

const evidenceSchema = new Schema(
  { url: { type: String, required: true }, publicId: { type: String, default: "" } },
  { _id: false }
);

const supportTicketSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, enum: SUPPORT_CATEGORIES, required: true },
    subject: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 2000 },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    evidence: { type: [evidenceSchema], default: [] },
    status: { type: String, enum: TICKET_STATUSES, default: "OPEN", index: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: "NORMAL" },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    resolutionNote: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true, toJSON: baseToJSON }
);

export const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
