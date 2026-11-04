export const FAQ_CATEGORIES = [
  "GETTING_STARTED",
  "DRIVERS",
  "HOSTS",
  "BOOKINGS",
  "PAYMENTS",
  "PAYOUTS",
  "ACCOUNT",
  "TECHNICAL",
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];
