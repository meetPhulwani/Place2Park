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
    preferredVehicleType: { type: String, enum: ["CAR", "BIKE"], default: "CAR" },
    notifyEmail: { type: Boolean, default: true },
    notifyReminders: { type: Boolean, default: true },
    resetToken: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
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
        return ret;
      },
    },
  }
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = mongoose.model("User", userSchema);
