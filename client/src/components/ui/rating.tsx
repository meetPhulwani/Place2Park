import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Rating({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  if (!count && value === 0) {
    return <span className="text-xs text-slate-400">New</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-700">
      <Star style={{ width: size, height: size }} className="fill-amber-400 text-amber-400" aria-hidden />
      <span className="font-medium">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-slate-400">({count})</span>}
    </span>
  );
}

export function RatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rounded p-0.5 transition-transform hover:scale-110 disabled:cursor-not-allowed"
        >
          <Star
            className={cn(
              "size-7 transition-colors",
              n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"
            )}
          />
        </button>
      ))}
    </div>
  );
}
