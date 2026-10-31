import mongoose, { Schema } from "mongoose";

const phoneOtpSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    sentAt: { type: Date },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

phoneOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PhoneOtp = mongoose.model("PhoneOtp", phoneOtpSchema);
