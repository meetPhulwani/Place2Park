import * as React from "react";
import { Bike, Car, Plus, Trash2 } from "lucide-react";
import { api, errorMessage, fieldErrors } from "@/services/api";
import { useAuth } from "@/context/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, FieldError } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";

interface Vehicle {
  id: string;
  type: string;
  make: string | null;
  model: string | null;
  plate: string;
  isDefault: boolean;
}

interface ProfileData {
  user: { name: string | null; email: string; image: string | null; phone: string | null; role: string };
  profile: { preferredVehicleType: string; notifyEmail: boolean; notifyReminders: boolean };
  vehicles: Vehicle[];
}

export default function ProfilePage() {
  const { refresh } = useAuth();
  const [data, setData] = React.useState<ProfileData | null>(null);

  React.useEffect(() => {
    document.title = "Profile · Place2Park";
    api.get("/users/me/profile").then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, []);

  if (!data) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your account details and preferences. We only ask for what we need.
        </p>
      </div>
      <ProfileForm
        data={data}
        onSaved={(d) => {
          setData(d);
          void refresh();
        }}
      />
    </div>
  );
}

function ProfileForm({ data, onSaved }: { data: ProfileData; onSaved: (d: ProfileData) => void }) {
  const { user, profile, vehicles } = data;
  const [form, setForm] = React.useState({
    name: user.name ?? "",
    phone: user.phone ?? "",
    preferredVehicleType: profile.preferredVehicleType,
    notifyEmail: profile.notifyEmail,
    notifyReminders: profile.notifyReminders,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const [showVehicleForm, setShowVehicleForm] = React.useState(false);
  const [vehicleForm, setVehicleForm] = React.useState({ type: "CAR", make: "", model: "", plate: "" });
  const [vehicleBusy, setVehicleBusy] = React.useState(false);

  async function reload() {
    const { data: d } = await api.get("/users/me/profile");
    onSaved(d.data);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      await api.put("/users/me/profile", form);
      toast.success("Profile updated.");
      await reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, "Couldn't save your profile."));
    } finally {
      setSaving(false);
    }
  }

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault();
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
            <div>
              <p className="font-semibold text-slate-900">{user.name || "Unnamed"}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
              <Badge variant="outline" className="mt-1">
                {user.role === "BOTH" ? "Driver & Host" : user.role.toLowerCase()}
              </Badge>
            </div>
          </div>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="p-name">Full name</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
                <FieldError error={errors.name} />
              </div>
              <div>
                <Label htmlFor="p-phone" hint="(optional)">
                  Phone
                </Label>
                <Input
                  id="p-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                />
                <FieldError error={errors.phone} />
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
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700">Notifications</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Email me booking updates</span>
                <Switch
                  checked={form.notifyEmail}
                  onChange={(v) => setForm((f) => ({ ...f, notifyEmail: v }))}
                  label="Email notifications"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Remind me before bookings start</span>
                <Switch
                  checked={form.notifyReminders}
                  onChange={(v) => setForm((f) => ({ ...f, notifyReminders: v }))}
                  label="Booking reminders"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
            </div>
          </form>
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
                  />
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
