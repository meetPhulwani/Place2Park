import * as React from "react";
import { api, errorMessage } from "@/services/api";
import { useAuth } from "@/context/auth";
import { GoogleButton } from "@/components/google-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
  DELETE_CONFIRMATION,
  confirmationMatches,
  shouldBlockConfirmClipboard,
  shouldBlockConfirmShortcut,
} from "@/lib/confirm-deletion";

export function AccountManagement() {
  const { user, logout } = useAuth();
  const [security, setSecurity] = React.useState({ hasPassword: true, googleOnly: false });
  const [step, setStep] = React.useState<"closed" | "warning" | "confirm">("closed");
  const [credential, setCredential] = React.useState("");
  const [phrase, setPhrase] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    api
      .get("/account/security")
      .then(({ data }) => setSecurity(data.data))
      .catch(() => undefined);
  }, []);

  function close() {
    setStep("closed");
    setCredential("");
    setPhrase("");
  }

  async function remove() {
    if (!confirmationMatches(phrase)) return;
    setBusy(true);
    try {
      await api.post("/account/delete", {
        confirmation: phrase,
        ...(security.googleOnly ? { credential } : {}),
      });
      toast.success("Your account has been deleted.");
      sessionStorage.setItem("p2p_after_delete", "1");
      logout();
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't delete this account."));
    } finally {
      setBusy(false);
    }
  }

  const ready = confirmationMatches(phrase) && (!security.googleOnly || credential.length > 0);

  return (
    <section className="space-y-4" aria-labelledby="account-management-heading">
      <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
        <h2 id="account-management-heading" className="text-sm font-semibold text-red-700">
          Delete account
        </h2>
        <p className="mt-2 text-sm text-red-900/80">
          Account deletion is permanent once it is finalized. Download anything you want to keep before you continue.
        </p>
        {user?.role === "ADMIN" ? (
          <p className="mt-3 text-sm text-red-800">Administrator accounts can't be deleted from this page.</p>
        ) : (
          <Button className="mt-4" variant="danger" onClick={() => setStep("warning")}>
            Delete account
          </Button>
        )}
      </div>

      <Dialog open={step === "warning"} onClose={close} title="Delete your account" description="Read this before you continue." className="max-h-[90vh] overflow-y-auto">
        <div className="space-y-4 text-sm text-muted">
          <p>Account deletion is permanent once finalized. You may lose access to your profile, saved preferences, favorites, and other account features.</p>
          <p>Active bookings, unresolved disputes, pending refunds, and unpaid host payouts can prevent immediate deletion.</p>
          <p>Booking, payment, tax, and audit records may be retained where the law or an open obligation requires them. Those records are kept without your personal details.</p>
          <p>Download any data you want to keep from Privacy before you continue.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button variant="danger" onClick={() => { setPhrase(""); setStep("confirm"); }}>Continue to Delete Account</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={step === "confirm"} onClose={close} title="Confirm account deletion" description="This request is checked on the server." className="max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <p className="text-sm text-ink">To permanently request account deletion, type CONFIRM in the box below.</p>
          <div>
            <Label htmlFor="delete-phrase">Confirmation</Label>
            <Input
              id="delete-phrase"
              value={phrase}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setPhrase(event.target.value)}
              onPaste={(event) => { if (shouldBlockConfirmClipboard("paste")) event.preventDefault(); }}
              onCut={(event) => { if (shouldBlockConfirmClipboard("cut")) event.preventDefault(); }}
              onDrop={(event) => { if (shouldBlockConfirmClipboard("drop")) event.preventDefault(); }}
              onKeyDown={(event) => { if (shouldBlockConfirmShortcut(event)) event.preventDefault(); }}
            />
            {phrase.length > 0 && !confirmationMatches(phrase) ? (
              <p className="mt-1 text-sm text-red-700">Type the exact word {DELETE_CONFIRMATION}.</p>
            ) : null}
          </div>
          {security.googleOnly ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Confirm with Google</p>
              <GoogleButton
                unavailableMessage="Google confirmation isn't available in this browser."
                onConfirm={(value) => {
                  setCredential(value);
                  toast.success("Google confirmation received.");
                }}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
            <Button variant="danger" disabled={!ready || busy} loading={busy} onClick={() => void remove()}>
              Delete account
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
