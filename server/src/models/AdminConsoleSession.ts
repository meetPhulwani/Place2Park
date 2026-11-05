import mongoose, { Schema } from "mongoose";

const adminConsoleSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    csrfHash: { type: String, required: true },
    adminId: { type: Schema.Types.ObjectId, ref: "AdminAccount", required: true, index: true },
    sessionVersion: { type: Number, required: true },
    lastSeenAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    reauthUntil: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: "", maxlength: 200 },
    ip: { type: String, default: "", maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AdminConsoleSession = mongoose.model("AdminConsoleSession", adminConsoleSessionSchema);
