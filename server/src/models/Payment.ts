import mongoose, { Schema } from "mongoose";

const paymentSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    provider: { type: String, enum: ["RAZORPAY", "MOCK"], default: "MOCK" },
    orderId: { type: String, index: true },
    paymentId: { type: String },
    signature: { type: String },
    amount: { type: Number, required: true }, // paise
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["CREATED", "PAID", "FAILED", "REFUNDED"], default: "CREATED", index: true },
    method: { type: String },
    refundId: { type: String, index: true, sparse: true },
    refundStatus: { type: String, enum: ["PENDING", "PROCESSED", "FAILED"] },
    refundAmount: { type: Number }, // paise actually sent to Razorpay
    refundRequestedAt: { type: Date },
    refundProcessedAt: { type: Date },
    refundFailedAt: { type: Date },
    refundInFlight: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        const s = String(ret.status ?? "");
        ret.paymentState = s === "PAID" ? "PAYMENT_PAID" : s === "CREATED" ? "PAYMENT_PENDING" : s;
        delete ret.signature;
        delete ret.refundInFlight;
        return ret;
      },
    },
  }
);

export const Payment = mongoose.model("Payment", paymentSchema);
