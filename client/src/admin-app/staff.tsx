import * as React from "react";
import { consoleApi, consoleError } from "@/services/console-api";

interface Row { id: string; email: string; name: string; role: string; status: string }

export function StaffPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [message, setMessage] = React.useState("");
  const [enrollUri, setEnrollUri] = React.useState("");

  const load = React.useCallback(() => {
    consoleApi.get("/staff").then(({ data }) => setRows(data.data.admins as Row[])).catch(() => setRows([]));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">Access</p>
      <h1 className="mt-1 text-3xl font-bold">Administrators</h1>
      <p className="mt-2 text-sm">Only the Super Admin can add or change administrator access. New accounts stay locked until the authenticator code is confirmed.</p>
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="p2p-card px-4 py-3 text-sm">
            <span className="font-medium">{row.name}</span> · {row.email} · {row.role} · {row.status}
          </li>
        ))}
      </ul>
      {message && <p className="mt-3 text-sm">{message}</p>}
      {enrollUri && <p className="mt-2 break-all text-xs">{enrollUri}</p>}
      <form
        className="mt-6 grid max-w-lg gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void consoleApi.post("/staff", {
            email: form.get("email"),
            name: form.get("name"),
            password: form.get("password"),
            role: form.get("role"),
            questionId: form.get("questionId"),
            answer: form.get("answer"),
          }).then(({ data }) => {
            setMessage("Account created. Enroll the authenticator from the setup value below, then confirm the code. This value is shown once.");
            setEnrollUri(String(data.data.uri ?? ""));
            (event.target as HTMLFormElement).reset();
            load();
          }).catch((err) => setMessage(consoleError(err)));
        }}
      >
        <input name="name" required placeholder="Name" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <input name="email" type="email" required placeholder="Email" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <input name="password" type="password" required placeholder="Temporary password" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <select name="role" className="rounded-lg border border-[#C7D1DD] px-3 py-2">
          <option value="OPERATIONS">Operations</option>
          <option value="SUPPORT">Support</option>
          <option value="FINANCE">Finance</option>
        </select>
        <select name="questionId" className="rounded-lg border border-[#C7D1DD] px-3 py-2">
          <option value="first-school">First school</option>
          <option value="city-born">City born</option>
          <option value="first-car">First car</option>
          <option value="favorite-teacher">Favorite teacher</option>
          <option value="childhood-street">Childhood street</option>
        </select>
        <input name="answer" required placeholder="Security answer" className="rounded-lg border border-[#C7D1DD] px-3 py-2" />
        <button className="rounded-lg bg-[#0251B0] px-3 py-2 text-white" type="submit">Create administrator</button>
      </form>
    </section>
  );
}
