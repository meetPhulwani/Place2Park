import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const hostPayoutSchema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true }, // paise
    status: { type: String, enum: ["PENDING", "PAID", "FAILED"], default: "PENDING" },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    reference: { type: String, default: "" },
  },
  { timestamps: true, toJSON: baseToJSON }
);

export const HostPayout = mongoose.model("HostPayout", hostPayoutSchema);
