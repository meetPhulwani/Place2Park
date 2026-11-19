export interface SpaceSummary {
  id: string;
  title: string;
  area: string;
  city: string;
  locality: string;
  displayLocation: string;
  latitude: number | null;
  longitude: number | null;
  pricePerHour: number;
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

export interface PlacePrediction {
  id: string;
  mainText: string;
  secondaryText: string;
  lat: number;
  lng: number;
}

export interface SearchCenter {
  lat: number;
  lng: number;
}

export type ApiSort = "closest" | "cheapest" | "rating";
export type SeekerSort = ApiSort | "highest-price";

export interface SearchDraft {
  q?: string;
  lat?: number;
  lng?: number;
  label?: string;
  maxPrice?: number;
  maxDistanceKm?: number;
  covered?: boolean;
  ev?: boolean;
  vehicleType?: "CAR" | "BIKE";
  minRating?: number;
  sort?: SeekerSort;
  /** When set with durationMins, the API flags availability. It does not drop rows. */
  start?: string;
  durationMins?: number;
}

export interface ListingImage {
  url: string;
  alt: string;
}

export interface ListingReview {
  id: string;
  rating: number;
  comment: string;
  author: string;
}

export interface ListingDetail {
  id: string;
  title: string;
  description: string;
  displayLocation: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  pricePerHour: number;
  ratingAvg: number;
  ratingCount: number;
  propertyType: string;
  spaceType: string;
  covered: boolean;
  level: string;
  vehicleTypes: string[];
  amenities: string[];
  lengthFt: number | null;
  widthFt: number | null;
  heightFt: number | null;
  vehicleSizeNotes: string;
  accessInstructions: string;
  rules: string[];
  images: ListingImage[];
  revealExactLocation: boolean;
  isFavorite: boolean;
  hostName: string;
  hostImage: string;
  reviews: ListingReview[];
}
