import * as React from "react";
import { useNavigate } from "react-router-dom";
import Link from "@/components/link";
import { api, errorMessage } from "@/services/api";
import { useAuth } from "@/context/auth";
import { GoogleButton } from "@/components/google-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";

const PHRASE = "DELETE MY ACCOUNT";

export function AccountManagement() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [security, setSecurity] = React.useState({ hasPassword: true, googleOnly: false });
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
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
    setOpen(false);
    setPassword("");
    setCredential("");
    setPhrase("");
  }

  async function remove() {
    setBusy(true);
    try {
      await api.post("/account/delete", {
        confirmation: phrase,
        ...(security.hasPassword ? { password } : {}),
        ...(security.googleOnly ? { credential } : {}),
      });
      logout();
      toast.success("Your account has been deleted.");
      navigate("/");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't delete this account."));
    } finally {
      setBusy(false);
    }
  }

  const ready = phrase === PHRASE && (security.hasPassword ? password.length > 0 : !security.googleOnly || credential.length > 0);

  return (
    <section className="space-y-4" aria-labelledby="account-management-heading">
      <div>
        <h2 id="account-management-heading" className="font-display text-lg font-semibold text-ink">
          Account management
        </h2>
        <p className="mt-1 text-sm text-muted">Password and account closure.</p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">Change password</h3>
        {security.googleOnly ? (
          <p className="mt-2 text-sm text-muted">You sign in with Google. This account doesn't have a password to change.</p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            We'll email a link so you can choose a new password.{" "}
            <Link href="/forgot-password" className="font-medium text-brand-600 hover:underline">
              Change password
            </Link>
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
        <h3 className="text-sm font-semibold text-red-700">Delete account</h3>
        <p className="mt-2 text-sm text-red-900/80">
          Deleting your account is permanent. Your name, email, phone, saved places, and listing details are removed or anonymized.
          Booking, payment, and payout records can be kept where the law or a dispute requires them.
        </p>
        {user?.role === "ADMIN" ? (
          <p className="mt-3 text-sm text-red-800">Administrator accounts can't be deleted from this page.</p>
        ) : (
          <Button className="mt-4" variant="danger" onClick={() => setOpen(true)}>
            Delete account
          </Button>
        )}
      </div>

      <Dialog
        open={open}
        onClose={close}
        title="Delete your account"
        description="This cannot be undone."
        className="max-h-[90vh] overflow-y-auto"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            We delete or anonymize your profile, vehicles, favorites, notifications, and review comments. Host listings are unpublished
            and their address, photos, and access notes are removed. Booking, payment, and payout records stay so Place2Park can
            reconcile money, handle disputes, and meet accounting and fraud-prevention duties. Those records no longer show your name,
            phone, or vehicle plate.
          </p>
          <p className="text-sm text-muted">
            Deletion waits if you have an active booking, an open support case, a refund in progress, or host earnings that have not been paid.
          </p>
          {security.hasPassword ? (
            <div>
              <Label htmlFor="delete-password">Current password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          ) : null}
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
              {credential ? <p className="text-sm text-brand-700">Google confirmation is ready.</p> : null}
            </div>
          ) : null}
          <div>
            <Label htmlFor="delete-phrase">Type {PHRASE}</Label>
            <Input id="delete-phrase" value={phrase} autoComplete="off" onChange={(event) => setPhrase(event.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" disabled={!ready || busy} loading={busy} onClick={() => void remove()}>
              Delete account
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
