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

type Section = "account" | "security" | "notifications" | "privacy" | "payments" | "host";

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
  name: string;
  email: string;
  phone: string;
  image: string;
  role: string;
  joinedAt: string;
  hasPassword: boolean;
  googleConnected: boolean;
  notifications: { email: Channel; inApp: Channel };
  privacy: { showPublicHostName: boolean; marketingEmail: boolean };
  sessions: { description: string };
};

const LOCKED = new Set(["bookingConfirmed", "bookingCancelled", "payment", "refund"]);
const TOGGLES: { key: keyof Channel; label: string }[] = [
  { key: "bookingConfirmed", label: "Booking confirmations" },
  { key: "bookingCancelled", label: "Booking cancellations" },
  { key: "bookingReminder", label: "Booking reminders" },
  { key: "payment", label: "Payment updates" },
  { key: "refund", label: "Refund updates" },
  { key: "hostRequest", label: "Host booking requests" },
  { key: "hostStatus", label: "Host booking status updates" },
  { key: "payout", label: "Payout updates" },
  { key: "promo", label: "Promotional offers" },
  { key: "product", label: "Product announcements" },
];

function roleLabel(role: string) {
  if (role === "HOST") return "Host";
  if (role === "BOTH") return "Driver and host";
  if (role === "ADMIN") return "Administrator";
  return "Driver";
}

export default function AccountSettingsPage() {
  const { user, logout, refresh } = useAuth();
  const host = isHostRole(user?.role);
  const [section, setSection] = React.useState<Section>("account");
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pending, setPending] = React.useState<{ kind: "email" | "phone"; token: string } | null>(null);
  const [otp, setOtp] = React.useState("");
  const [passwords, setPasswords] = React.useState({ current: "", next: "", confirm: "" });
  const [payout, setPayout] = React.useState<{ accountLast4?: string; verified?: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const sections: { id: Section; label: string }[] = [
    { id: "account", label: "Account" },
    { id: "security", label: "Security" },
    { id: "notifications", label: "Notifications" },
    { id: "privacy", label: "Privacy" },
    { id: "payments", label: "Payments" },
    ...(host ? [{ id: "host" as const, label: "Host" }] : []),
  ];

  React.useEffect(() => {
    document.title = "Settings · Place2Park";
    api.get("/account/settings").then(({ data }) => {
      setSettings(data.data);
      setName(data.data.name);
      setEmail(data.data.email);
      setPhone(data.data.phone ?? "");
    }).catch((err) => toast.error(errorMessage(err, "We couldn't load your settings.")));
  }, []);

  React.useEffect(() => {
    if (!host) return;
    api.get("/payout-details").then(({ data }) => setPayout(data.data.payoutDetails ?? null)).catch(() => setPayout(null));
  }, [host]);

  async function saveName() {
    setBusy(true);
    try {
      const { data } = await api.patch("/account/name", { name });
      setSettings((current) => current ? { ...current, name: data.data.name } : current);
      await refresh();
      toast.success("Name updated.");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't update your name."));
    } finally {
      setBusy(false);
    }
  }

  async function startEmail() {
    setBusy(true);
    try {
      const { data } = await api.post("/account/email/request", { email });
      setPending({ kind: "email", token: data.data.pendingToken });
      setOtp("");
      toast.success(`Code sent to ${data.data.maskedEmail}.`);
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't start that email change."));
    } finally {
      setBusy(false);
    }
  }

  async function startPhone() {
    setBusy(true);
    try {
      const { data } = await api.post("/account/phone/request", { phone });
      setPending({ kind: "phone", token: data.data.pendingToken });
      setOtp("");
      toast.success(`Code sent to ${data.data.maskedEmail}.`);
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't start that phone change."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    if (!pending) return;
    setBusy(true);
    try {
      const path = pending.kind === "email" ? "/account/email/confirm" : "/account/phone/confirm";
      const { data } = await api.post(path, { pendingToken: pending.token, otp });
      setSettings((current) => current ? { ...current, ...data.data } : current);
      if (data.data.email) setEmail(data.data.email);
      if (data.data.phone) setPhone(data.data.phone);
      setPending(null);
      setOtp("");
      await refresh();
      toast.success(pending.kind === "email" ? "Email updated." : "Phone number updated.");
    } catch (err) {
      toast.error(errorMessage(err, "That code could not be confirmed."));
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    const body = new FormData();
    body.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post("/account/photo", body);
      setSettings((current) => current ? { ...current, image: data.data.image } : current);
      await refresh();
      toast.success("Profile photo updated.");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't store that photo."));
    } finally {
      setBusy(false);
    }
  }

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

      <div className="space-y-6">
        {section === "account" ? (
          <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
            <h1 className="font-display text-xl font-semibold text-ink">Account</h1>
            <div className="flex items-center gap-4">
              <div className="size-16 overflow-hidden rounded-full bg-page">
                {settings.image ? <img src={settings.image} alt="" className="size-full object-cover" /> : null}
              </div>
              <label className="text-sm font-medium text-brand-700">
                Change photo
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }} />
              </label>
            </div>
            <div>
              <Label htmlFor="account-name">Full name</Label>
              <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <Button onClick={() => void saveName()} disabled={busy}>Save name</Button>
            <div>
              <Label htmlFor="account-email">Email</Label>
              <Input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <Button className="mt-2" variant="secondary" disabled={busy} onClick={() => void startEmail()}>Send verification code</Button>
            </div>
            <div>
              <Label htmlFor="account-phone">Phone</Label>
              <Input id="account-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
              <p className="mt-1 text-xs text-muted">A code is emailed to your current address. Place2Park does not send SMS codes.</p>
              <Button className="mt-2" variant="secondary" disabled={busy} onClick={() => void startPhone()}>Send phone code</Button>
            </div>
            {pending ? (
              <div>
                <Label htmlFor="account-otp">Verification code</Label>
                <Input id="account-otp" inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} />
                <Button className="mt-2" disabled={busy || otp.length !== 6} onClick={() => void confirmCode()}>Confirm code</Button>
              </div>
            ) : null}
            <p className="text-sm text-muted">Account type: {roleLabel(settings.role)}. This cannot be changed here.</p>
            <p className="text-sm text-muted">Joined {new Date(settings.joinedAt).toLocaleDateString()}.</p>
          </section>
        ) : null}

        {section === "security" ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-line bg-white p-5">
              <h1 className="font-display text-xl font-semibold text-ink">Password</h1>
              {settings.hasPassword ? (
                <div className="mt-4 space-y-3">
                  <div><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" autoComplete="current-password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} /></div>
                  <div><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} /></div>
                  <div><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} /></div>
                  <p className="text-xs text-muted">Use at least 8 characters with one uppercase letter, one number, and one special character.</p>
                  <Button disabled={busy} onClick={() => void changePassword()}>Change password</Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">This account uses Google. <Link href="/forgot-password" className="font-medium text-brand-600">Set a password</Link> if you also want email sign-in.</p>
              )}
            </div>
            <div className="rounded-2xl border border-line bg-white p-5">
              <h2 className="font-display text-lg font-semibold text-ink">Sessions</h2>
              <p className="mt-2 text-sm text-muted">{settings.sessions.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { logout(); toast.success("You have been signed out of this browser."); }}>Log out of this browser</Button>
                <Button variant="danger-outline" disabled={busy} onClick={() => void revokeAll()}>Log out of all devices</Button>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5">
              <h2 className="font-display text-lg font-semibold text-ink">Login security</h2>
              <p className="mt-2 text-sm text-muted">Google login: {settings.googleConnected ? "connected" : "not connected"}.</p>
              <p className="mt-2 text-sm text-muted">If you lose access, use the password recovery link. It emails a reset link to the address on this account and does not reveal whether an account exists.</p>
            </div>
          </section>
        ) : null}

        {section === "notifications" ? (
          <section className="rounded-2xl border border-line bg-white p-5">
            <h1 className="font-display text-xl font-semibold text-ink">Notifications</h1>
            <p className="mt-1 text-sm text-muted">Booking, payment, refund, and support notices stay on. Other messages can be turned off separately for email and in the app.</p>
            <div className="mt-4 space-y-3">
              {TOGGLES.map((item) => (
                <div key={item.key} className="grid items-center gap-3 border-t border-line py-3 sm:grid-cols-[1fr_auto_auto]">
                  <span className="text-sm text-ink">{item.label}{LOCKED.has(item.key) ? " · required" : ""}</span>
                  <Switch label={`${item.label} email`} disabled={LOCKED.has(item.key)} checked={settings.notifications.email[item.key]} onChange={(value) => void saveNotifications({ ...settings.notifications, email: { ...settings.notifications.email, [item.key]: value } })} />
                  <Switch label={`${item.label} in app`} disabled={LOCKED.has(item.key)} checked={settings.notifications.inApp[item.key]} onChange={(value) => void saveNotifications({ ...settings.notifications, inApp: { ...settings.notifications.inApp, [item.key]: value } })} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "privacy" ? (
          <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
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
            <p className="text-sm text-muted">Place2Park stores the details needed to run bookings and payouts. A download contains only your account, vehicles, favorites, bookings, payments, and payout status. It never includes another person's contact details, a password, or a full bank account number.</p>
            <Button variant="secondary" disabled={busy} onClick={() => void downloadData()}>Download my data</Button>
            <p className="text-sm text-muted">
              Questions about your data go through the <Link href="/faqs" className="font-medium text-brand-600">Help Center</Link> and <Link href="/support" className="font-medium text-brand-600">Support</Link>. Separate privacy-policy and terms pages are not published in the app.
            </p>
          </section>
        ) : null}

        {section === "payments" ? (
          <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
            <h1 className="font-display text-xl font-semibold text-ink">Payments</h1>
            <p className="text-sm text-muted">Card numbers are entered at Razorpay checkout and are not saved by Place2Park. There is no stored-card list to show.</p>
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

        {section === "host" && host ? (
          <section className="space-y-3 rounded-2xl border border-line bg-white p-5">
            <h1 className="font-display text-xl font-semibold text-ink">Host preferences</h1>
            <p className="text-sm text-muted">Listing, calendar, and payout tools stay on their existing pages.</p>
            <p className="text-sm"><Link href="/host" className="font-medium text-brand-600">Host profile</Link></p>
            <p className="text-sm"><Link href="/host/listings" className="font-medium text-brand-600">Listing preferences</Link></p>
            <p className="text-sm"><Link href="/host/calendar" className="font-medium text-brand-600">Availability</Link></p>
            <p className="text-sm"><Link href="/profile#bank-details" className="font-medium text-brand-600">Payout settings</Link></p>
          </section>
        ) : null}

        <AccountManagement />
      </div>
    </div>
  );
}
