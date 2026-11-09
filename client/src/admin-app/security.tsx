import * as React from "react";
import { consoleApi, consoleError } from "@/services/console-api";

/** Password change is not linked from navigation. The shell opens it only for a Super Admin. */
export function SuperAdminPassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [message, setMessage] = React.useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#012456]/40 px-4" onClick={onClose}>
      <form
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-pop"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void consoleApi.post("/auth/reauth", { password: form.get("current"), code: form.get("code") })
            .then(() => consoleApi.post("/account/password", { password: form.get("next") }))
            .then(() => setMessage("Password updated."))
            .catch((err) => setMessage(consoleError(err)));
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Account credential</h2>
          <button type="button" className="text-sm font-semibold text-[#0251B0]" onClick={onClose}>Close</button>
        </div>
        <p className="mt-2 text-sm text-[#64748b]">This still requires your current password and authenticator code.</p>
        <div className="mt-4 grid gap-2">
          <input name="current" type="password" required placeholder="Current password" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
          <input name="code" inputMode="numeric" required placeholder="Authenticator code" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
          <input name="next" type="password" required placeholder="New password" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
          <button className="rounded-lg bg-[#0251B0] px-3 py-2 text-white" type="submit">Save</button>
        </div>
        {message && <p className="mt-3 text-sm">{message}</p>}
      </form>
    </div>
  );
}
