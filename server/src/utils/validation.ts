import { z } from "zod";
import { isAllowedListingImageUrl } from "../services/media.js";
import { ALLOWED_DURATIONS_MINS, LEVELS, PROPERTY_TYPES, REPORT_REASONS, VEHICLE_TYPES } from "./constants.js";
import { FAQ_CATEGORIES } from "./faq-constants.js";
import { DRIVER_REPORT_CATEGORIES, HOST_REPORT_CATEGORIES, SUPPORT_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "./support-constants.js";
import { passwordIssue } from "./password.js";
import { normalizeIndianMobile } from "./phone.js";

const indianMobile = z.string().trim().transform((value, ctx) => {
  const phone = normalizeIndianMobile(value);
  if (!phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid 10-digit mobile number" });
    return z.NEVER;
  }
  return phone;
});

const signupPassword = z.string().max(100).superRefine((value, ctx) => {
  const message = passwordIssue(value);
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: signupPassword,
  role: z.enum(["DRIVER", "HOST", "BOTH"]).default("DRIVER"),
  phone: indianMobile,
}).strict();

export const emailOtpResendSchema = z.object({
  pendingToken: z.string().trim().min(20).max(500),
}).strict();

export const emailOtpVerifySchema = z.object({
  pendingToken: z.string().trim().min(20).max(500),
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(100),
}).strict();

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(200),
  password: signupPassword,
}).strict();

export const googleLoginSchema = z.object({
  credential: z.string().min(10).max(8000),
}).strict();

export const emptyBodySchema = z.object({}).strict();

export const accountNameSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
export const accountEmailRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
export const accountPhoneRequestSchema = z.object({ phone: indianMobile }).strict();
export const accountCodeSchema = z
  .object({
    pendingToken: z.string().trim().min(20).max(200),
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
  })
  .strict();
export const accountPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(100),
    newPassword: signupPassword,
    confirmPassword: z.string().min(1).max(100),
  })
  .strict()
  .refine((value) => value.newPassword === value.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });
const notificationChannelSchema = z
  .object({
    bookingConfirmed: z.boolean(),
    bookingCancelled: z.boolean(),
    bookingReminder: z.boolean(),
    payment: z.boolean(),
    refund: z.boolean(),
    hostRequest: z.boolean(),
    hostStatus: z.boolean(),
    payout: z.boolean(),
    promo: z.boolean(),
    product: z.boolean(),
  })
  .strict();
export const notificationPrefsSchema = z.object({ email: notificationChannelSchema, inApp: notificationChannelSchema }).strict();
export const privacyPrefsSchema = z.object({ showPublicHostName: z.boolean(), marketingEmail: z.boolean() }).strict();

export const deleteAccountSchema = z
  .object({
    confirmation: z.literal("CONFIRM"),
    password: z.string().max(100).optional(),
    credential: z.string().max(8000).optional(),
  })
  .strict();

export const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid id.");

export const createPaymentOrderSchema = z.object({
  bookingId: objectIdSchema,
}).strict();

export const verifyPaymentSchema = z.object({
  bookingId: objectIdSchema,
  razorpayOrderId: z.string().trim().min(1).max(80),
  razorpayPaymentId: z.string().trim().min(1).max(80),
  razorpaySignature: z.string().trim().min(1).max(256),
}).strict();

export const bookingRequestSchema = z.object({
  spaceId: objectIdSchema,
  start: z.coerce.date(),
  durationMins: z
    .number()
    .int()
    .refine((v) => (ALLOWED_DURATIONS_MINS as readonly number[]).includes(v), "Invalid duration"),
  vehicleType: z.enum(VEHICLE_TYPES).default("CAR"),
  vehiclePlate: z.string().trim().min(4, "Enter the vehicle number").max(15),
}).strict();

export const reviewSchema = z.object({
  bookingId: objectIdSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
}).strict();

const userReportCategories = [...new Set([...DRIVER_REPORT_CATEGORIES, ...HOST_REPORT_CATEGORIES])] as [string, ...string[]];

export const userReportSchema = z.object({
  bookingId: objectIdSchema,
  reportedUserId: objectIdSchema.optional(),
  category: z.enum(userReportCategories),
  description: z.string().trim().min(20).max(2000),
  incidentAt: z.union([z.string().datetime(), z.literal("")]).optional(),
  evidenceIds: z.array(objectIdSchema).max(4).optional(),
}).strict();

export const supportTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20).max(2000),
  bookingId: z.union([objectIdSchema, z.literal("")]).optional(),
  paymentId: z.union([objectIdSchema, z.literal("")]).optional(),
  evidenceIds: z.array(objectIdSchema).max(4).optional(),
}).strict();

export const ticketReplySchema = z.object({
  body: z.string().trim().min(2).max(2000),
  visibility: z.enum(["PUBLIC", "INTERNAL"]).optional(),
}).strict();

export const ticketUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigneeId: objectIdSchema.nullable().optional(),
  note: z.string().trim().max(2000).optional(),
}).strict();

export const faqSchema = z.object({
  category: z.enum(FAQ_CATEGORIES),
  question: z.string().trim().min(8).max(200),
  answer: z.string().trim().min(20).max(2000),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(1000).optional(),
  related: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
});

export const faqUpdateSchema = faqSchema.partial();

export const faqFeedbackSchema = z.object({
  helpful: z.boolean(),
});

export const faqReorderSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(200),
});

export const favoriteSchema = z.object({ spaceId: objectIdSchema }).strict();

export const listingStatusSchema = z.object({
  action: z.enum(["pause", "activate", "submit", "delete"]),
}).strict();

export const userStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
}).strict();

export const verifiedFlagSchema = z.object({
  verified: z.boolean(),
}).strict();

export const moderationSchema = z.object({
  action: z.enum(["approve", "reject", "hide", "unhide"]),
}).strict();

export const resolveReportSchema = z.object({
  action: z.enum(["resolve", "dismiss"]),
  note: z.string().trim().max(500).optional(),
}).strict();

export const reportSchema = z.object({
  spaceId: objectIdSchema,
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(2000).default(""),
}).strict();

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.union([z.literal(""), indianMobile]).optional(),
  preferredVehicleType: z.enum(VEHICLE_TYPES),
  notifyEmail: z.boolean(),
  notifyReminders: z.boolean(),
}).strict();

export const vehicleSchema = z.object({
  type: z.enum(VEHICLE_TYPES),
  make: z.string().trim().max(40).default(""),
  model: z.string().trim().max(40).default(""),
  plate: z.string().trim().min(4, "Enter the vehicle number").max(15),
}).strict();

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
          url: z
            .string()
            .min(1)
            .refine((url) => isAllowedListingImageUrl(url), "Use an uploaded Parkly photo."),
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

const payoutAccountFields = {
  accountHolder: z.string().trim().min(2, "Enter the account holder name.").max(80),
  bankName: z.string().trim().min(2, "Enter the bank name.").max(80),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code."),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, "Enter a valid bank account number."),
  confirmAccountNumber: z.string().trim().regex(/^\d{9,18}$/, "Enter a valid bank account number."),
};

export const payoutProfileSchema = z
  .object(payoutAccountFields)
  .refine((d) => d.accountNumber === d.confirmAccountNumber, {
    message: "Account numbers do not match.",
    path: ["confirmAccountNumber"],
  });

export const payoutDetailsUpdateSchema = z
  .object({
    ...payoutAccountFields,
    currentPassword: z.string().min(1, "Enter your current password."),
  })
  .refine((d) => d.accountNumber === d.confirmAccountNumber, {
    message: "Account numbers do not match.",
    path: ["confirmAccountNumber"],
  });

export const payoutReferenceSchema = z.object({
  reference: z.string().trim().min(4).max(80),
  note: z.string().trim().max(400).optional(),
  transferDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid transfer date.").optional(),
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
    spaceId: objectIdSchema,
    start: z.coerce.date(),
    end: z.coerce.date(),
    reason: z.string().trim().max(160).default(""),
  })
  .refine((d) => d.end > d.start, { message: "End must be after start" });
