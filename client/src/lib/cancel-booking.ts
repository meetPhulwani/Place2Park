import { AxiosError } from "axios";
import { api, errorMessage } from "@/services/api";

export const CANCEL_REQUEST_TIMEOUT_MS = 25_000;

export function cancelSuccessMessage(data: { refunded?: boolean; refundStatus?: string | null }) {
  if (data.refundStatus === "PROCESSED") return "Booking cancelled. Razorpay has confirmed the refund.";
  if (data.refundStatus === "PENDING" || data.refunded) {
    return "Booking cancelled. A refund was requested — it can take a few days to appear.";
  }
  return "Booking cancelled.";
}

export async function runCancelBooking(input: {
  post: () => Promise<{ refunded?: boolean; refundStatus?: string | null }>;
  setBusy: (busy: boolean) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onCancelled?: () => void;
}) {
  input.setBusy(true);
  try {
    const data = await input.post();
    input.onSuccess(cancelSuccessMessage(data));
    input.onCancelled?.();
    return { ok: true as const, data };
  } catch (err) {
    input.onError(errorMessage(err, "Couldn't cancel this booking."));
    return { ok: false as const };
  } finally {
    input.setBusy(false);
  }
}

export async function postBookingCancel(bookingId: string) {
  const { data } = await api.post(`/bookings/${bookingId}/cancel`, undefined, {
    timeout: CANCEL_REQUEST_TIMEOUT_MS,
  });
  return data.data as { refunded?: boolean; refundStatus?: string | null };
}

export function isCancelTimeout(err: unknown) {
  return err instanceof AxiosError && (err.code === "ECONNABORTED" || /timeout/i.test(err.message));
}
