import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from "mongoose";
import { BOOKING_STATUSES } from "../utils/constants.js";

const bookingSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    spaceId: { type: Schema.Types.ObjectId, ref: "ParkingSpace", required: true, index: true },
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    start: { type: Date, required: true },
    end: { type: Date, required: true },
    durationMins: { type: Number, required: true },

    status: { type: String, enum: BOOKING_STATUSES, default: "PENDING", index: true },
    expiresAt: { type: Date }, // PENDING payment hold deadline

    vehicleType: { type: String, enum: ["CAR", "BIKE"], default: "CAR" },
    vehiclePlate: { type: String, default: "" },
    accessCode: { type: String, required: true },

    // Money (paise) — computed server-side only.
    baseAmount: { type: Number, required: true },
    serviceFee: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    platformFee: { type: Number, required: true },
    hostEarning: { type: Number, required: true },

    cancelledAt: { type: Date },
    cancelReason: { type: String, default: "" },
    refunded: { type: Boolean, default: false },
    payoutId: { type: Schema.Types.ObjectId, ref: "HostPayout", index: true, sparse: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        ret.parkingFee = ret.baseAmount;
        ret.bookingCode = ret.code;
        return ret;
      },
    },
  }
);

// Conflict-scan index (space + window).
bookingSchema.index({ spaceId: 1, start: 1, end: 1, status: 1 });
bookingSchema.index({ userId: 1, start: -1 });
bookingSchema.index({ hostId: 1, status: 1, start: -1 });

export type BookingDoc = HydratedDocument<InferSchemaType<typeof bookingSchema>>;
export const Booking = mongoose.model("Booking", bookingSchema);
