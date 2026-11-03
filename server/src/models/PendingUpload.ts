import mongoose, { Schema } from "mongoose";

const pendingUploadSchema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    attached: { type: Boolean, default: false },
  },
  { timestamps: true }
);

pendingUploadSchema.index({ attached: 1, createdAt: 1 });

export const PendingUpload = mongoose.model("PendingUpload", pendingUploadSchema);
