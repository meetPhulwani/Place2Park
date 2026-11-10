import * as React from "react";
import { Landmark } from "lucide-react";
import { api, errorMessage, fieldErrors } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";

interface PayoutDetails {
  submitted: boolean;
  configured: boolean;
  verified: boolean;
  accountHolder: string;
  bankName: string;
  ifsc: string;
  accountLast4: string;
}

const emptyForm = {
  accountHolder: "",
  bankName: "",
  ifsc: "",
  accountNumber: "",
  confirmAccountNumber: "",
  currentPassword: "",
};

export default function HostPayoutSettingsPage() {
  const [details, setDetails] = React.useState<PayoutDetails | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    document.title = "Payout settings · Place2Park";
    api
      .get("/payout-details")
      .then(({ data }) => {
        const next = data.data.payoutDetails as PayoutDetails;
        setDetails(next);
        setForm((current) => ({
          ...current,
          accountHolder: next.accountHolder ?? "",
          bankName: next.bankName ?? "",
          ifsc: next.ifsc ?? "",
        }));
        setEditing(!next.configured);
      })
      .catch(() => {
        setDetails({
          submitted: false,
          configured: false,
          verified: false,
          accountHolder: "",
          bankName: "",
          ifsc: "",
          accountLast4: "",
        });
        setEditing(true);
      });
  }, []);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (form.accountNumber !== form.confirmAccountNumber) {
      nextErrors.confirmAccountNumber = "Account numbers do not match.";
    }
    if (details?.configured && !form.currentPassword) {
      nextErrors.currentPassword = "Enter your current password.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const payload = {
        accountHolder: form.accountHolder,
        bankName: form.bankName,
        ifsc: form.ifsc,
        accountNumber: form.accountNumber,
        confirmAccountNumber: form.confirmAccountNumber,
        ...(details?.configured ? { currentPassword: form.currentPassword } : {}),
      };
      const response = details?.configured
        ? await api.patch("/payout-details", payload)
        : await api.post("/payout-details", payload);
      const next = response.data.data.payoutDetails as PayoutDetails;
      setDetails(next);
      setForm({
        accountHolder: next.accountHolder ?? "",
        bankName: next.bankName ?? "",
        ifsc: next.ifsc ?? "",
        accountNumber: "",
        confirmAccountNumber: "",
        currentPassword: "",
      });
      setEditing(false);
      setSaved(true);
      toast.success(
        next.verified
          ? "Payout details saved."
          : "Payout details saved. An admin must verify them before a payout can be sent."
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const fields = fieldErrors(err);
      if (status === 401) fields.currentPassword = errorMessage(err, "Enter your current password to change payout details.");
      setErrors(fields);
      toast.error(errorMessage(err, "Could not save payout details."));
    } finally {
      setBusy(false);
    }
  }

  if (!details) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  const configured = details.configured;
  const statusLabel = details.verified ? "Verified" : configured ? "Awaiting verification" : "Not configured";

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0251B0]">Host payouts</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#111827]">Payout settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Bank details used when an admin sends your earnings. Place2Park does not transfer money automatically.
        </p>
      </div>

      <Card className="overflow-hidden border-white bg-white">
        <div className="h-1.5 bg-[#D1FF42]" aria-hidden />
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="size-5 text-[#0251B0]" aria-hidden />
            Payout account
          </CardTitle>
          <Badge variant={details.verified ? "success" : configured ? "warning" : "outline"}>{statusLabel}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {configured && !editing ? (
            <div className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label="Account holder" value={details.accountHolder || "—"} />
                <Detail label="Bank" value={details.bankName || "—"} />
                <Detail label="IFSC" value={details.ifsc || "—"} />
                <Detail label="Account number" value={details.accountLast4 ? `•••• ${details.accountLast4}` : "—"} />
              </dl>
              {saved && (
                <p className="rounded-xl bg-[#F3F5F7] px-3 py-2 text-sm text-[#111827]" role="status">
                  Saved. The account number is stored encrypted and only the last 4 digits are shown.
                </p>
              )}
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                Edit payout details
              </Button>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={(e) => void save(e)} autoComplete="off">
              <p className="text-sm text-slate-500">
                {configured
                  ? `Updating the account ending ${details.accountLast4}. Enter the full account number again. Changing it requires your password and a new admin verification if the account or IFSC changes.`
                  : "Add the account that should receive your parking earnings. We never show the full account number after it is saved."}
              </p>
              <Field label="Account holder name" id="accountHolder" error={errors.accountHolder}>
                <Input
                  id="accountHolder"
                  value={form.accountHolder}
                  onChange={(e) => update("accountHolder", e.target.value)}
                  autoComplete="name"
                  required
                  aria-invalid={Boolean(errors.accountHolder)}
                />
              </Field>
              <Field label="Bank name" id="bankName" error={errors.bankName}>
                <Input
                  id="bankName"
                  value={form.bankName}
                  onChange={(e) => update("bankName", e.target.value)}
                  autoComplete="organization"
                  required
                  aria-invalid={Boolean(errors.bankName)}
                />
              </Field>
              <Field label="Bank account number" id="accountNumber" error={errors.accountNumber}>
                <Input
                  id="accountNumber"
                  value={form.accountNumber}
                  onChange={(e) => update("accountNumber", e.target.value.replace(/\D/g, "").slice(0, 18))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={configured ? `Account ending ${details.accountLast4}` : "9 to 18 digits"}
                  required
                  aria-invalid={Boolean(errors.accountNumber)}
                />
              </Field>
              <Field label="Confirm account number" id="confirmAccountNumber" error={errors.confirmAccountNumber}>
                <Input
                  id="confirmAccountNumber"
                  value={form.confirmAccountNumber}
                  onChange={(e) => update("confirmAccountNumber", e.target.value.replace(/\D/g, "").slice(0, 18))}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  aria-invalid={Boolean(errors.confirmAccountNumber)}
                />
              </Field>
              <Field label="IFSC code" id="ifsc" error={errors.ifsc}>
                <Input
                  id="ifsc"
                  value={form.ifsc}
                  onChange={(e) => update("ifsc", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                  autoComplete="off"
                  maxLength={11}
                  required
                  aria-invalid={Boolean(errors.ifsc)}
                />
              </Field>
              {configured && (
                <Field label="Current password" id="currentPassword" error={errors.currentPassword}>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={form.currentPassword}
                    onChange={(e) => update("currentPassword", e.target.value)}
                    autoComplete="current-password"
                    required
                    aria-invalid={Boolean(errors.currentPassword)}
                  />
                </Field>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : configured ? "Save payout details" : "Save payout details"}
                </Button>
                {configured && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setErrors({});
                      setForm((current) => ({
                        ...current,
                        accountNumber: "",
                        confirmAccountNumber: "",
                        currentPassword: "",
                      }));
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F3F5F7] px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-[#111827]">{value}</dd>
    </div>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[#111827]" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
