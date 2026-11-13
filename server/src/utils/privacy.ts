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

const PAYMENT_GATEWAY_FIELDS = ["orderId", "paymentId", "refundId", "method", "signature"] as const;

/** The person who paid can see their own payment id. The other party only sees the status and amount. */
export function publicPaymentView(payment: Record<string, unknown> | null | undefined, viewerPaid: boolean) {
  if (!payment) return null;
  const view: Record<string, unknown> = { ...payment };
  delete view.signature;
  if (!viewerPaid) {
    for (const field of PAYMENT_GATEWAY_FIELDS) delete view[field];
  }
  return view;
}
