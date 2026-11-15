import * as React from "react";
import { api, errorMessage } from "@/services/api";
import { reviewCategories, reviewPrompt } from "@/lib/review-flow";
import { Button } from "./ui/button";
import { Label, Textarea } from "./ui/input";
import { RatingInput } from "./ui/rating";
import { toast } from "./ui/toaster";

export function ReviewForm({
  bookingId,
  role,
  spaceTitle,
  allowSkip,
  showPrompt = true,
  onDone,
  onSkip,
}: {
  bookingId: string;
  role: "DRIVER" | "HOST";
  spaceTitle: string;
  allowSkip: boolean;
  showPrompt?: boolean;
  onDone: () => void;
  onSkip?: () => void;
}) {
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [categories, setCategories] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState(false);
  const fields = reviewCategories(role);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      toast.error("Pick a star rating first.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/reviews", { bookingId, rating, comment, categories });
      toast.success("Thanks — your review was saved.");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't submit your review."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {(showPrompt || spaceTitle) && (
        <div>
          {showPrompt && <p className="text-sm font-medium text-slate-900">{reviewPrompt(role)}</p>}
          {spaceTitle && <p className="mt-1 text-sm text-slate-500">{spaceTitle}</p>}
        </div>
      )}
      <div>
        <Label>Rating</Label>
        <RatingInput value={rating} onChange={setRating} disabled={busy} />
      </div>
      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-sm text-slate-600">Optional details</legend>
        {fields.map((field) => (
          <div key={field.key}>
            <Label>{field.label}</Label>
            <RatingInput
              value={categories[field.key] ?? 0}
              onChange={(value) => setCategories((current) => ({ ...current, [field.key]: value }))}
              disabled={busy}
            />
          </div>
        ))}
      </fieldset>
      <div>
        <Label htmlFor={`review-${bookingId}`} hint="(optional)">
          Written review
        </Label>
        <Textarea
          id={`review-${bookingId}`}
          rows={3}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share what went well or what should change."
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {allowSkip && onSkip && (
          <Button type="button" variant="ghost" disabled={busy} onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          Submit review
        </Button>
      </div>
    </form>
  );
}
