import * as React from "react";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Filters {
  maxPrice?: number;
  maxDistanceKm?: number;
  covered?: boolean;
  ev?: boolean;
  vehicleType?: "CAR" | "BIKE";
  minRating?: number;
  sort?: "closest" | "cheapest" | "rating";
}

export function FilterPanel({
  value,
  onChange,
  busy,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  busy?: boolean;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  return (
    <div
      className="glass-soft grid gap-3 rounded-2xl p-3.5 animate-fade-in sm:grid-cols-2"
      role="group"
      aria-label="Search filters"
    >
      <div>
        <label htmlFor="f-price" className="mb-1 block text-xs font-medium text-slate-500">
          Max price/hour
        </label>
        <Select
          id="f-price"
          disabled={busy}
          value={value.maxPrice ?? ""}
          onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
          className="h-9 bg-white/50"
        >
          <option value="">Any price</option>
          {[30, 50, 75, 100, 150].map((p) => (
            <option key={p} value={p}>
              Up to ₹{p}/hr
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor="f-distance" className="mb-1 block text-xs font-medium text-slate-500">
          Max distance
        </label>
        <Select
          id="f-distance"
          disabled={busy}
          value={value.maxDistanceKm ?? ""}
          onChange={(e) =>
            set({ maxDistanceKm: e.target.value ? Number(e.target.value) : undefined })
          }
          className="h-9 bg-white/50"
        >
          <option value="">Any distance</option>
          {[0.5, 1, 2, 5].map((d) => (
            <option key={d} value={d}>
              Within {d} km
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor="f-vehicle" className="mb-1 block text-xs font-medium text-slate-500">
          Vehicle
        </label>
        <Select
          id="f-vehicle"
          disabled={busy}
          value={value.vehicleType ?? ""}
          onChange={(e) =>
            set({ vehicleType: (e.target.value || undefined) as Filters["vehicleType"] })
          }
          className="h-9 bg-white/50"
        >
          <option value="">Car or bike</option>
          <option value="CAR">Car</option>
          <option value="BIKE">Bike / scooter</option>
        </Select>
      </div>
      <div>
        <label htmlFor="f-rating" className="mb-1 block text-xs font-medium text-slate-500">
          Minimum rating
        </label>
        <Select
          id="f-rating"
          disabled={busy}
          value={value.minRating ?? ""}
          onChange={(e) => set({ minRating: e.target.value ? Number(e.target.value) : undefined })}
          className="h-9 bg-white/50"
        >
          <option value="">Any rating</option>
          <option value="4.5">4.5+</option>
          <option value="4">4.0+</option>
          <option value="3">3.0+</option>
        </Select>
      </div>
      <div>
        <label htmlFor="f-sort" className="mb-1 block text-xs font-medium text-slate-500">
          Sort by
        </label>
        <Select
          id="f-sort"
          disabled={busy}
          value={value.sort ?? "closest"}
          onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}
          className="h-9 bg-white/50"
        >
          <option value="closest">Closest first</option>
          <option value="cheapest">Cheapest first</option>
          <option value="rating">Highest rated</option>
        </Select>
      </div>
      <div className="flex items-end gap-2 pb-0.5">
        {(
          [
            ["covered", "Covered"],
            ["ev", "EV charging"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-pressed={!!value[key]}
            onClick={() => set({ [key]: value[key] ? undefined : true })}
            className={cn(
              "h-9 flex-1 rounded-xl border px-3 text-xs font-medium transition-colors",
              value[key]
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
