import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from "mongoose";
import { LEVELS, PROPERTY_TYPES, SPACE_STATUSES } from "../utils/constants.js";

const imageSchema = new Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const availabilityRuleSchema = new Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    startMinute: { type: Number, min: 0, max: 1440, required: true },
    endMinute: { type: Number, min: 0, max: 1440, required: true },
  },
  { _id: false }
);

const parkingSpaceSchema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 90 },
    description: { type: String, default: "", maxlength: 2000 },
    status: { type: String, enum: SPACE_STATUSES, default: "DRAFT", index: true },
    verified: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false },

    propertyType: { type: String, enum: PROPERTY_TYPES, default: "INDIVIDUAL" },
    spaceType: { type: String, enum: ["PRIVATE", "OPEN"], default: "PRIVATE" },
    covered: { type: Boolean, default: false },
    level: { type: String, enum: LEVELS, default: "GROUND" },
    vehicleTypes: { type: String, default: "CAR" }, // comma-separated, matches existing UI
    evCharging: { type: Boolean, default: false },
    cctv: { type: Boolean, default: false },
    securityGuard: { type: Boolean, default: false },
    gated: { type: Boolean, default: false },
    lengthFt: { type: Number },
    widthFt: { type: Number },
    heightFt: { type: Number },

    address: { type: String, required: true, maxlength: 240 },
    formattedAddress: { type: String, default: "", maxlength: 300 },
    locality: { type: String, default: "", maxlength: 80, index: true },
    sublocality: { type: String, default: "", maxlength: 80 },
    area: { type: String, required: true, maxlength: 80 },
    city: { type: String, required: true, maxlength: 60, index: true },
    district: { type: String, default: "", maxlength: 80 },
    state: { type: String, default: "", maxlength: 60 },
    pincode: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    placeId: { type: String, default: "" },
    // GeoJSON Point: coordinates MUST be [longitude, latitude].
    location: {
      type: { type: String, enum: ["Point"], default: "Point", required: true },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator(v: number[]) {
            return (
              Array.isArray(v) &&
              v.length === 2 &&
              v[0] >= -180 &&
              v[0] <= 180 &&
              v[1] >= -90 &&
              v[1] <= 90
            );
          },
          message: "location.coordinates must be [longitude, latitude]",
        },
      },
    },

    accessInstructions: { type: String, default: "", maxlength: 2000 },
    vehicleSizeNotes: { type: String, default: "", maxlength: 400 },
    overnightAllowed: { type: Boolean, default: false },
    selfParkingConfirmed: { type: Boolean, default: false },
    rules: { type: [String], default: [] },
    blockedDates: { type: [String], default: [] }, // YYYY-MM-DD local dates the host has blocked

    pricePerHour: { type: Number, required: true, min: 0 }, // paise
    minDurationMins: { type: Number, default: 60 },
    maxDurationMins: { type: Number, default: 1440 },

    images: { type: [imageSchema], default: [] },
    availability: { type: [availabilityRuleSchema], default: [] }, // empty = 24/7

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    bookingsCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        const loc = ret.location as { coordinates?: [number, number] } | undefined;
        // Convenience lat/lng for the frontend (existing UI expects these).
        if (loc?.coordinates) {
          ret.longitude = loc.coordinates[0];
          ret.latitude = loc.coordinates[1];
        }
        delete ret.__bookLock;
        return ret;
      },
    },
  }
);

parkingSpaceSchema.index({ location: "2dsphere" });
parkingSpaceSchema.index({ status: 1, pricePerHour: 1 });
parkingSpaceSchema.index({ hostId: 1, status: 1 });
parkingSpaceSchema.index({ locality: 1, city: 1, area: 1 });

export type ParkingSpaceDoc = HydratedDocument<InferSchemaType<typeof parkingSpaceSchema>>;
export const ParkingSpace = mongoose.model("ParkingSpace", parkingSpaceSchema);
