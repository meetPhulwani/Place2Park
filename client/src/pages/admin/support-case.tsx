import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { STATUS_LABEL } from "@/lib/support-labels";
import { consoleApi, errorMessage } from "@/services/console-api";

type Person = { id: string; name: string; email: string; role: string; status: string };
type Case = {
  reference: string;
  status: string;
  priority: string;
  category: string;
  subject?: string;
  description?: string;
  resolutionNote?: string;
  assigneeId?: string;
  evidence: { url: string }[];
  messages: { id: string; body: string; visibility: string; createdAt: string }[];
  audit: { id: string; action: string; fromStatus?: string; toStatus?: string; note?: string; createdAt: string }[];
  booking: { code: string; status: string; start: string; end: string; totalAmount: number } | null;
  payment: { status: string; amount: number; currency: string } | null;
  people: { reporter: Person | null; reported: Person | null; owner: Person | null };
};

export default function AdminSupportCasePage() {
  const { kind = "", id = "" } = useParams();
  const [item, setItem] = useState<Case | null>(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [assigneeId, setAssigneeId] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    consoleApi.get(`/support/${kind}/${id}`).then(({ data }) => {
      const next = data.data as Case;
      setItem(next);
      setStatus(next.status);
      setPriority(next.priority);
      setAssigneeId(next.assigneeId ?? "");
    }).catch((err) => setError(errorMessage(err, "Ticket not found.")));
  }
  useEffect(() => {
    document.title = "Support case · Place2Park";
    load();
  }, [kind, id]);

  async function act(run: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await run();
      toast.success(done);
      setBody("");
      setNote("");
      load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the ticket."));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!item) return <div className="h-56 animate-pulse rounded-xl bg-line" />;
  const people = [item.people.reporter, item.people.reported, item.people.owner].filter(Boolean) as Person[];
  return (
    <div className="space-y-6">
      <DashboardHeader
        title={item.reference}
        description={`${item.subject || item.category} · ${item.category}`}
        actions={<Badge variant="brand">{STATUS_LABEL[item.status] ?? item.status}</Badge>}
      />
      <p className="rounded-xl border border-line bg-white p-5 text-sm text-ink">{item.description}</p>
      <section className="grid gap-3 sm:grid-cols-2">
        {people.map((person) => (
          <article key={person.id} className="rounded-xl border border-line bg-white p-4 text-sm">
            <p className="font-semibold text-ink">{person.name}</p>
            <p className="text-muted">{person.email}</p>
            <p className="text-muted">{person.role} · {person.status}</p>
          </article>
        ))}
        {item.booking && (
          <article className="rounded-xl border border-line bg-white p-4 text-sm">
            <p className="font-semibold text-ink">{item.booking.code}</p>
            <p className="text-muted">{item.booking.status} · ₹{(item.booking.totalAmount / 100).toFixed(2)}</p>
            <p className="text-muted">{new Date(item.booking.start).toLocaleString()} – {new Date(item.booking.end).toLocaleString()}</p>
          </article>
        )}
        {item.payment && (
          <article className="rounded-xl border border-line bg-white p-4 text-sm">
            <p className="font-semibold text-ink">Payment {item.payment.status}</p>
            <p className="text-muted">{item.payment.currency} {(item.payment.amount / 100).toFixed(2)}</p>
          </article>
        )}
      </section>
      {item.evidence.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {item.evidence.map((file) => <img key={file.url} src={file.url} alt="Uploaded evidence" className="aspect-square w-full rounded-lg object-cover" />)}
        </div>
      )}
      <ol className="space-y-2">
        {item.messages.map((message) => (
          <li key={message.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
            <p className="text-xs font-medium text-muted">{message.visibility === "INTERNAL" ? "Internal note" : "Reply"}</p>
            <p className="mt-1 text-ink">{message.body}</p>
          </li>
        ))}
      </ol>
      <form className="space-y-3 rounded-xl border border-line bg-white p-5" onSubmit={(e) => { e.preventDefault(); void act(() => consoleApi.post(`/support/${kind}/${id}/messages`, { body, visibility: "PUBLIC" }), "Reply sent."); }}>
        <label className="block text-sm font-medium text-ink" htmlFor="admin-reply">Reply to the user</label>
        <textarea id="admin-reply" className="min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || body.trim().length < 2}>Send reply</Button>
          <Button type="button" variant="secondary" disabled={busy || body.trim().length < 2} onClick={() => void act(() => consoleApi.post(`/support/${kind}/${id}/messages`, { body, visibility: "INTERNAL" }), "Note saved.")}>Save internal note</Button>
        </div>
      </form>
      <form className="grid gap-3 rounded-xl border border-line bg-white p-5 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        void act(() => consoleApi.post(`/support/${kind}/${id}`, { status, priority, assigneeId: assigneeId || null, note }), "Ticket updated.");
      }}>
        <label className="text-sm font-medium text-ink">Status
          <select className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">Priority
          <select className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-ink sm:col-span-2">Admin owner id
          <input className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} placeholder="Leave blank to unassign" />
        </label>
        <label className="text-sm font-medium text-ink sm:col-span-2">Resolution or request note
          <textarea className="mt-1 min-h-20 w-full rounded-lg border border-line px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <Button type="submit" disabled={busy} className="sm:col-span-2">Save decision</Button>
      </form>
      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Audit trail</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          {item.audit.map((entry) => (
            <li key={entry.id}>{new Date(entry.createdAt).toLocaleString()} · {entry.action}{entry.toStatus ? ` → ${entry.toStatus}` : ""}{entry.note ? ` · ${entry.note}` : ""}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
