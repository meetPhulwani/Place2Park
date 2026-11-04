import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const ticketMessageSchema = new Schema(
  {
    ticketKind: { type: String, enum: ["USER_REPORT", "SUPPORT"], required: true },
    ticketId: { type: Schema.Types.ObjectId, required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    visibility: { type: String, enum: ["PUBLIC", "INTERNAL"], default: "PUBLIC" },
    body: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true, toJSON: baseToJSON }
);

ticketMessageSchema.index({ ticketKind: 1, ticketId: 1, createdAt: 1 });

export const TicketMessage = mongoose.model("TicketMessage", ticketMessageSchema);
