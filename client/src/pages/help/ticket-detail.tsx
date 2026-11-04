import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { api, errorMessage } from "@/services/api";
import { STATUS_LABEL } from "@/lib/support-labels";

type Message = { id: string; body: string; createdAt: string; visibility: string };
type Case = {
  reference: string;
  status: string;
  category: string;
  description?: string;
  subject?: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  resolutionNote?: string;
};

export default function TicketDetailPage() {
  const { kind = "", id = "" } = useParams();
  const [item, setItem] = useState<Case | null>(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/support/cases/${kind}/${id}`).then(({ data }) => setItem(data.data as Case)).catch((err) => setError(errorMessage(err, "Ticket not found.")));
  }
  useEffect(() => {
    document.title = "Ticket · Place2Park";
    load();
  }, [kind, id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/support/cases/${kind}/${id}/messages`, { body: reply });
      setReply("");
      toast.success("Reply sent.");
      load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send the reply."));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!item) return <div className="h-48 animate-pulse rounded-xl bg-line" />;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DashboardHeader
        title={item.reference}
        description={`${item.subject || item.category} · Submitted ${new Date(item.createdAt).toLocaleString()} · Updated ${new Date(item.updatedAt).toLocaleString()}`}
        actions={<Badge variant={item.status === "AWAITING_USER" ? "warning" : "brand"}>{STATUS_LABEL[item.status] ?? item.status}</Badge>}
      />
      {item.description && <p className="rounded-xl border border-line bg-white p-5 text-sm text-ink">{item.description}</p>}
      {item.resolutionNote && <p className="rounded-xl border border-brand-200 bg-brand-50 p-5 text-sm text-ink">Place2Park: {item.resolutionNote}</p>}
      <ol className="space-y-3">
        {item.messages.map((message) => (
          <li key={message.id} className="rounded-xl border border-line bg-white px-4 py-3">
            <p className="text-sm text-ink">{message.body}</p>
            <p className="mt-1 text-xs text-muted">{new Date(message.createdAt).toLocaleString()}</p>
          </li>
        ))}
      </ol>
      {item.messages.length === 0 && <p className="text-sm text-muted">No replies yet.</p>}
      {item.status === "AWAITING_USER" && (
        <form onSubmit={send} className="space-y-3 rounded-xl border border-line bg-white p-5">
          <label className="block text-sm font-medium text-ink" htmlFor="ticket-reply">Your reply</label>
          <textarea id="ticket-reply" className="min-h-28 w-full rounded-lg border border-line px-3 py-2 text-sm" value={reply} onChange={(e) => setReply(e.target.value)} required />
          <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send reply"}</Button>
        </form>
      )}
    </div>
  );
}
