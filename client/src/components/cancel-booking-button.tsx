import * as React from "react";
import { api, errorMessage } from "@/services/api";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
import { toast } from "./ui/toaster";

export function CancelBookingButton({
  bookingId,
  refundable,
  onCancelled,
}: {
  bookingId: string;
  refundable: boolean;
  onCancelled?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      const { data } = await api.post(`/bookings/${bookingId}/cancel`);
      const refundStatus = data.data.refundStatus as string | null | undefined;
      toast.success(
        refundStatus === "PROCESSED"
          ? "Booking cancelled. Razorpay has confirmed the refund."
          : refundStatus === "PENDING" || data.data.refunded
            ? "Booking cancelled. A refund was requested — it can take a few days to appear."
            : "Booking cancelled."
      );
      onCancelled?.();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't cancel this booking."));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button variant="danger-outline" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        loading={busy}
        danger
        title="Cancel this booking?"
        description={
          refundable
            ? "You're within the free-cancellation window. We'll request a full refund from Razorpay. It can take a few business days, and this booking won't show as refunded until Razorpay confirms it."
            : "You're past the free-cancellation window — this booking is non-refundable."
        }
        confirmLabel="Yes, cancel it"
      />
    </>
  );
}
