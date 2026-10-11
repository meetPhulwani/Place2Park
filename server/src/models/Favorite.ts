import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const favoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    spaceId: { type: Schema.Types.ObjectId, ref: "ParkingSpace", required: true },
  },
  { timestamps: true, toJSON: baseToJSON }
);

favoriteSchema.index({ userId: 1, spaceId: 1 }, { unique: true });

export const Favorite = mongoose.model("Favorite", favoriteSchema);
