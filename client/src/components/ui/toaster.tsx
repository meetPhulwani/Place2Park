import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let pushToast: ((kind: ToastKind, message: string) => void) | null = null;

export const toast = {
  success: (m: string) => pushToast?.("success", m),
  error: (m: string) => pushToast?.("error", m),
  info: (m: string) => pushToast?.("info", m),
};

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const styles = {
  success: "border border-emerald-200 bg-white text-emerald-800 shadow-pop [&_svg.icon]:text-emerald-600",
  error: "border border-red-200 bg-white text-red-800 shadow-pop [&_svg.icon]:text-red-600",
  info: "border border-line bg-white text-ink shadow-pop [&_svg.icon]:text-muted",
};

export function Toaster() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const idRef = React.useRef(0);

  React.useEffect(() => {
    pushToast = (kind, message) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
    >
      {toasts.map((t) => {
        const Icon = icons[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl p-3.5 animate-slide-up",
              styles[t.kind]
            )}
          >
            <Icon className="icon mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="flex-1 text-sm font-medium">{t.message}</p>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Dismiss"
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
