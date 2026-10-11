import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const reviewSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    spaceId: { type: Schema.Types.ObjectId, ref: "ParkingSpace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true, toJSON: baseToJSON }
);

export const Review = mongoose.model("Review", reviewSchema);
