import * as React from "react";
import { consoleApi, consoleError } from "@/services/console-api";

export function SettingsPage() {
  const [banner, setBanner] = React.useState("");
  const [review, setReview] = React.useState(true);
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    consoleApi.get("/settings").then(({ data }) => {
      setBanner(String(data.data.maintenanceBanner ?? ""));
      setReview(Boolean(data.data.listingsRequireReview));
    }).catch(() => undefined);
  }, []);
  return (
    <section className="max-w-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">Platform</p>
      <h1 className="mt-1 text-3xl font-bold">Configuration</h1>
      <p className="mt-2 text-sm">Changes require a recent authenticator confirmation. Fee and cancellation rules stay in the server configuration.</p>
      <form
        className="mt-4 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void consoleApi.post("/auth/reauth", { password: form.get("password"), code: form.get("code") })
            .then(() => consoleApi.patch("/settings", { maintenanceBanner: banner, listingsRequireReview: review, confirm: "UPDATE" }))
            .then(() => setMessage("Saved."))
            .catch((err) => setMessage(consoleError(err)));
        }}
      >
        <textarea value={banner} onChange={(e) => setBanner(e.target.value)} className="rounded-lg border border-[#C7D1DD] px-3 py-2" placeholder="Maintenance banner" />
        <label className="text-sm"><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> Listings require review</label>
        <input name="password" type="password" required placeholder="Password" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <input name="code" required placeholder="Authenticator code" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <button className="rounded-lg bg-[#0251B0] px-3 py-2 text-white" type="submit">Save</button>
      </form>
      {message && <p className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
