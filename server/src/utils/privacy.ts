/** Exact address / access code are only for confirmed (or later) bookings. */
export function revealBookingSecrets(status: string) {
  return ["CONFIRMED", "ACTIVE", "COMPLETED"].includes(status);
}

export function redactBooking<T extends Record<string, unknown>>(booking: T): T {
  if (!revealBookingSecrets(String(booking.status ?? ""))) {
    (booking as Record<string, unknown>).accessCode = "";
  }
  return booking;
}
