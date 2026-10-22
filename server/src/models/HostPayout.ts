import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";
import { PAYOUT_STATUSES } from "../utils/constants.js";

const eventSchema = new Schema(
  {
    at: { type: Date, required: true, default: Date.now },
    status: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String, default: "", maxlength: 400 },
  },
  { _id: false }
);

const hostPayoutSchema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bookingIds: { type: [Schema.Types.ObjectId], ref: "Booking", default: [] },
    amount: { type: Number, required: true, min: 0 }, // paise
    currency: { type: String, default: "INR" },
    status: { type: String, enum: PAYOUT_STATUSES, default: "REQUESTED", index: true },
    method: { type: String, enum: ["MANUAL"], default: "MANUAL" },
    idempotencyKey: { type: String, required: true, unique: true },
    reference: { type: String, default: "", maxlength: 80 },
    notes: { type: String, default: "", maxlength: 400 },
    accountHolder: { type: String, default: "" },
    accountIfsc: { type: String, default: "" },
    accountLast4: { type: String, default: "" },
    transferId: { type: String, index: true, sparse: true },
    periodStart: { type: Date },
    periodEnd: { type: Date },
    requestedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    paidAt: { type: Date },
    failedAt: { type: Date },
    reversedAt: { type: Date },
    approvedById: { type: Schema.Types.ObjectId, ref: "User" },
    actedById: { type: Schema.Types.ObjectId, ref: "User" },
    events: { type: [eventSchema], default: [] },
  },
  { timestamps: true, toJSON: baseToJSON }
);

hostPayoutSchema.index({ hostId: 1, status: 1, createdAt: -1 });

export const HostPayout = mongoose.model("HostPayout", hostPayoutSchema);
