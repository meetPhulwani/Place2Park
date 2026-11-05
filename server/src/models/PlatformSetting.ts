import mongoose, { Schema } from "mongoose";

const platformSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "platform" },
    maintenanceBanner: { type: String, default: "", maxlength: 240 },
    listingsRequireReview: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const PlatformSetting = mongoose.model("PlatformSetting", platformSettingSchema);
