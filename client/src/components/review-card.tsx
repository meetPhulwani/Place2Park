import * as React from "react";
import { Star } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { Avatar } from "./ui/avatar";
import { formatDate } from "@/lib/utils";
import { toast } from "./ui/toaster";

export function ReviewCard({
  review,
  canReport = false,
}: {
  review: {
    id: string;
    rating: number;
    comment: string;
    createdAt: Date | string;
    user?: { name: string | null; image: string | null };
  };
  canReport?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("ABUSIVE");
  const [busy, setBusy] = React.useState(false);

  async function report() {
    setBusy(true);
    try {
      await api.post(`/reviews/${review.id}/report`, { reason, details: "" });
      toast.success("Thanks — the review was reported for moderation.");
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't report this review."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={review.user?.name} image={review.user?.image} size={36} />
          <div>
            <p className="text-sm font-semibold text-slate-900">{review.user?.name ?? "Driver"}</p>
            <p className="text-xs text-slate-400">{formatDate(review.createdAt)}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-800">
          <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
          {review.rating}
        </span>
      </div>
      {review.comment && (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{review.comment}</p>
      )}
      {canReport && (
        <div className="mt-3">
          {open ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-xs text-slate-500" htmlFor={`report-${review.id}`}>
                Reason
                <select
                  id={`report-${review.id}`}
                  className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="ABUSIVE">Abusive</option>
                  <option value="SPAM">Spam</option>
                  <option value="PRIVATE_INFO">Private information</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <button type="button" className="text-sm font-medium text-brand-500 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void report()}>
                Submit report
              </button>
            </div>
          ) : (
            <button type="button" className="text-sm text-slate-500 hover:text-brand-500 hover:underline" onClick={() => setOpen(true)}>
              Report review
            </button>
          )}
        </div>
      )}
    </article>
  );
}
