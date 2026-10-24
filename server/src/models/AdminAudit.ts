import mongoose, { Schema } from "mongoose";
import { baseToJSON } from "./common.js";

const adminAuditSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payoutId: { type: Schema.Types.ObjectId, ref: "HostPayout", index: true },
    hostId: { type: Schema.Types.ObjectId, ref: "User" },
    accountLast4: { type: String, default: "", maxlength: 4 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      ...baseToJSON,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.accountNumber;
        return ret;
      },
    },
  }
);

adminAuditSchema.index({ payoutId: 1, createdAt: -1 });

export const AdminAudit = mongoose.model("AdminAudit", adminAuditSchema);
