import * as React from "react";
import { api, errorMessage } from "@/services/api";
import { RISK_ACKNOWLEDGEMENT } from "@/lib/review-flow";
import { nextArrivalStep, plateMatchesQuestion, type ArrivalStep } from "@/lib/vehicle-arrival-flow";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label, Input } from "./ui/input";
import { toast } from "./ui/toaster";

export function VehicleArrivalDialog({
  bookingId,
  vehiclePlate,
  onClose,
}: {
  bookingId: string;
  vehiclePlate: string;
  onClose: () => void;
}) {
  const [step, setStep] = React.useState<ArrivalStep>("ask");
  const [accepted, setAccepted] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function record(decision: "MATCH" | "MISMATCH_DECLINED" | "MISMATCH_OVERRIDE") {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/host/bookings/${bookingId}/vehicle-check`, {
        decision,
        acknowledgement: decision === "MISMATCH_OVERRIDE" ? RISK_ACKNOWLEDGEMENT : undefined,
      });
      return true;
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the vehicle check."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function chooseYes() {
    if (await record("MATCH")) setStep(nextArrivalStep("ask", "yes"));
  }

  async function decline() {
    const saved = await record("MISMATCH_DECLINED");
    if (saved) onClose();
  }

  async function confirmRisk() {
    if (!accepted) return;
    if (await record("MISMATCH_OVERRIDE")) setStep(nextArrivalStep("risk", "confirm"));
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/host/bookings/${bookingId}/access-code`, { code });
      toast.success("The code matches. The booking stays on its current schedule.");
      onClose();
    } catch (err) {
      setError(errorMessage(err, "That code could not be checked."));
    } finally {
      setBusy(false);
    }
  }

  const warning = step === "warn" || step === "risk";

  return (
    <Dialog
      open
      onClose={onClose}
      title={warning ? "Vehicle number does not match" : "Check the arriving vehicle"}
      description={plateMatchesQuestion(vehiclePlate)}
      className={warning ? "border-red-300" : undefined}
    >
      <div className={warning ? "rounded-xl border border-red-300 bg-red-50 p-4 text-red-950" : "space-y-4"} role={warning ? "alert" : undefined}>
        {step === "ask" && (
          <div className="space-y-4">
            <p className="font-mono text-lg tracking-wide text-slate-900">{vehiclePlate || "No vehicle number on this booking"}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="w-full sm:w-auto" disabled={busy || !vehiclePlate} onClick={() => void chooseYes()}>
                Yes, it matches
              </Button>
              <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={() => setStep(nextArrivalStep("ask", "no"))}>
                No, it doesn't match
              </Button>
            </div>
          </div>
        )}

        {step === "warn" && (
          <div className="space-y-3">
            <p className="text-sm leading-6">
              Place2Park recommends not accepting this vehicle. Continuing is your decision and involves additional risk.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={() => void decline()}>
                Go back / do not accept
              </Button>
              <Button type="button" variant="danger" className="w-full sm:w-auto" disabled={busy} onClick={() => setStep(nextArrivalStep("warn", "continue"))}>
                Continue at my own risk
              </Button>
            </div>
          </div>
        )}

        {step === "risk" && (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm leading-6">
              <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              <span>I understand Place2Park recommends refusing this vehicle, and I am choosing to continue.</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep(nextArrivalStep("risk", "back"))}>
                Go back
              </Button>
              <Button type="button" variant="danger" disabled={busy || !accepted} onClick={() => void confirmRisk()}>
                Confirm and continue
              </Button>
            </div>
          </div>
        )}

        {step === "code" && (
          <form onSubmit={submitCode} className="space-y-3">
            <div>
              <Label htmlFor={`code-${bookingId}`}>Access code</Label>
              <Input
                id={`code-${bookingId}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
              />
            </div>
            <Button type="submit" loading={busy} disabled={code.length !== 6} className="w-full sm:w-auto">
              Check code
            </Button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    </Dialog>
  );
}
