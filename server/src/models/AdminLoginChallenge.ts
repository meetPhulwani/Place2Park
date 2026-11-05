import mongoose, { Schema } from "mongoose";

const adminLoginChallengeSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    adminId: { type: Schema.Types.ObjectId, ref: "AdminAccount", default: null, index: true },
    decoy: { type: Boolean, default: false },
    stage: { type: String, enum: ["OTP", "QUESTION", "TOTP"], required: true },
    otpHash: { type: String, default: "" },
    otpExpiresAt: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    otpSentAt: { type: Date },
    questionAttempts: { type: Number, default: 0 },
    totpAttempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

adminLoginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdminLoginChallenge = mongoose.model("AdminLoginChallenge", adminLoginChallengeSchema);
