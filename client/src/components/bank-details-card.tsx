import * as React from "react";
import { Landmark } from "lucide-react";
import Link from "@/components/link";
import { api, errorMessage, fieldErrors } from "@/services/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";

interface PayoutDetails {
  submitted: boolean;
  configured: boolean;
  verified: boolean;
  hasPassword?: boolean;
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

function maskedAccount(last4: string) {
  return /^\d{4}$/.test(last4) ? `XXXXXX${last4}` : "—";
}

export function BankDetailsCard({
  onSaved,
  embedded = false,
}: {
  onSaved?: (details: PayoutDetails) => void;
  embedded?: boolean;
} = {}) {
  const [details, setDetails] = React.useState<PayoutDetails | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
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
        setEditing(false);
        if (window.location.hash === "#bank-details") {
          document.getElementById("bank-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load bank details.")));
  }, []);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const changingAccount = !details?.configured || form.accountNumber.length > 0 || form.confirmAccountNumber.length > 0;
    const nextErrors: Record<string, string> = {};
    if (changingAccount && form.accountNumber !== form.confirmAccountNumber) {
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
        ...(changingAccount
          ? { accountNumber: form.accountNumber, confirmAccountNumber: form.confirmAccountNumber }
          : {}),
        ...(details?.configured ? { currentPassword: form.currentPassword } : {}),
      };
      const response = details?.configured
        ? await api.patch("/payout-details", payload)
        : await api.post("/payout-details", payload);
      const next = response.data.data.payoutDetails as PayoutDetails;
      setDetails({ ...next, hasPassword: details?.hasPassword ?? next.hasPassword });
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
      onSaved?.(next);
      toast.success(next.verified ? "Bank details saved." : "Bank details saved. An admin will verify them before a payout.");
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const fields = fieldErrors(err);
      if (status === 401) fields.currentPassword = errorMessage(err, "Enter your current password to change bank details.");
      setErrors(fields);
      toast.error(errorMessage(err, "Could not save bank details."));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = !details?.configured
    ? "Not added"
    : details.verified
      ? "Verified"
      : "Awaiting verification";

  const heading = (
    <div className="flex w-full min-w-0 items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-ink">
        <Landmark className="size-5 shrink-0 text-[#0251B0]" aria-hidden />
        <span className="min-w-0">Bank Details</span>
      </h2>
      {details && (
        <Badge className="shrink-0" variant={details.verified ? "success" : details.configured ? "warning" : "outline"}>{statusLabel}</Badge>
      )}
    </div>
  );

  const body = (
    <div className="min-w-0 space-y-4">
        {!details && !loadError && <Skeleton className="h-28 rounded-xl" />}
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {details && !details.configured && !editing && (
          <div className="space-y-3">
            <p className="min-w-0 text-sm break-words text-slate-500">
              Add your bank details to receive your parking earnings. You can use Place2Park without them.
            </p>
            <Button type="button" className="w-full sm:w-auto" onClick={() => setEditing(true)}>
              Add Bank Details
            </Button>
          </div>
        )}
        {details && details.configured && !editing && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Account holder" value={details.accountHolder || "—"} />
              <Detail label="Bank" value={details.bankName || "—"} />
              <Detail label="IFSC" value={details.ifsc || "—"} />
              <Detail label="Account number" value={maskedAccount(details.accountLast4)} />
            </dl>
            {saved && (
              <p className="rounded-xl bg-[#F3F5F7] px-3 py-2 text-sm text-[#111827]" role="status">
                Bank details saved. The account number stays encrypted.
              </p>
            )}
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setEditing(true)}>
              Edit Bank Details
            </Button>
          </div>
        )}
        {details && editing && details.configured && details.hasPassword === false && (
          <div className="space-y-3 rounded-xl bg-[#F3F5F7] p-4">
            <p className="text-sm text-[#111827]">
              Set a password before changing bank details. Google sign-in does not include one.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/forgot-password">
                <Button type="button">Set a password</Button>
              </Link>
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {details && editing && !(details.configured && details.hasPassword === false) && (
          <form className="space-y-3" onSubmit={(e) => void save(e)} autoComplete="off">
            <Field label="Account holder name" id="bank-accountHolder" error={errors.accountHolder}>
              <Input
                id="bank-accountHolder"
                value={form.accountHolder}
                onChange={(e) => update("accountHolder", e.target.value)}
                autoComplete="name"
                required
                aria-invalid={Boolean(errors.accountHolder)}
              />
            </Field>
            <Field label="Bank name" id="bank-bankName" error={errors.bankName}>
              <Input
                id="bank-bankName"
                value={form.bankName}
                onChange={(e) => update("bankName", e.target.value)}
                autoComplete="organization"
                required
                aria-invalid={Boolean(errors.bankName)}
              />
            </Field>
            <Field label="Bank account number" id="bank-accountNumber" error={errors.accountNumber}>
              <Input
                id="bank-accountNumber"
                value={form.accountNumber}
                onChange={(e) => update("accountNumber", e.target.value.replace(/\D/g, "").slice(0, 18))}
                inputMode="numeric"
                autoComplete="off"
                placeholder={details.configured ? `Leave blank to keep ${maskedAccount(details.accountLast4)}` : "9 to 18 digits"}
                required={!details.configured}
                aria-invalid={Boolean(errors.accountNumber)}
              />
            </Field>
            {(!details.configured || form.accountNumber.length > 0 || form.confirmAccountNumber.length > 0) && (
              <Field label="Confirm bank account number" id="bank-confirmAccountNumber" error={errors.confirmAccountNumber}>
                <Input
                  id="bank-confirmAccountNumber"
                  value={form.confirmAccountNumber}
                  onChange={(e) => update("confirmAccountNumber", e.target.value.replace(/\D/g, "").slice(0, 18))}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  aria-invalid={Boolean(errors.confirmAccountNumber)}
                />
              </Field>
            )}
            <Field label="IFSC code" id="bank-ifsc" error={errors.ifsc}>
              <Input
                id="bank-ifsc"
                value={form.ifsc}
                onChange={(e) => update("ifsc", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                autoComplete="off"
                maxLength={11}
                required
                aria-invalid={Boolean(errors.ifsc)}
              />
            </Field>
            {details.configured && (
              <Field label="Current password" id="bank-currentPassword" error={errors.currentPassword}>
                <Input
                  id="bank-currentPassword"
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
                {busy ? "Saving…" : "Save bank details"}
              </Button>
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
            </div>
          </form>
        )}
    </div>
  );

  if (embedded) {
    return (
      <section id="bank-details" className="box-border w-full min-w-0 max-w-full scroll-mt-24">
        <div className="h-1 w-10 rounded-full bg-[#D1FF42]" aria-hidden />
        <div className="mt-3">{heading}</div>
        <div className="mt-4">{body}</div>
      </section>
    );
  }

  return (
    <Card id="bank-details" className="box-border w-full min-w-0 max-w-full overflow-hidden scroll-mt-24">
      <div className="h-1.5 w-full bg-[#D1FF42]" aria-hidden />
      <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-3">
        {heading}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export function BankDetailsReminder() {
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    api
      .get("/payout-details")
      .then(({ data }) => setMissing(!data.data.payoutDetails?.configured))
      .catch(() => setMissing(false));
  }, []);

  if (!missing) return null;

  return (
    <div className="rounded-2xl border border-[#C7D1DD] bg-white p-4 shadow-card">
      <p className="text-sm font-semibold text-[#111827]">Add your bank details in Settings to receive your parking earnings.</p>
      <Link href="/settings#bank-details" className="mt-2 inline-block text-sm font-medium text-[#0251B0]">
        Add Bank Details
      </Link>
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
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
