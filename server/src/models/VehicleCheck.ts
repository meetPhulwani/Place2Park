import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const vehicleCheckSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vehiclePlate: { type: String, required: true, maxlength: 20 },
    decision: { type: String, enum: ["MATCH", "MISMATCH_DECLINED", "MISMATCH_OVERRIDE"], required: true },
  },
  { timestamps: true, toJSON: baseToJSON }
);

vehicleCheckSchema.index({ bookingId: 1, vehiclePlate: 1, decision: 1, createdAt: -1 });

export const VehicleCheck = mongoose.model("VehicleCheck", vehicleCheckSchema);
