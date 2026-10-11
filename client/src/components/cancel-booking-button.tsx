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
      toast.success(
        data.data.refunded ? "Booking cancelled — full refund initiated." : "Booking cancelled."
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
            ? "You're within the free-cancellation window, so you'll receive a full refund."
            : "You're past the free-cancellation window — this booking is non-refundable."
        }
        confirmLabel="Yes, cancel it"
      />
    </>
  );
}
