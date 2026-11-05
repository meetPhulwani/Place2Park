import mongoose, { Schema } from "mongoose";

const IMMUTABLE = "Console audit records cannot be changed.";

/** Insert-only console audit. The hash chain is checked by verifyConsoleAuditChain. */
const consoleAuditSchema = new Schema(
  {
    seq: { type: Number, required: true, unique: true },
    prevHash: { type: String, required: true },
    eventHash: { type: String, required: true },
    action: { type: String, required: true, index: true, maxlength: 80 },
    adminId: { type: Schema.Types.ObjectId, ref: "AdminAccount", default: null, index: true },
    target: { type: String, default: "", maxlength: 120 },
    outcome: { type: String, enum: ["SUCCESS", "FAILURE"], required: true },
    ip: { type: String, default: "", maxlength: 64 },
    userAgent: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"] as const) {
  consoleAuditSchema.pre(op, function rejectAuditMutation() {
    throw new Error(IMMUTABLE);
  });
}

export const ConsoleAudit = mongoose.model("ConsoleAudit", consoleAuditSchema);

const headSchema = new Schema(
  {
    _id: { type: String, default: "head" },
    seq: { type: Number, required: true },
    eventHash: { type: String, required: true },
    lockedAt: { type: Date, default: null },
  },
  { collection: "consoleauditheads" }
);

export const ConsoleAuditHead = mongoose.model("ConsoleAuditHead", headSchema);
