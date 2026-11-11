import * as React from "react";
import Link from "@/components/link";
import { AccountManagement } from "@/components/account-management";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useAuth, isHostRole } from "@/context/auth";
import { api, errorMessage, setToken } from "@/services/api";
import { cn } from "@/lib/utils";

type Section = "account" | "security" | "notifications" | "privacy" | "payments";

type Channel = {
  bookingConfirmed: boolean;
  bookingCancelled: boolean;
  bookingReminder: boolean;
  payment: boolean;
  refund: boolean;
  hostRequest: boolean;
  hostStatus: boolean;
  payout: boolean;
  promo: boolean;
  product: boolean;
};

type Settings = {
  role: string;
  status: string;
  joinedAt: string;
  hasPassword: boolean;
  googleConnected: boolean;
  notifications: { email: Channel; inApp: Channel };
  privacy: { showPublicHostName: boolean; marketingEmail: boolean };
  sessions: { description: string };
};

const LOCKED = new Set(["bookingConfirmed", "bookingCancelled", "payment", "refund"]);

const GROUPS: { title: string; items: { key: keyof Channel; label: string }[] }[] = [
  {
    title: "Booking notifications",
    items: [
      { key: "bookingConfirmed", label: "Booking confirmations" },
      { key: "bookingCancelled", label: "Booking cancellations" },
      { key: "bookingReminder", label: "Booking reminders" },
      { key: "hostRequest", label: "Host booking requests" },
      { key: "hostStatus", label: "Host booking status" },
    ],
  },
  {
    title: "Payment notifications",
    items: [
      { key: "payment", label: "Payment updates" },
      { key: "refund", label: "Refund updates" },
      { key: "payout", label: "Payout updates" },
    ],
  },
  {
    title: "Promotional notifications",
    items: [
      { key: "promo", label: "Promotional offers" },
      { key: "product", label: "Product announcements" },
    ],
  },
];

function roleLabel(role: string) {
  if (role === "HOST") return "Host";
  if (role === "BOTH") return "Driver and host";
  if (role === "ADMIN") return "Administrator";
  return "Driver";
}

function statusLabel(status: string) {
  if (status === "SUSPENDED") return "Suspended";
  if (status === "DELETION_PENDING") return "Deletion requested";
  if (status === "DELETED") return "Deleted";
  return "Active";
}

export default function AccountSettingsPage() {
  const { user, logout, refresh } = useAuth();
  const host = isHostRole(user?.role);
  const [section, setSection] = React.useState<Section>("account");
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [passwords, setPasswords] = React.useState({ current: "", next: "", confirm: "" });
  const [payout, setPayout] = React.useState<{ accountLast4?: string; verified?: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const sections: { id: Section; label: string }[] = [
    { id: "account", label: "Account" },
    { id: "security", label: "Security" },
    { id: "notifications", label: "Notifications" },
    { id: "privacy", label: "Privacy" },
    { id: "payments", label: "Payments" },
  ];

  React.useEffect(() => {
    document.title = "Settings · Place2Park";
    api.get("/account/settings").then(({ data }) => setSettings(data.data)).catch((err) => toast.error(errorMessage(err, "We couldn't load your settings.")));
  }, []);

  React.useEffect(() => {
    if (!host) return;
    api.get("/payout-details").then(({ data }) => setPayout(data.data.payoutDetails ?? null)).catch(() => setPayout(null));
  }, [host]);

  async function changePassword() {
    setBusy(true);
    try {
      const { data } = await api.post("/account/password", {
        currentPassword: passwords.current,
        newPassword: passwords.next,
        confirmPassword: passwords.confirm,
      });
      setToken(data.data.token);
      setPasswords({ current: "", next: "", confirm: "" });
      await refresh();
      toast.success("Password updated. Other devices have been signed out.");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't change your password."));
    } finally {
      setBusy(false);
    }
  }

  async function revokeAll() {
    setBusy(true);
    try {
      await api.post("/account/sessions/revoke", {});
      logout();
      toast.success("Every login has been signed out.");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't sign out your other sessions."));
    } finally {
      setBusy(false);
    }
  }

  async function saveNotifications(next: Settings["notifications"]) {
    setSettings((current) => current ? { ...current, notifications: next } : current);
    try {
      const { data } = await api.put("/account/notifications", next);
      setSettings((current) => current ? { ...current, notifications: data.data.notifications } : current);
      toast.success("Notification preferences saved.");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't save those preferences."));
    }
  }

  async function savePrivacy(next: Settings["privacy"]) {
    setBusy(true);
    try {
      const { data } = await api.put("/account/privacy", next);
      setSettings((current) => current ? { ...current, privacy: data.data.privacy, notifications: data.data.notifications } : current);
      toast.success("Privacy preferences saved.");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't save those preferences."));
    } finally {
      setBusy(false);
    }
  }

  async function downloadData() {
    setBusy(true);
    try {
      const { data } = await api.get("/account/export");
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "place2park-data.json";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Your data download is ready.");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't prepare your data."));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <p className="text-sm text-muted">Loading settings…</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Settings sections">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={cn(
              "rounded-xl px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors",
              section === item.id ? "bg-brand-500 text-white" : "bg-white text-ink hover:bg-page"
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 space-y-6">
        {section === "account" ? (
          <>
            <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <h1 className="font-display text-xl font-semibold text-ink">Account</h1>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">Status</dt>
                  <dd className="font-medium text-ink">{statusLabel(settings.status)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">Account type</dt>
                  <dd className="font-medium text-ink">{roleLabel(settings.role)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">Joined</dt>
                  <dd className="font-medium text-ink">{new Date(settings.joinedAt).toLocaleDateString()}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted">
                Name, email, phone, and your photo are edited on <Link href="/profile" className="font-medium text-brand-600">Profile</Link>.
              </p>
            </section>
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-700">Danger zone</h2>
              <AccountManagement />
            </div>
          </>
        ) : null}

        {section === "security" ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <h1 className="font-display text-xl font-semibold text-ink">Password</h1>
              {settings.hasPassword ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <Label htmlFor="current-password">Current password</Label>
                    <Input id="current-password" type="password" autoComplete="current-password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="new-password">New password</Label>
                    <Input id="new-password" type="password" autoComplete="new-password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input id="confirm-password" type="password" autoComplete="new-password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} />
                  </div>
                  <p className="text-xs text-muted">Use at least 8 characters with one uppercase letter, one number, and one special character.</p>
                  <Button disabled={busy} onClick={() => void changePassword()}>Change password</Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  This account uses Google. <Link href="/forgot-password" className="font-medium text-brand-600">Set a password</Link> if you also want email sign-in.
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <h2 className="font-display text-lg font-semibold text-ink">Active sessions</h2>
              <p className="mt-2 text-sm text-muted">{settings.sessions.description}</p>
              <p className="mt-2 text-sm text-muted">Google login: {settings.googleConnected ? "connected" : "not connected"}.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { logout(); toast.success("You have been signed out of this browser."); }}>Log out of this browser</Button>
                <Button variant="danger-outline" disabled={busy} onClick={() => void revokeAll()}>Log out of all devices</Button>
              </div>
            </div>
          </section>
        ) : null}

        {section === "notifications" ? (
          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <h1 className="font-display text-xl font-semibold text-ink">Notifications</h1>
            <p className="mt-1 text-sm text-muted">Each row has email on the left and in-app on the right. Required booking, payment, refund, and security notices stay on.</p>
            <div className="mt-4 rounded-xl border border-line bg-page px-4 py-3 text-sm text-ink">
              Security and support notices stay on. They cover account access and support replies.
            </div>
            {GROUPS.map((group) => (
              <div key={group.title} className="mt-6">
                <h2 className="text-sm font-semibold text-ink">{group.title}</h2>
                <div className="mt-2 space-y-1">
                  {group.items.map((item) => (
                    <div key={item.key} className="grid items-center gap-3 border-t border-line py-3 sm:grid-cols-[1fr_auto_auto]">
                      <span className="text-sm text-ink">{item.label}{LOCKED.has(item.key) ? " · required" : ""}</span>
                      <Switch
                        label={`${item.label} email`}
                        disabled={LOCKED.has(item.key)}
                        checked={settings.notifications.email[item.key]}
                        onChange={(value) => void saveNotifications({ ...settings.notifications, email: { ...settings.notifications.email, [item.key]: value } })}
                      />
                      <Switch
                        label={`${item.label} in app`}
                        disabled={LOCKED.has(item.key)}
                        checked={settings.notifications.inApp[item.key]}
                        onChange={(value) => void saveNotifications({ ...settings.notifications, inApp: { ...settings.notifications.inApp, [item.key]: value } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {section === "privacy" ? (
          <section className="space-y-4 rounded-2xl border border-line bg-white p-5 shadow-card">
            <h1 className="font-display text-xl font-semibold text-ink">Privacy</h1>
            {host ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-ink">Show my name on listings</span>
                <Switch label="Show host name" checked={settings.privacy.showPublicHostName} onChange={(value) => void savePrivacy({ ...settings.privacy, showPublicHostName: value })} />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink">Marketing email</span>
              <Switch label="Marketing email" checked={settings.privacy.marketingEmail} onChange={(value) => void savePrivacy({ ...settings.privacy, marketingEmail: value })} />
            </div>
            <p className="text-sm text-muted">A download contains only your account, vehicles, favorites, bookings, payments, and payout status.</p>
            <Button variant="secondary" disabled={busy} onClick={() => void downloadData()}>Download my data</Button>
            <p className="text-sm">
              <Link href="/privacy" className="font-medium text-brand-600">Privacy policy</Link>
            </p>
            <p className="text-sm">
              <Link href="/terms" className="font-medium text-brand-600">Terms and conditions</Link>
            </p>
          </section>
        ) : null}

        {section === "payments" ? (
          <section className="space-y-4 rounded-2xl border border-line bg-white p-5 shadow-card">
            <h1 className="font-display text-xl font-semibold text-ink">Payments</h1>
            <p className="text-sm text-muted">Card numbers are entered at checkout and are not saved by Place2Park.</p>
            <p className="text-sm"><Link href="/payments" className="font-medium text-brand-600">Payment history</Link></p>
            <p className="text-sm"><Link href="/bookings" className="font-medium text-brand-600">Booking receipts</Link></p>
            {host ? (
              <div className="border-t border-line pt-4">
                <p className="text-sm text-ink">Payout account ending {payout?.accountLast4 || "—"}. Verification: {payout?.verified ? "verified" : "not verified"}.</p>
                <p className="mt-2 text-sm"><Link href="/profile#bank-details" className="font-medium text-brand-600">Payout settings</Link></p>
                <p className="mt-1 text-sm"><Link href="/host/earnings" className="font-medium text-brand-600">Payout history</Link></p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
