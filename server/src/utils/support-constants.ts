export const TICKET_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "AWAITING_USER",
  "RESOLVED",
  "REJECTED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const DRIVER_REPORT_CATEGORIES = [
  "SPOT_UNAVAILABLE",
  "NO_ACCESS",
  "INCORRECT_LISTING",
  "MISLEADING_PHOTOS",
  "HOST_MISCONDUCT",
  "PAYMENT_DISPUTE",
  "OTHER",
] as const;

export const HOST_REPORT_CATEGORIES = [
  "DRIVER_NO_SHOW",
  "UNAUTHORIZED_VEHICLE",
  "OVERSTAY",
  "PROPERTY_DAMAGE",
  "DRIVER_MISCONDUCT",
  "BOOKING_MISUSE",
  "OTHER",
] as const;

export const SUPPORT_CATEGORIES = [
  "ACCOUNT",
  "BOOKING",
  "PAYMENTS",
  "PAYOUTS",
  "LISTINGS",
  "MAPS",
  "BUG",
  "OTHER",
] as const;

export const ACTIVE_TICKET_STATUSES: TicketStatus[] = ["OPEN", "UNDER_REVIEW", "AWAITING_USER"];

const NEXT: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["UNDER_REVIEW", "AWAITING_USER", "RESOLVED", "REJECTED", "CLOSED"],
  UNDER_REVIEW: ["AWAITING_USER", "RESOLVED", "REJECTED", "CLOSED"],
  AWAITING_USER: ["UNDER_REVIEW", "RESOLVED", "REJECTED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CLOSED: [],
};

export function canTransitionTicket(from: string, to: string) {
  return (NEXT[from as TicketStatus] ?? []).includes(to as TicketStatus);
}

export function statusNeedsNote(status: string) {
  return status === "RESOLVED" || status === "REJECTED" || status === "CLOSED";
}
