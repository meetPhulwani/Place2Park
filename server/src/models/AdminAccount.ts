import mongoose, { Schema } from "mongoose";
import { ADMIN_ROLES } from "../utils/admin-access.js";

const adminAccountSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, required: true },
    status: { type: String, enum: ["ACTIVE", "LOCKED", "DISABLED"], default: "ACTIVE", index: true },
    questionId: { type: String, required: true },
    answerHash: { type: String, required: true, select: false },
    totpSecret: { type: String, required: true, select: false },
    totpKeyVersion: { type: Number, default: 1 },
    lockedUntil: { type: Date, default: null },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const AdminAccount = mongoose.model("AdminAccount", adminAccountSchema);
