import * as React from "react";
import { Star } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label, Textarea } from "./ui/input";
import { RatingInput } from "./ui/rating";
import { toast } from "./ui/toaster";

export function ReviewDialog({
  bookingId,
  spaceTitle,
  triggerVariant = "secondary",
  onReviewed,
}: {
  bookingId: string;
  spaceTitle: string;
  triggerVariant?: "primary" | "secondary";
  onReviewed?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Pick a star rating first.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/reviews", { bookingId, rating, comment });
      setOpen(false);
      toast.success("Thanks — your review is live.");
      onReviewed?.();
    } catch (e2) {
      toast.error(errorMessage(e2, "Couldn't submit your review."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        <Star className="size-4" aria-hidden />
        Leave a review
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="How was your parking?"
        description={spaceTitle}
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Rating</Label>
            <RatingInput value={rating} onChange={setRating} disabled={busy} />
          </div>
          <div>
            <Label htmlFor="rev-comment" hint="(optional)">
              Comment
            </Label>
            <Textarea
              id="rev-comment"
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Was it easy to find? Safe? Worth the price?"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Submit review
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
