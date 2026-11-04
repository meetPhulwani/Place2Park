export const DRIVER_REPORTS: [string, string][] = [
  ["SPOT_UNAVAILABLE", "Parking spot unavailable"],
  ["NO_ACCESS", "Host did not provide access"],
  ["INCORRECT_LISTING", "Incorrect listing information"],
  ["MISLEADING_PHOTOS", "Misleading photos"],
  ["HOST_MISCONDUCT", "Host misconduct"],
  ["PAYMENT_DISPUTE", "Payment or refund dispute"],
  ["OTHER", "Other"],
];

export const HOST_REPORTS: [string, string][] = [
  ["DRIVER_NO_SHOW", "Driver did not arrive"],
  ["UNAUTHORIZED_VEHICLE", "Unauthorized vehicle"],
  ["OVERSTAY", "Vehicle overstayed"],
  ["PROPERTY_DAMAGE", "Property or parking space damage"],
  ["DRIVER_MISCONDUCT", "Driver misconduct"],
  ["BOOKING_MISUSE", "Booking misuse"],
  ["OTHER", "Other"],
];

export const SUPPORT_TOPICS: [string, string][] = [
  ["ACCOUNT", "Account and authentication"],
  ["BOOKING", "Booking problems"],
  ["PAYMENTS", "Payments and refunds"],
  ["PAYOUTS", "Host payouts"],
  ["LISTINGS", "Parking listings"],
  ["MAPS", "Location and maps"],
  ["BUG", "Technical bugs"],
  ["OTHER", "Other"],
];

export const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  AWAITING_USER: "Awaiting your reply",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

export function labelOf(list: [string, string][], value: string) {
  return list.find(([id]) => id === value)?.[1] ?? value.replaceAll("_", " ").toLowerCase();
}
