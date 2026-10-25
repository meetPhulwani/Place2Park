import * as React from "react";
import { postBookingCancel, runCancelBooking } from "@/lib/cancel-booking";
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
  const inflight = React.useRef(false);

  function closeDialog() {
    setOpen(false);
    setBusy(false);
  }

  async function onConfirm() {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const result = await runCancelBooking({
        post: () => postBookingCancel(bookingId),
        setBusy,
        onSuccess: (message) => toast.success(message),
        onError: (message) => toast.error(message),
        onCancelled,
      });
      if (result.ok) setOpen(false);
    } finally {
      inflight.current = false;
    }
  }

  return (
    <>
      <Button variant="danger-outline" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
      <ConfirmDialog
        open={open}
        onClose={closeDialog}
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
