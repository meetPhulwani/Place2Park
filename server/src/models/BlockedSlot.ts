import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const blockedSlotSchema = new Schema(
  {
    spaceId: { type: Schema.Types.ObjectId, ref: "ParkingSpace", required: true, index: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    reason: { type: String, default: "" },
  },
  { timestamps: true, toJSON: baseToJSON }
);

blockedSlotSchema.index({ spaceId: 1, start: 1, end: 1 });

export const BlockedSlot = mongoose.model("BlockedSlot", blockedSlotSchema);
