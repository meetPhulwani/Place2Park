import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const reviewSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    spaceId: { type: Schema.Types.ObjectId, ref: "ParkingSpace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorRole: { type: String, enum: ["DRIVER", "HOST"], default: "DRIVER", required: true },
    revieweeId: { type: Schema.Types.ObjectId, ref: "User" },
    rating: { type: Number, min: 1, max: 5, required: true },
    categories: { type: Schema.Types.Mixed, default: {} },
    comment: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true, toJSON: baseToJSON }
);

// One review per side. Existing databases must drop the old unique bookingId index
// and backfill authorRole to DRIVER before this compound index is created.
reviewSchema.index({ bookingId: 1, authorRole: 1 }, { unique: true });

export const Review = mongoose.model("Review", reviewSchema);
