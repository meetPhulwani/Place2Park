import mongoose, { Schema } from "mongoose";

const emailOtpPendingSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    purpose: { type: String, enum: ["signup", "google"], required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, maxlength: 80 },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ["DRIVER", "HOST", "BOTH"], default: "DRIVER" },
    phone: { type: String, default: "" },
    googleSub: { type: String, default: "" },
    image: { type: String, default: "" },
    codeHash: { type: String, required: true, select: false },
    codeExpiresAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    sentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumed: { type: Boolean, default: false },
    /** Stored so a taken email or phone returns the same payload without creating an account. */
    inert: { type: Boolean, default: false },
  },
  { timestamps: true }
);

emailOtpPendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailOtpPending = mongoose.model("EmailOtpPending", emailOtpPendingSchema);
