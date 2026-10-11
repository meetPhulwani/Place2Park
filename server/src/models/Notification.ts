import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date },
  },
  { timestamps: true, toJSON: baseToJSON }
);

export const Notification = mongoose.model("Notification", notificationSchema);
