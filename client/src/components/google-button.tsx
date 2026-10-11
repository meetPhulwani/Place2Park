import * as React from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "@/services/api";
import { useAuth } from "@/context/auth";
import { toast } from "./ui/toaster";

interface GsiClient {
  accounts: {
    id: {
      initialize: (config: Record<string, unknown>) => void;
      prompt: () => void;
    };
  };
}
// window.google is also declared by the Maps typings; use a scoped accessor.
const gsi = () => (window as unknown as { google?: GsiClient }).google;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * Google login via Google Identity Services: obtains an ID token in the browser,
 * then the Express backend verifies it and issues the app's JWT.
 */
export function GoogleButton({ next }: { next?: string }) {
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleCredential(credential: string) {
    try {
      const { data } = await api.post("/auth/google", { credential });
      login(data.data.token, data.data.user);
      navigate(next ?? "/dashboard");
    } catch (e) {
      toast.error(errorMessage(e, "Google sign-in failed."));
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    if (!GOOGLE_CLIENT_ID) {
      toast.error("Google login isn't configured yet. Use email and password instead.");
      return;
    }
    setLoading(true);
    if (!gsi()?.accounts) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("gsi load failed"));
        document.head.appendChild(s);
      }).catch(() => {
        toast.error("Couldn't load Google sign-in. Check your connection.");
        setLoading(false);
      });
      if (!gsi()?.accounts) return;
    }
    gsi()!.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (res: { credential: string }) => void handleCredential(res.credential),
      cancel_on_tap_outside: true,
    });
    gsi()!.accounts.id.prompt();
    // If the prompt is dismissed we simply stop the spinner after a grace period.
    setTimeout(() => setLoading(false), 4000);
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={start}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
      </svg>
      Continue with Google
    </button>
  );
}
