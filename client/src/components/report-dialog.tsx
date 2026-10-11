import * as React from "react";
import { Flag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label, Textarea, Select } from "./ui/input";
import { toast } from "./ui/toaster";
import { api, errorMessage } from "@/services/api";
import { REPORT_REASONS, REPORT_REASON_LABELS } from "@/lib/constants";

export function ReportDialog({ spaceId, loggedIn }: { spaceId: string; loggedIn: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string>("INCORRECT_INFO");
  const [details, setDetails] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/reports", { spaceId, reason, details });
      setOpen(false);
      setDetails("");
      toast.success("Report submitted. Our team will review this listing.");
    } catch (e2) {
      toast.error(errorMessage(e2, "Couldn't submit report."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (loggedIn ? setOpen(true) : navigate(`/login?next=/parking/${spaceId}`))}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-red-600"
      >
        <Flag className="size-3.5" aria-hidden />
        Report this listing
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report this listing"
        description="Reports are reviewed by the Parkly team. The host won't see your identity."
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="report-reason">Reason</Label>
            <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="report-details" hint="(optional)">
              Details
            </Label>
            <Textarea
              id="report-details"
              rows={3}
              maxLength={2000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What happened?"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Submit report
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
