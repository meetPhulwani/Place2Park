import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const vehicleSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["CAR", "BIKE"], required: true },
    make: { type: String, default: "", maxlength: 40 },
    model: { type: String, default: "", maxlength: 40 },
    plate: { type: String, required: true, maxlength: 15 },
  },
  { timestamps: true, toJSON: baseToJSON }
);

export const Vehicle = mongoose.model("Vehicle", vehicleSchema);
