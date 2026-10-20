/** Shapes returned by the Express REST API. */

export interface SpaceSummary {
  id: string;
  title: string;
  area: string;
  city: string;
  locality?: string;
  sublocality?: string;
  district?: string;
  displayLocation?: string;
  latitude: number;
  longitude: number;
  pricePerHour: number; // paise
  ratingAvg: number;
  ratingCount: number;
  covered: boolean;
  evCharging: boolean;
  cctv: boolean;
  verified: boolean;
  vehicleTypes: string;
  level: string;
  propertyType: string;
  imageUrl: string | null;
  distanceKm: number | null;
  available: boolean | null;
}

export interface SpaceImage {
  url: string;
  alt: string;
  sortOrder: number;
  publicId?: string;
}

export interface AvailabilityRule {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface ParkingSpaceFull {
  id: string;
  hostId: string;
  title: string;
  description: string;
  status: string;
  verified: boolean;
  isDemo: boolean;
  propertyType: string;
  spaceType: string;
  covered: boolean;
  level: string;
  vehicleTypes: string;
  evCharging: boolean;
  cctv: boolean;
  securityGuard: boolean;
  gated: boolean;
  lengthFt?: number | null;
  widthFt?: number | null;
  heightFt?: number | null;
  address: string;
  formattedAddress?: string;
  locality?: string;
  sublocality?: string;
  area: string;
  city: string;
  district?: string;
  state: string;
  pincode: string;
  postalCode?: string;
  placeId: string;
  latitude: number;
  longitude: number;
  accessInstructions: string;
  vehicleSizeNotes?: string;
  overnightAllowed?: boolean;
  selfParkingConfirmed?: boolean;
  blockedDates?: string[];
  rules: string[];
  pricePerHour: number;
  minDurationMins: number;
  maxDurationMins: number;
  images: SpaceImage[];
  availability: AvailabilityRule[];
  ratingAvg: number;
  ratingCount: number;
  bookingsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookingSpaceRef {
  id: string;
  title: string;
  area?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  images?: SpaceImage[];
  accessInstructions?: string;
  rules?: string[];
  covered?: boolean;
  level?: string;
}

export interface Booking {
  id: string;
  code: string;
  userId: string | { id: string; name?: string; email?: string };
  spaceId: BookingSpaceRef | string;
  hostId: string | { id: string; name?: string; image?: string; hostVerified?: boolean };
  start: string;
  end: string;
  durationMins: number;
  status: "PENDING" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  vehicleType: string;
  vehiclePlate: string;
  accessCode: string;
  baseAmount: number;
  parkingFee?: number;
  bookingCode?: string;
  serviceFee: number;
  totalAmount: number;
  platformFee: number;
  hostEarning: number;
  refunded: boolean;
  reviewed?: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  provider: string;
  orderId?: string;
  paymentId?: string;
  amount: number;
  currency: string;
  status: "CREATED" | "PAID" | "FAILED" | "REFUNDED";
  paymentState?: "PAYMENT_PENDING" | "PAYMENT_PAID" | string;
  method?: string;
  createdAt: string;
  bookingCode?: string;
  spaceTitle?: string;
}

export interface Review {
  id: string;
  bookingId: string;
  spaceId: string | { id: string; title?: string };
  userId: string | { id: string; name?: string; image?: string; email?: string };
  rating: number;
  comment: string;
  createdAt: string;
  user?: { name: string; image: string | null };
}

export interface HostInfo {
  id: string;
  name: string;
  image?: string | null;
  hostVerified: boolean;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
}
