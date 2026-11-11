import * as React from "react";
import { Bike, Car, Plus, Trash2 } from "lucide-react";
import { api, errorMessage, fieldErrors } from "@/services/api";
import { isHostRole, useAuth } from "@/context/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, FieldError } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { BankDetailsCard } from "@/components/bank-details-card";

interface Vehicle {
  id: string;
  type: string;
  make: string | null;
  model: string | null;
  plate: string;
  isDefault: boolean;
}

interface ProfileData {
  user: { name: string | null; email: string; image: string | null; phone: string | null; role: string; createdAt?: string };
  profile: { preferredVehicleType: string; notifyEmail: boolean; notifyReminders: boolean };
  vehicles: Vehicle[];
}

function roleLabel(role: string) {
  if (role === "HOST") return "Host";
  if (role === "BOTH") return "Driver and host";
  if (role === "ADMIN") return "Administrator";
  return "Driver";
}

export default function ProfilePage() {
  const { refresh, user: sessionUser } = useAuth();
  const [data, setData] = React.useState<ProfileData | null>(null);

  React.useEffect(() => {
    document.title = "Profile · Place2Park";
    api.get("/users/me/profile").then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, []);

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your photo, name, email, and phone. Account preferences live in Settings.
        </p>
      </div>
      {!data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <ProfileForm
          data={data}
          onSaved={(d) => {
            setData(d);
            void refresh();
          }}
        />
      )}
      {isHostRole(sessionUser?.role) && <BankDetailsCard />}
    </div>
  );
}

function profilePhoneError(phone: string) {
  if (!phone.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  let local = digits;
  if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) local = digits.slice(1);
  return /^[6-9]\d{9}$/.test(local) ? null : "Enter a valid 10-digit mobile number.";
}

function ProfileForm({ data, onSaved }: { data: ProfileData; onSaved: (d: ProfileData) => void }) {
  const { refresh } = useAuth();
  const { user, profile, vehicles } = data;
  const [form, setForm] = React.useState({
    name: user.name ?? "",
    preferredVehicleType: profile.preferredVehicleType,
  });
  const [email, setEmail] = React.useState(user.email);
  const [phone, setPhone] = React.useState(user.phone ?? "");
  const [pending, setPending] = React.useState<{ kind: "email" | "phone"; token: string } | null>(null);
  const [otp, setOtp] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setForm({ name: user.name ?? "", preferredVehicleType: profile.preferredVehicleType });
    setEmail(user.email);
    setPhone(user.phone ?? "");
  }, [user.name, user.email, user.phone, profile.preferredVehicleType]);

  const [showVehicleForm, setShowVehicleForm] = React.useState(false);
  const [vehicleForm, setVehicleForm] = React.useState({ type: "CAR", make: "", model: "", plate: "" });
  const [vehicleBusy, setVehicleBusy] = React.useState(false);

  async function reload() {
    const { data: d } = await api.get("/users/me/profile");
    onSaved(d.data);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2 || form.name.trim().length > 80) next.name = "Enter your name.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.put("/users/me/profile", {
        name: form.name,
        phone: user.phone ?? "",
        preferredVehicleType: form.preferredVehicleType,
        notifyEmail: profile.notifyEmail,
        notifyReminders: profile.notifyReminders,
      });
      toast.success("Profile updated.");
      await reload();
      await refresh();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, "Couldn't save your profile."));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    const body = new FormData();
    body.append("file", file);
    setSaving(true);
    try {
      await api.post("/account/photo", body);
      toast.success("Profile photo updated.");
      await reload();
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't store that photo."));
    } finally {
      setSaving(false);
    }
  }

  async function startChange(kind: "email" | "phone") {
    if (kind === "phone") {
      const phoneError = profilePhoneError(phone);
      if (phoneError) {
        setErrors({ phone: phoneError });
        return;
      }
    }
    setSaving(true);
    try {
      const path = kind === "email" ? "/account/email/request" : "/account/phone/request";
      const payload = kind === "email" ? { email } : { phone };
      const { data: result } = await api.post(path, payload);
      setPending({ kind, token: result.data.pendingToken });
      setOtp("");
      setErrors({});
      toast.success(`Code sent to ${result.data.maskedEmail}.`);
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't send that code."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmCode() {
    if (!pending) return;
    setSaving(true);
    try {
      const path = pending.kind === "email" ? "/account/email/confirm" : "/account/phone/confirm";
      await api.post(path, { pendingToken: pending.token, otp });
      setPending(null);
      setOtp("");
      toast.success(pending.kind === "email" ? "Email updated." : "Phone number updated.");
      await reload();
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "That code could not be confirmed."));
    } finally {
      setSaving(false);
    }
  }

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault();
    const plate = vehicleForm.plate.trim();
    if (plate.length < 4 || plate.length > 15) {
      setErrors({ plate: "Enter the vehicle number." });
      return;
    }
    if (vehicleForm.make.trim().length > 40 || vehicleForm.model.trim().length > 40) {
      setErrors({ plate: "Make and model must be 40 characters or fewer." });
      return;
    }
    setErrors({});
    setVehicleBusy(true);
    try {
      await api.post("/users/me/vehicles", vehicleForm);
      setShowVehicleForm(false);
      setVehicleForm({ type: "CAR", make: "", model: "", plate: "" });
      toast.success("Vehicle added.");
      await reload();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't add vehicle."));
    } finally {
      setVehicleBusy(false);
    }
  }

  async function deleteVehicle(id: string) {
    try {
      await api.delete(`/users/me/vehicles/${id}`);
      toast.success("Vehicle removed.");
      await reload();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove vehicle."));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={user.name} image={user.image} size={56} />
            <label className="text-sm font-medium text-brand-600">
              Change photo
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }}
              />
            </label>
          </div>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="p-name">Full name</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  maxLength={80}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
                <FieldError error={errors.name} />
              </div>
              <div>
                <Label htmlFor="p-vehicle">Preferred vehicle</Label>
                <Select
                  id="p-vehicle"
                  value={form.preferredVehicleType}
                  onChange={(e) => setForm((f) => ({ ...f, preferredVehicleType: e.target.value }))}
                >
                  <option value="CAR">Car</option>
                  <option value="BIKE">Bike / scooter</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                Save name
              </Button>
            </div>
          </form>
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div>
              <Label htmlFor="p-email">Email</Label>
              <Input id="p-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <Button className="mt-2" type="button" variant="secondary" disabled={saving} onClick={() => void startChange("email")}>
                Send email code
              </Button>
            </div>
            <div>
              <Label htmlFor="p-phone">Phone</Label>
              <Input id="p-phone" type="tel" maxLength={16} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" />
              <FieldError error={errors.phone} />
              <p className="mt-1 text-xs text-slate-500">A code is emailed to your current address. Place2Park does not send SMS codes.</p>
              <Button className="mt-2" type="button" variant="secondary" disabled={saving} onClick={() => void startChange("phone")}>
                Send phone code
              </Button>
            </div>
            {pending ? (
              <div>
                <Label htmlFor="p-otp">Verification code</Label>
                <Input id="p-otp" inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} />
                <Button className="mt-2" type="button" disabled={saving || otp.length !== 6} onClick={() => void confirmCode()}>
                  Confirm code
                </Button>
              </div>
            ) : null}
            <p className="text-sm text-slate-500">Account type: {roleLabel(user.role)}. This cannot be changed here.</p>
            <p className="text-sm text-slate-500">
              Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Vehicles</CardTitle>
          {!showVehicleForm && (
            <Button variant="secondary" size="sm" onClick={() => setShowVehicleForm(true)}>
              <Plus className="size-4" aria-hidden />
              Add vehicle
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {vehicles.length === 0 && !showVehicleForm && (
            <p className="text-sm text-slate-500">
              Add your vehicle so bookings pre-fill your vehicle number.
            </p>
          )}
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {v.type === "CAR" ? (
                  <Car className="size-5 text-slate-400" aria-hidden />
                ) : (
                  <Bike className="size-5 text-slate-400" aria-hidden />
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {v.plate}
                    {v.isDefault && <Badge variant="brand" className="ml-2">Default</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[v.make, v.model].filter(Boolean).join(" ") || (v.type === "CAR" ? "Car" : "Bike")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => deleteVehicle(v.id)}
                aria-label={`Remove vehicle ${v.plate}`}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {showVehicleForm && (
            <form onSubmit={saveVehicle} className="space-y-3 rounded-xl bg-slate-50 p-4 animate-fade-in">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="v-type">Type</Label>
                  <Select
                    id="v-type"
                    value={vehicleForm.type}
                    onChange={(e) => setVehicleForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="CAR">Car</option>
                    <option value="BIKE">Bike / scooter</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="v-plate">Vehicle number</Label>
                  <Input
                    id="v-plate"
                    required
                    value={vehicleForm.plate}
                    onChange={(e) =>
                      setVehicleForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))
                    }
                    placeholder="MH02AB1234"
                    maxLength={15}
                  />
                  <FieldError error={errors.plate} />
                </div>
                <div>
                  <Label htmlFor="v-make" hint="(optional)">Make</Label>
                  <Input
                    id="v-make"
                    value={vehicleForm.make}
                    onChange={(e) => setVehicleForm((f) => ({ ...f, make: e.target.value }))}
                    placeholder="Hyundai"
                  />
                </div>
                <div>
                  <Label htmlFor="v-model" hint="(optional)">Model</Label>
                  <Input
                    id="v-model"
                    value={vehicleForm.model}
                    onChange={(e) => setVehicleForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="i20"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowVehicleForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={vehicleBusy}>
                  Save vehicle
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
