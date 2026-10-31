import * as React from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "@/services/api";
import { useAuth, type AuthUser } from "@/context/auth";
import { googleSignInResult, saveEmailOtpChallenge } from "@/lib/google-auth";
import { toast } from "./ui/toaster";

interface GsiButtonConfig {
  type?: string;
  theme?: string;
  size?: string;
  text?: string;
  shape?: string;
  width?: number;
  logo_alignment?: string;
  ux_mode?: "popup" | "redirect";
}

interface GsiClient {
  accounts: {
    id: {
      initialize: (config: Record<string, unknown>) => void;
      renderButton: (parent: HTMLElement, config: GsiButtonConfig) => void;
    };
  };
}

// window.google is also declared by the Maps typings; use a scoped accessor.
const gsi = () => (window as unknown as { google?: GsiClient }).google;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GSI_SRC = "https://accounts.google.com/gsi/client";

let gsiLoader: Promise<void> | null = null;

function loadGsi() {
  if (gsi()?.accounts?.id) return Promise.resolve();
  if (!gsiLoader) {
    gsiLoader = new Promise<void>((resolve, reject) => {
      const done = () => (gsi()?.accounts?.id ? resolve() : reject(new Error("gsi load failed")));
      const fail = () => reject(new Error("gsi load failed"));
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
      const script = existing ?? document.createElement("script");
      const timer = window.setTimeout(fail, 8000);
      const finish = () => {
        window.clearTimeout(timer);
        done();
      };
      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", () => {
        window.clearTimeout(timer);
        fail();
      }, { once: true });
      if (!existing) {
        script.src = GSI_SRC;
        script.async = true;
        document.head.appendChild(script);
      } else if (gsi()?.accounts?.id) {
        finish();
      }
    }).catch((err) => {
      gsiLoader = null;
      throw err;
    });
  }
  return gsiLoader;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
    </svg>
  );
}

/**
 * Google login via Google Identity Services. The backend verifies the ID token.
 * Existing accounts get a session. New Google users verify an email code first.
 *
 * One Tap's prompt() is often skipped and shows nothing, so the clickable control is
 * the GIS button. That button returns the ID token in its callback.
 */
export function GoogleButton({ next }: { next?: string }) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { login } = useAuth();
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const onCredential = React.useRef<(credential: string) => Promise<void>>(async () => {});

  onCredential.current = async (credential: string) => {
    try {
      const { data } = await api.post("/auth/google", { credential });
      const result = googleSignInResult<AuthUser>(data.data);
      if (result.kind === "email") {
        const dest = next && next.startsWith("/") ? next : "/dashboard";
        saveEmailOtpChallenge(result.challenge, dest);
        navigate("/signup/verify-email");
        return;
      }
      login(result.token, result.user);
      navigate(next ?? "/dashboard");
    } catch (e) {
      toast.error(errorMessage(e, "Google sign-in failed."));
    }
  };

  React.useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let readyToPaint = false;
    let lastWidth = 0;

    function paint() {
      const google = gsi();
      if (!readyToPaint || !google?.accounts?.id || !host) return;
      const width = Math.min(400, Math.max(200, Math.round(host.getBoundingClientRect().width) || 320));
      if (host.childElementCount > 0 && Math.abs(width - lastWidth) < 2) return;
      lastWidth = width;
      host.replaceChildren();
      google.accounts.id.renderButton(host, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        ux_mode: "popup",
        width,
      });
      setReady(true);
    }

    loadGsi()
      .then(() => {
        if (cancelled) return;
        const google = gsi();
        if (!google?.accounts?.id) throw new Error("gsi load failed");
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: { credential?: string }) => {
            if (response.credential) void onCredential.current(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          // The button's own popup handles the click. FedCM for the button
          // stays off so a click still opens the account chooser when FedCM
          // is unavailable. One Tap prompt() is intentionally not used.
          use_fedcm_for_button: false,
        });
        readyToPaint = true;
        paint();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    const observer = new ResizeObserver(() => paint());
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        onClick={() => toast.error("Google login isn't configured yet. Use email and password instead.")}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <GoogleMark />
        Continue with Google
      </button>
    );
  }

  return (
    <div className="w-full">
      {failed ? (
        <button
          type="button"
          onClick={() => toast.error("Couldn't load Google sign-in. Check your connection.")}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700"
        >
          <GoogleMark />
          Continue with Google
        </button>
      ) : (
        <div className="relative min-h-11 w-full">
          {!ready && (
            <div className="absolute inset-0 flex h-11 items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700">
              <GoogleMark />
              Continue with Google
            </div>
          )}
          <div ref={hostRef} className="relative z-10 w-full" />
        </div>
      )}
    </div>
  );
}
