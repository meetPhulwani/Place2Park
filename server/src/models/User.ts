import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from "mongoose";
import { ROLES } from "../utils/constants.js";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, index: true, sparse: true },
    image: { type: String },
    role: { type: String, enum: ROLES, default: "DRIVER", index: true },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE" },
    hostVerified: { type: Boolean, default: false },
    // Profile (embedded — always loaded with the user)
    phone: { type: String, default: "" },
    phoneVerified: { type: Boolean, default: false },
    preferredVehicleType: { type: String, enum: ["CAR", "BIKE"], default: "CAR" },
    notifyEmail: { type: Boolean, default: true },
    notifyReminders: { type: Boolean, default: true },
    resetToken: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    tokenVersion: { type: Number, default: 0 },
    payoutProfile: {
      accountHolder: { type: String, default: "", maxlength: 80 },
      ifsc: { type: String, default: "", uppercase: true, maxlength: 11 },
      accountLast4: { type: String, default: "", maxlength: 4 },
      accountFingerprint: { type: String, default: "" },
      accountNumberEnc: { type: String, select: false, default: "" },
      submittedAt: { type: Date },
      verified: { type: Boolean, default: false },
      verifiedAt: { type: Date },
      verifiedById: { type: Schema.Types.ObjectId, ref: "User" },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.passwordHash;
        delete ret.googleId;
        delete ret.resetToken;
        delete ret.resetTokenExpires;
        // Bank details stay on authorized payout endpoints only.
        delete ret.payoutProfile;
        return ret;
      },
    },
  }
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = mongoose.model("User", userSchema);

/** Non-PII flags for the admin user directory. Bank details stay on payout endpoints. */
export function adminDirectoryPayoutFlags(user: {
  payoutProfile?: { accountLast4?: string | null; verified?: boolean | null } | null;
}) {
  return {
    payoutSubmitted: Boolean(user.payoutProfile?.accountLast4),
    payoutVerified: Boolean(user.payoutProfile?.verified),
  };
}
