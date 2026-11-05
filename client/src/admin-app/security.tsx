import * as React from "react";
import { consoleApi, consoleError } from "@/services/console-api";

export function SecurityPage() {
  const [message, setMessage] = React.useState("");
  return (
    <section className="max-w-lg">
      <h1 className="text-xl font-semibold">Security</h1>
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
