import * as React from "react";
import { Star } from "lucide-react";
import { reviewPrompt } from "@/lib/review-flow";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { ReviewForm } from "./review-form";

export function ReviewDialog({
  bookingId,
  spaceTitle,
  role = "DRIVER",
  triggerVariant = "secondary",
  onReviewed,
}: {
  bookingId: string;
  spaceTitle: string;
  role?: "DRIVER" | "HOST";
  triggerVariant?: "primary" | "secondary";
  onReviewed?: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        <Star className="size-4" aria-hidden />
        Leave a review
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={reviewPrompt(role)} description={spaceTitle}>
        <ReviewForm
          bookingId={bookingId}
          role={role}
          spaceTitle=""
          allowSkip={false}
          showPrompt={false}
          onDone={() => {
            setOpen(false);
            onReviewed?.();
          }}
        />
      </Dialog>
    </>
  );
}
