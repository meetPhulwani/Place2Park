import * as React from "react";
import { api, errorMessage } from "@/services/api";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

export function ListingModeration({
  spaceId,
  status,
  onChanged,
}: {
  spaceId: string;
  status: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function act(action: "approve" | "reject" | "hide" | "unhide", msg: string) {
    setBusy(true);
    try {
      await api.post(`/admin/listings/${spaceId}/moderate`, { action });
      toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Action failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "PENDING_REVIEW" && (
        <>
          <Button size="sm" disabled={busy} onClick={() => act("approve", "Listing approved and live.")}>
            Approve
          </Button>
          <Button
            variant="danger-outline"
            size="sm"
            disabled={busy}
            onClick={() => act("reject", "Listing rejected.")}
          >
            Reject
          </Button>
        </>
      )}
      {(status === "ACTIVE" || status === "VERIFIED") && (
        <Button
          variant="danger-outline"
          size="sm"
          disabled={busy}
          onClick={() => act("hide", "Listing hidden from search.")}
        >
          Hide
        </Button>
      )}
      {status === "HIDDEN" && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => act("unhide", "Listing restored.")}
        >
          Unhide
        </Button>
      )}
      {status === "REJECTED" && (
        <Button size="sm" disabled={busy} onClick={() => act("approve", "Listing approved and live.")}>
          Approve
        </Button>
      )}
    </div>
  );
}
