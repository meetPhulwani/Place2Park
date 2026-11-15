import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const reviewRequestSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    spaceId: { type: Schema.Types.ObjectId, ref: "ParkingSpace", required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    revieweeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, enum: ["DRIVER", "HOST"], required: true },
    status: { type: String, enum: ["PENDING", "SUBMITTED"], default: "PENDING", index: true },
  },
  { timestamps: true, toJSON: baseToJSON }
);

reviewRequestSchema.index({ bookingId: 1, authorRole: 1 }, { unique: true });

export const ReviewRequest = mongoose.model("ReviewRequest", reviewRequestSchema);
