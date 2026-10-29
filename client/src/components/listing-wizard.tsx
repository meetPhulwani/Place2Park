import * as React from "react";
import Image from "@/components/image";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ImagePlus, Trash2, Upload, X,
} from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { LocationPicker, isValidPickedLocation } from "@/components/map/location-picker";
import { ParkingCard } from "@/components/parking-card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldError } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { PriceBreakdown } from "@/components/price-breakdown";
import {
  ALLOWED_DURATIONS_MINS, COMMON_RULES, LEVELS, LEVEL_LABELS,
  PLATFORM_FEE_PCT, PROPERTY_TYPES, PROPERTY_TYPE_LABELS, SERVICE_FEE_PCT,
} from "@/lib/constants";
import { cn, formatDuration, formatINR } from "@/lib/utils";
import type { SpaceSummary } from "@/types";

const STEPS = [
  "Location", "Details", "Photos", "Pricing", "Availability", "Rules", "Preview",
] as const;
const DRAFT_KEY = "parkly.listing.draft";

export interface WizardData {
  title: string;
  description: string;
  propertyType: string;
  spaceType: string;
  covered: boolean;
  level: string;
  vehicleTypes: string[];
  evCharging: boolean;
  cctv: boolean;
  securityGuard: boolean;
  gated: boolean;
  lengthFt: string;
  widthFt: string;
  heightFt: string;
  address: string;
  formattedAddress: string;
  locality: string;
  sublocality: string;
  area: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  placeId: string;
  accessInstructions: string;
  vehicleSizeNotes: string;
  overnightAllowed: boolean;
  selfParkingConfirmed: boolean;
  blockedDates: string[];
  rules: string[];
  priceRupees: string;
  minDurationMins: number;
  maxDurationMins: number;
  images: { url: string; alt: string; publicId?: string }[];
  open247: boolean;
  days: { day: number; enabled: boolean; start: string; end: string }[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function defaultWizardData(): WizardData {
  return {
    title: "",
    description: "",
    propertyType: "INDIVIDUAL",
    spaceType: "PRIVATE",
    covered: false,
    level: "GROUND",
    vehicleTypes: ["CAR"],
    evCharging: false,
    cctv: false,
    securityGuard: false,
    gated: false,
    lengthFt: "",
    widthFt: "",
    heightFt: "",
    address: "",
    formattedAddress: "",
    locality: "",
    sublocality: "",
    area: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
    postalCode: "",
    latitude: "",
    longitude: "",
    placeId: "",
    accessInstructions: "",
    vehicleSizeNotes: "",
    overnightAllowed: false,
    selfParkingConfirmed: false,
    blockedDates: [],
    rules: [COMMON_RULES[0]],
    priceRupees: "50",
    minDurationMins: 60,
    maxDurationMins: 1440,
    images: [],
    open247: true,
    days: DAY_NAMES.map((_, i) => ({ day: i, enabled: true, start: "08:00", end: "22:00" })),
  };
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function ListingWizard({
  initial,
  spaceId,
  initialStatus,
}: {
  initial?: WizardData;
  spaceId?: string;
  initialStatus?: string;
}) {
  const navigate = useNavigate();
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState<WizardData>(initial ?? defaultWizardData());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [blockDate, setBlockDate] = React.useState("");
  const set = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }));

  React.useEffect(() => {
    if (initial || spaceId) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setData({ ...defaultWizardData(), ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, [initial, spaceId]);

  React.useEffect(() => {
    if (spaceId) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      } catch {
        /* ignore */
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [data, spaceId]);

  const lat = parseFloat(data.latitude);
  const lng = parseFloat(data.longitude);
  const hasCoords = !isNaN(lat) && !isNaN(lng);

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!isValidPickedLocation(data))
        return "Search or pin your parking location on the map.";
    }
    if (s === 1) {
      if (data.title.trim().length < 8) return "Give the listing a descriptive title (8+ characters).";
      if (data.vehicleTypes.length === 0) return "Pick at least one vehicle type.";
    }
    if (s === 3) {
      const p = Number(data.priceRupees);
      if (!p || p < 10 || p > 1000) return "Set an hourly price between ₹10 and ₹1,000.";
      if (data.minDurationMins > data.maxDurationMins)
        return "Minimum duration can't exceed maximum duration.";
    }
    if (s === 4 && !data.open247 && !data.days.some((d) => d.enabled))
      return "Enable at least one day, or switch to 24/7.";
    if (s === 5 && !data.selfParkingConfirmed)
      return "Confirm that drivers park their own vehicles and you will not request keys.";
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function buildPayload() {
    return {
      title: data.title,
      description: data.description,
      propertyType: data.propertyType,
      spaceType: data.spaceType,
      covered: data.covered,
      level: data.level,
      vehicleTypes: data.vehicleTypes,
      evCharging: data.evCharging,
      cctv: data.cctv,
      securityGuard: data.securityGuard,
      gated: data.gated,
      lengthFt: data.lengthFt ? Number(data.lengthFt) : null,
      widthFt: data.widthFt ? Number(data.widthFt) : null,
      heightFt: data.heightFt ? Number(data.heightFt) : null,
      address: data.address,
      formattedAddress: data.formattedAddress || data.address,
      locality: data.locality || data.city,
      sublocality: data.sublocality,
      area: data.area,
      city: data.city,
      district: data.district,
      state: data.state,
      pincode: data.pincode || data.postalCode,
      postalCode: data.postalCode || data.pincode,
      latitude: lat,
      longitude: lng,
      placeId: data.placeId,
      accessInstructions: data.accessInstructions,
      vehicleSizeNotes: data.vehicleSizeNotes,
      overnightAllowed: data.overnightAllowed,
      selfParkingConfirmed: data.selfParkingConfirmed,
      blockedDates: data.blockedDates,
      rules: data.rules,
      pricePerHour: Math.round(Number(data.priceRupees) * 100),
      minDurationMins: data.minDurationMins,
      maxDurationMins: data.maxDurationMins,
      images: data.images,
      availability: data.open247
        ? []
        : data.days
            .filter((d) => d.enabled)
            .map((d) => ({
              dayOfWeek: d.day,
              startMinute: toMinutes(d.start),
              endMinute: toMinutes(d.end) === 0 ? 1440 : toMinutes(d.end),
            })),
    };
  }

  async function save(publish: boolean) {
    if (publish && !data.selfParkingConfirmed) {
      toast.error("Confirm that drivers park their own vehicles and you will not request keys.");
      setStep(5);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const payload = { ...buildPayload(), publish };
      if (spaceId) await api.put(`/host/listings/${spaceId}`, payload);
      else await api.post("/host/listings", payload);
    } catch (e) {
      setBusy(false);
      const fieldErrors =
        e instanceof AxiosError
          ? ((e.response?.data as { errors?: Record<string, string[]> })?.errors ?? null)
          : null;
      if (fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldErrors)) if (v?.[0]) flat[k] = v[0];
        setErrors(flat);
        // Jump back to the first step with an error.
        const k = Object.keys(flat)[0];
        const stepFor: Record<string, number> = {
          address: 0, formattedAddress: 0, locality: 0, sublocality: 0, area: 0, city: 0, district: 0, state: 0, pincode: 0, postalCode: 0, latitude: 0, longitude: 0, placeId: 0,
          title: 1, description: 1, vehicleTypes: 1,
          images: 2,
          pricePerHour: 3, minDurationMins: 3, maxDurationMins: 3,
          availability: 4, blockedDates: 4,
          rules: 5, accessInstructions: 5, selfParkingConfirmed: 5,
        };
        if (k && k in stepFor) setStep(stepFor[k]);
      }
      toast.error(errorMessage(e, "Couldn't save the listing."));
      return;
    }
    setBusy(false);
    if (!spaceId) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
    toast.success(
      publish
        ? spaceId && ["ACTIVE", "VERIFIED"].includes(initialStatus ?? "")
          ? "Listing updated."
          : "Listing published. In production it waits for review; in development it is verified for testing."
        : "Draft saved."
    );
    navigate("/host/listings");
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    if (data.images.length + files.length > 8) {
      toast.error("You can add up to 8 photos.");
      return;
    }
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      try {
        const { data: d } = await api.post("/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const url = d.data.url as string;
        const publicId = typeof d.data.publicId === "string" && d.data.publicId ? d.data.publicId : undefined;
        setData((prev) => ({ ...prev, images: [...prev.images, { url, alt: "", ...(publicId ? { publicId } : {}) }] }));
      } catch (e) {
        toast.error(errorMessage(e, `Couldn't upload ${file.name}.`));
      }
    }
    setUploading(false);
  }

  function moveImage(i: number, dir: -1 | 1) {
    setData((prev) => {
      const imgs = [...prev.images];
      const j = i + dir;
      if (j < 0 || j >= imgs.length) return prev;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      return { ...prev, images: imgs };
    });
  }

  const price = Number(data.priceRupees) || 0;
  const previewCard: SpaceSummary = {
    id: spaceId || "preview",
    title: data.title || "Untitled listing",
    area: data.area || "Area",
    city: data.city,
    locality: data.locality,
    sublocality: data.sublocality,
    district: data.district,
    displayLocation: undefined,
    latitude: hasCoords ? lat : 0,
    longitude: hasCoords ? lng : 0,
    pricePerHour: Math.round(price * 100),
    ratingAvg: 0,
    ratingCount: 0,
    covered: data.covered,
    evCharging: data.evCharging,
    cctv: data.cctv,
    verified: false,
    vehicleTypes: data.vehicleTypes.join(","),
    level: data.level,
    propertyType: data.propertyType,
    imageUrl: data.images[0]?.url ?? null,
    distanceKm: null,
    available: true,
  };

  return (
    <div className="animate-fade-in">
      {/* Stepper */}
      <ol className="scrollbar-thin mb-8 flex gap-1 overflow-x-auto pb-2" aria-label="Listing steps">
        {STEPS.map((label, i) => (
          <li key={label} className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                i === step
                  ? "bg-brand-700 text-white"
                  : i < step
                    ? "bg-brand-50 text-brand-800 hover:bg-brand-100"
                    : "bg-slate-100 text-slate-400"
              )}
            >
              {i < step ? <Check className="size-3" aria-hidden /> : <span>{i + 1}.</span>}
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="text-slate-300" aria-hidden>—</span>}
          </li>
        ))}
      </ol>

      <div className="glass-strong rounded-2xl p-5 sm:p-7">
        {/* STEP 1: Location */}
        {step === 0 && (
          <div className="space-y-4">
            <StepHeading
              title="Where is your parking space?"
              sub="Search for your building, society or nearby landmark, then place the pin where the parking is located."
            />
            <LocationPicker
              value={{
                address: data.address,
                formattedAddress: data.formattedAddress,
                locality: data.locality,
                sublocality: data.sublocality,
                area: data.area,
                city: data.city,
                district: data.district,
                state: data.state,
                pincode: data.pincode,
                postalCode: data.postalCode,
                placeId: data.placeId,
                latitude: data.latitude,
                longitude: data.longitude,
              }}
              onChange={(loc) => set(loc)}
              error={errors.address || errors.area || errors.city}
            />
          </div>
        )}

        {/* STEP 2: Details */}
        {step === 1 && (
          <div className="space-y-4">
            <StepHeading title="Describe the space" sub="Accurate details build trust and reduce cancellations." />
            <div>
              <Label htmlFor="w-title">Listing title</Label>
              <Input
                id="w-title"
                value={data.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Covered basement spot near Linking Road"
                maxLength={90}
              />
              <FieldError error={errors.title} />
            </div>
            <div>
              <Label htmlFor="w-desc" hint="(optional)">Description</Label>
              <Textarea
                id="w-desc"
                rows={3}
                value={data.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="What makes this spot convenient? Any tips for finding it?"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="w-property">Property type</Label>
                <Select id="w-property" value={data.propertyType} onChange={(e) => set({ propertyType: e.target.value })}>
                  {PROPERTY_TYPES.map((p) => (
                    <option key={p} value={p}>{PROPERTY_TYPE_LABELS[p]}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="w-level">Level</Label>
                <Select id="w-level" value={data.level} onChange={(e) => set({ level: e.target.value })}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
                  ))}
                </Select>
              </div>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-700">Vehicles allowed</legend>
              <div className="flex gap-2">
                {(["CAR", "BIKE"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={data.vehicleTypes.includes(v)}
                    onClick={() =>
                      set({
                        vehicleTypes: data.vehicleTypes.includes(v)
                          ? data.vehicleTypes.filter((x) => x !== v)
                          : [...data.vehicleTypes, v],
                      })
                    }
                    className={cn(
                      "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                      data.vehicleTypes.includes(v)
                        ? "border-brand-600 bg-brand-50 text-brand-800"
                        : "border-slate-300 text-slate-600 hover:border-slate-400"
                    )}
                  >
                    {v === "CAR" ? "Cars" : "Bikes / scooters"}
                  </button>
                ))}
              </div>
              <FieldError error={errors.vehicleTypes} />
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["spaceType", "Private (assigned slot)", data.spaceType === "PRIVATE", () => set({ spaceType: data.spaceType === "PRIVATE" ? "OPEN" : "PRIVATE" })],
                  ["covered", "Covered parking", data.covered, () => set({ covered: !data.covered })],
                  ["evCharging", "EV charging available", data.evCharging, () => set({ evCharging: !data.evCharging })],
                  ["cctv", "CCTV monitored", data.cctv, () => set({ cctv: !data.cctv })],
                  ["securityGuard", "Security guard on site", data.securityGuard, () => set({ securityGuard: !data.securityGuard })],
                  ["gated", "Gated access", data.gated, () => set({ gated: !data.gated })],
                ] as [string, string, boolean, () => void][]
              ).map(([key, label, value, toggle]) => (
                <div key={key} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <span className="text-sm text-slate-700">{label}</span>
                  <Switch checked={value} onChange={toggle} label={label} />
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">
                Dimensions <span className="font-normal text-slate-400">(optional, in feet)</span>
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Input aria-label="Length in feet" type="number" min="1" step="0.5" value={data.lengthFt} onChange={(e) => set({ lengthFt: e.target.value })} placeholder="Length" />
                <Input aria-label="Width in feet" type="number" min="1" step="0.5" value={data.widthFt} onChange={(e) => set({ widthFt: e.target.value })} placeholder="Width" />
                <Input aria-label="Height in feet" type="number" min="1" step="0.5" value={data.heightFt} onChange={(e) => set({ heightFt: e.target.value })} placeholder="Height" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Photos */}
        {step === 2 && (
          <div className="space-y-4">
            <StepHeading
              title="Add photos"
              sub="Show the slot, the entrance and the approach. Up to 8 photos, 5 MB each."
            />
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40",
                uploading && "pointer-events-none opacity-60"
              )}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => uploadFiles(e.target.files)}
              />
              {uploading ? (
                <Upload className="size-8 animate-pulse text-brand-600" aria-hidden />
              ) : (
                <ImagePlus className="size-8 text-slate-400" aria-hidden />
              )}
              <span className="text-sm font-medium text-slate-700">
                {uploading ? "Uploading…" : "Click to upload photos"}
              </span>
              <span className="text-xs text-slate-400">JPEG, PNG or WebP</span>
            </label>
            {data.images.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="list">
                {data.images.map((img, i) => (
                  <li key={img.url} className="group relative overflow-hidden rounded-xl border border-slate-200">
                    <div className="relative h-28">
                      <Image src={img.url} alt={img.alt || `Photo ${i + 1}`} fill sizes="200px" className="object-cover" />
                    </div>
                    {i === 0 && (
                      <span className="absolute left-2 top-2 rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Cover
                      </span>
                    )}
                    <div className="absolute right-1.5 top-1.5 flex gap-1">
                      <IconBtn label={`Move photo ${i + 1} earlier`} onClick={() => moveImage(i, -1)} disabled={i === 0}>
                        <ArrowUp className="size-3.5" aria-hidden />
                      </IconBtn>
                      <IconBtn label={`Move photo ${i + 1} later`} onClick={() => moveImage(i, 1)} disabled={i === data.images.length - 1}>
                        <ArrowDown className="size-3.5" aria-hidden />
                      </IconBtn>
                      <IconBtn
                        label={`Delete photo ${i + 1}`}
                        onClick={() => set({ images: data.images.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </IconBtn>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.images.length === 0 && (
              <p className="text-xs text-slate-400">
                Photos are optional for drafts but strongly recommended before publishing.
              </p>
            )}
          </div>
        )}

        {/* STEP 5: Availability */}
        {step === 4 && (
          <div className="space-y-4">
            <StepHeading title="When can drivers book?" sub="Set weekly hours. You can also block specific dates below." />
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Open 24/7</p>
                <p className="text-xs text-slate-400">Available around the clock, every day</p>
              </div>
              <Switch checked={data.open247} onChange={(v) => set({ open247: v })} label="Open 24/7" />
            </div>
            {!data.open247 && (
              <div className="space-y-2 animate-fade-in">
                {data.days.map((d, i) => (
                  <div
                    key={d.day}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5",
                      d.enabled ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-60"
                    )}
                  >
                    <label className="flex w-32 items-center gap-2.5 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={(e) => {
                          const days = [...data.days];
                          days[i] = { ...d, enabled: e.target.checked };
                          set({ days });
                        }}
                        className="size-4 rounded accent-[#6C7A89]"
                      />
                      {DAY_NAMES[d.day]}
                    </label>
                    {d.enabled && (
                      <div className="flex items-center gap-2 text-sm">
                        <Input
                          aria-label={`${DAY_NAMES[d.day]} opens at`}
                          type="time"
                          value={d.start}
                          onChange={(e) => {
                            const days = [...data.days];
                            days[i] = { ...d, start: e.target.value };
                            set({ days });
                          }}
                          className="h-9 w-28"
                        />
                        <span className="text-slate-400">to</span>
                        <Input
                          aria-label={`${DAY_NAMES[d.day]} closes at`}
                          type="time"
                          value={d.end}
                          onChange={(e) => {
                            const days = [...data.days];
                            days[i] = { ...d, end: e.target.value };
                            set({ days });
                          }}
                          className="h-9 w-28"
                        />
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-xs text-slate-400">Set the end time to 00:00 for “until midnight”.</p>
              </div>
            )}
            <div>
              <Label htmlFor="w-block-date">Blocked dates</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="w-block-date"
                  type="date"
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!blockDate) return;
                    if (!data.blockedDates.includes(blockDate))
                      set({ blockedDates: [...data.blockedDates, blockDate].sort() });
                    setBlockDate("");
                  }}
                >
                  Block
                </Button>
              </div>
              {data.blockedDates.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {data.blockedDates.map((d) => (
                    <li key={d} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                      {d}
                      <button
                        type="button"
                        aria-label={`Unblock ${d}`}
                        onClick={() => set({ blockedDates: data.blockedDates.filter((x) => x !== d) })}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: Pricing */}
        {step === 3 && (
          <div className="space-y-4">
            <StepHeading title="Set your price" sub="Nearby demo spaces charge ₹40–₹100/hour. The server always recalculates the final amount." />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="w-price">Hourly price (₹)</Label>
                <Input
                  id="w-price"
                  type="number"
                  min="10"
                  max="1000"
                  value={data.priceRupees}
                  onChange={(e) => set({ priceRupees: e.target.value })}
                />
                <FieldError error={errors.pricePerHour} />
              </div>
              <div>
                <Label htmlFor="w-min">Minimum booking</Label>
                <Select
                  id="w-min"
                  value={data.minDurationMins}
                  onChange={(e) => set({ minDurationMins: Number(e.target.value) })}
                >
                  {ALLOWED_DURATIONS_MINS.map((m) => (
                    <option key={m} value={m}>{formatDuration(m)}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="w-max">Maximum booking</Label>
                <Select
                  id="w-max"
                  value={data.maxDurationMins}
                  onChange={(e) => set({ maxDurationMins: Number(e.target.value) })}
                >
                  {ALLOWED_DURATIONS_MINS.map((m) => (
                    <option key={m} value={m}>{formatDuration(m)}</option>
                  ))}
                </Select>
                <FieldError error={errors.maxDurationMins} />
              </div>
            </div>
            {price >= 10 && (
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="font-display text-lg font-bold text-slate-900">
                  {formatINR(Math.round(price * 100))}/hour
                </p>
                <p className="mt-1 text-slate-600">2 hours = {formatINR(Math.round(price * 2 * 100))}</p>
                <dl className="mt-3 space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <dt>Driver pays (incl. {SERVICE_FEE_PCT}% platform fee)</dt>
                    <dd>{formatINR(Math.round(price * 2 * 100 * (1 + SERVICE_FEE_PCT / 100)))}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Host commission ({PLATFORM_FEE_PCT}%)</dt>
                    <dd>− {formatINR(Math.round(price * 2 * 100 * (PLATFORM_FEE_PCT / 100)))}</dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
                    <dt>Your earning</dt>
                    <dd>{formatINR(Math.round(price * 2 * 100 * (1 - PLATFORM_FEE_PCT / 100)))}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}

        {/* STEP 6: Rules */}
        {step === 5 && (
          <div className="space-y-4">
            <StepHeading
              title="House rules & access"
              sub="Self-parking only. Your keys never leave your hand."
            />
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
              <p className="font-semibold">Self-parking only. Your keys never leave your hand.</p>
              <p className="mt-1 text-brand-800">
                Drivers park their own vehicles. Hosts must never request keys.
              </p>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={data.selfParkingConfirmed}
                onChange={(e) => set({ selfParkingConfirmed: e.target.checked })}
                className="mt-0.5 size-4 rounded accent-[#6C7A89]"
              />
              <span>
                I understand that drivers park their own vehicles and I will not request their keys.
                <FieldError error={errors.selfParkingConfirmed} />
              </span>
            </label>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Overnight parking allowed</p>
                <p className="text-xs text-slate-400">Bookings may cross midnight</p>
              </div>
              <Switch
                checked={data.overnightAllowed}
                onChange={(v) => set({ overnightAllowed: v })}
                label="Overnight parking allowed"
              />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Rules</legend>
              <div className="space-y-2">
                {COMMON_RULES.map((rule) => (
                  <label key={rule} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={data.rules.includes(rule)}
                      disabled={rule === COMMON_RULES[0]} // self-parking is mandatory
                      onChange={(e) =>
                        set({
                          rules: e.target.checked
                            ? [...data.rules, rule]
                            : data.rules.filter((r) => r !== rule),
                        })
                      }
                      className="size-4 rounded accent-[#6C7A89]"
                    />
                    {rule}
                    {rule === COMMON_RULES[0] && (
                      <span className="text-xs text-slate-400">(required)</span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            <CustomRuleInput
              onAdd={(r) => !data.rules.includes(r) && set({ rules: [...data.rules, r] })}
            />
            {data.rules.filter((r) => !(COMMON_RULES as readonly string[]).includes(r)).length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {data.rules
                  .filter((r) => !(COMMON_RULES as readonly string[]).includes(r))
                  .map((r) => (
                    <li key={r} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                      {r}
                      <button
                        aria-label={`Remove rule: ${r}`}
                        onClick={() => set({ rules: data.rules.filter((x) => x !== r) })}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <div>
              <Label htmlFor="w-size" hint="(optional)">Vehicle size restrictions</Label>
              <Input
                id="w-size"
                value={data.vehicleSizeNotes}
                onChange={(e) => set({ vehicleSizeNotes: e.target.value })}
                placeholder="e.g. Compact cars only, max height 6.5 ft"
              />
            </div>
            <div>
              <Label htmlFor="w-access" hint="(shared after booking)">Access instructions</Label>
              <Textarea
                id="w-access"
                rows={3}
                value={data.accessInstructions}
                onChange={(e) => set({ accessInstructions: e.target.value })}
                placeholder="e.g. Show your Parkly access code at the security gate. Slot number B-14 on basement level 1."
              />
            </div>
          </div>
        )}

        {/* STEP 7: Preview */}
        {step === 6 && (
          <div className="space-y-5">
            <StepHeading title="Preview your listing" sub="This is how the listing will appear to a driver." />
            <div className="pointer-events-none max-w-sm">
              <ParkingCard space={previewCard} />
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <p className="text-sm text-slate-600">{data.description || "No description."}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                {[
                  PROPERTY_TYPE_LABELS[data.propertyType as keyof typeof PROPERTY_TYPE_LABELS],
                  LEVEL_LABELS[data.level as keyof typeof LEVEL_LABELS],
                  data.covered ? "Covered" : "Open",
                  ...(data.evCharging ? ["EV charging"] : []),
                  ...(data.cctv ? ["CCTV"] : []),
                  ...(data.securityGuard ? ["Guard"] : []),
                  ...(data.gated ? ["Gated"] : []),
                  data.vehicleTypes.map((v) => (v === "CAR" ? "Cars" : "Bikes")).join(" & "),
                ].map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1">{t}</span>
                ))}
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Availability: {data.open247 ? "Open 24/7" : data.days.filter((d) => d.enabled).map((d) => `${DAY_NAMES[d.day]} ${d.start}–${d.end}`).join(" · ")}
              </p>
              {data.blockedDates.length > 0 && (
                <p className="mt-1 text-xs text-slate-400">Blocked: {data.blockedDates.join(", ")}</p>
              )}
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {data.rules.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs font-medium text-brand-700">Self-parking only. Your keys never leave your hand.</p>
              <div className="mt-4 max-w-xs rounded-xl bg-slate-50 p-4">
                <PriceBreakdown
                  pricePerHour={Math.round(price * 100)}
                  durationMins={120}
                  baseAmount={Math.round(price * 2 * 100)}
                  serviceFee={Math.round(price * 2 * 100 * (SERVICE_FEE_PCT / 100))}
                  totalAmount={Math.round(price * 2 * 100 * (1 + SERVICE_FEE_PCT / 100))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => save(false)} disabled={busy} loading={busy && step === 6}>
              Save draft
            </Button>
            {step < 6 ? (
              <Button onClick={next} disabled={step === 0 && !isValidPickedLocation(data)}>
                Continue
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button onClick={() => save(true)} loading={busy}>
                {spaceId && ["ACTIVE", "VERIFIED"].includes(initialStatus ?? "") ? "Save & keep live" : "Publish"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{sub}</p>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-slate-950/60 p-1.5 text-white backdrop-blur transition-colors hover:bg-slate-950/80 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function CustomRuleInput({ onAdd }: { onAdd: (rule: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <div className="flex gap-2">
      <Input
        aria-label="Add a custom rule"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a custom rule…"
        maxLength={160}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (value.trim()) {
              onAdd(value.trim());
              setValue("");
            }
          }
        }}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          if (value.trim()) {
            onAdd(value.trim());
            setValue("");
          }
        }}
      >
        Add
      </Button>
    </div>
  );
}
