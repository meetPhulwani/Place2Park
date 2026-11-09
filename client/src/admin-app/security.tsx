import * as React from "react";
import { consoleApi, consoleError } from "@/services/console-api";

export function SecurityPage() {
  const [message, setMessage] = React.useState("");
  const [session, setSession] = React.useState<{ email: string; role: string } | null>(null);
  React.useEffect(() => {
    consoleApi.get("/auth/session").then(({ data }) => {
      const admin = data.data.admin as { email?: string; role?: string };
      setSession({ email: String(admin.email ?? ""), role: String(admin.role ?? "") });
    }).catch(() => setSession(null));
  }, []);
  return (
    <section className="max-w-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">Account</p>
      <h1 className="mt-1 text-3xl font-bold">Security</h1>
      <div className="mt-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 text-sm">
        <p className="font-medium">This session</p>
        <p className="mt-1 text-[#64748b]">{session ? `${session.email} · ${session.role}` : "Session details are unavailable."}</p>
      </div>
      <p className="mt-2 text-sm">Password changes require a recent password and authenticator confirmation. Authenticator verification cannot be turned off.</p>
      <form
        className="mt-4 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void consoleApi.post("/auth/reauth", { password: form.get("current"), code: form.get("code") })
            .then(() => consoleApi.post("/account/password", { password: form.get("next") }))
            .then(() => setMessage("Password updated."))
            .catch((err) => setMessage(consoleError(err)));
        }}
      >
        <input name="current" type="password" required placeholder="Current password" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <input name="code" inputMode="numeric" required placeholder="Authenticator code" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <input name="next" type="password" required placeholder="New password" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <button className="rounded-lg bg-[#0251B0] px-3 py-2 text-white" type="submit">Update password</button>
      </form>
      {message && <p className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
