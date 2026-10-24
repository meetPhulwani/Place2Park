import { z } from "zod";
import { ALLOWED_DURATIONS_MINS, LEVELS, PROPERTY_TYPES, REPORT_REASONS, VEHICLE_TYPES } from "./constants.js";

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(100),
  role: z.enum(["DRIVER", "HOST", "BOTH"]).default("DRIVER"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const googleLoginSchema = z.object({
  credential: z.string().min(10), // Google ID token from Google Identity Services
});

export const createPaymentOrderSchema = z.object({
  bookingId: z.string().min(1),
});

export const verifyPaymentSchema = z.object({
  bookingId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const bookingRequestSchema = z.object({
  spaceId: z.string().min(1),
  start: z.coerce.date(),
  durationMins: z
    .number()
    .int()
    .refine((v) => (ALLOWED_DURATIONS_MINS as readonly number[]).includes(v), "Invalid duration"),
  vehicleType: z.enum(VEHICLE_TYPES).default("CAR"),
  vehiclePlate: z.string().trim().max(15).optional().transform((v) => (v === "" ? undefined : v)),
});

export const reviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
});

export const reportSchema = z.object({
  spaceId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(2000).default(""),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,14}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  preferredVehicleType: z.enum(VEHICLE_TYPES),
  notifyEmail: z.boolean(),
  notifyReminders: z.boolean(),
});

export const vehicleSchema = z.object({
  type: z.enum(VEHICLE_TYPES),
  make: z.string().trim().max(40).default(""),
  model: z.string().trim().max(40).default(""),
  plate: z.string().trim().min(4, "Enter the plate number").max(15),
});

export const listingSchema = z
  .object({
    title: z.string().trim().min(8, "Give the listing a descriptive title").max(90),
    description: z.string().trim().max(2000).default(""),
    propertyType: z.enum(PROPERTY_TYPES),
    spaceType: z.enum(["PRIVATE", "OPEN"]),
    covered: z.boolean(),
    level: z.enum(LEVELS),
    vehicleTypes: z.array(z.enum(VEHICLE_TYPES)).min(1, "Pick at least one vehicle type"),
    evCharging: z.boolean(),
    cctv: z.boolean(),
    securityGuard: z.boolean(),
    gated: z.boolean(),
    lengthFt: z.number().positive().max(60).optional().nullable(),
    widthFt: z.number().positive().max(40).optional().nullable(),
    heightFt: z.number().positive().max(30).optional().nullable(),
    address: z.string().trim().min(4, "Enter the full address").max(240),
    formattedAddress: z.string().trim().max(300).optional().or(z.literal("")),
    locality: z.string().trim().max(80).optional().or(z.literal("")),
    sublocality: z.string().trim().max(80).optional().or(z.literal("")),
    area: z.string().trim().min(2, "Enter the area/locality").max(80),
    city: z.string().trim().min(2).max(60),
    district: z.string().trim().max(80).optional().or(z.literal("")),
    state: z.string().trim().max(60).optional().or(z.literal("")),
    pincode: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit PIN code").optional().or(z.literal("")),
    postalCode: z.string().trim().max(12).optional().or(z.literal("")),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    placeId: z.string().max(200).optional().or(z.literal("")),
    accessInstructions: z.string().trim().max(2000).default(""),
    vehicleSizeNotes: z.string().trim().max(400).default(""),
    overnightAllowed: z.boolean().default(false),
    selfParkingConfirmed: z.boolean().default(false),
    rules: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    pricePerHour: z.number().int().min(1000, "Minimum ₹10/hour").max(100000, "Maximum ₹1,000/hour"), // paise
    minDurationMins: z.number().int().refine((v) => (ALLOWED_DURATIONS_MINS as readonly number[]).includes(v)),
    maxDurationMins: z.number().int().refine((v) => (ALLOWED_DURATIONS_MINS as readonly number[]).includes(v)),
    images: z
      .array(
        z.object({
          url: z.string().min(1),
          alt: z.string().default(""),
          publicId: z
            .string()
            .max(300)
            .regex(/^[A-Za-z0-9_./-]*$/, "Invalid image id")
            .optional()
            .or(z.literal("")),
        })
      )
      .max(8),
    availability: z
      .array(
        z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          startMinute: z.number().int().min(0).max(1440),
          endMinute: z.number().int().min(0).max(1440),
        })
      )
      .max(21)
      .default([]),
    blockedDates: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"))
      .max(90)
      .default([]),
    publish: z.boolean().default(false),
  })
  .refine((d) => d.minDurationMins <= d.maxDurationMins, {
    message: "Minimum duration can't exceed maximum",
    path: ["maxDurationMins"],
  })
  .refine((d) => !d.publish || d.selfParkingConfirmed, {
    message: "Confirm that drivers park their own vehicles and you will not request keys.",
    path: ["selfParkingConfirmed"],
  });

export const payoutProfileSchema = z.object({
  accountHolder: z.string().trim().min(2).max(80),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code."),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, "Enter a valid bank account number."),
});

export const payoutReferenceSchema = z.object({
  reference: z.string().trim().min(4).max(80),
  note: z.string().trim().max(400).optional(),
});

export const payoutNoteSchema = z.object({
  note: z.string().trim().max(400).optional(),
});

export const smtpTestSchema = z.object({
  confirm: z.literal(true),
  to: z.string().trim().email().optional(),
});

export type ListingInput = z.infer<typeof listingSchema>;

export const blockSlotSchema = z
  .object({
    spaceId: z.string().min(1),
    start: z.coerce.date(),
    end: z.coerce.date(),
    reason: z.string().trim().max(160).default(""),
  })
  .refine((d) => d.end > d.start, { message: "End must be after start" });
