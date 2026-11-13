import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { api, errorMessage } from "@/services/api";
import { acceptedImages } from "@/lib/image-upload";
import { SUPPORT_TOPICS } from "@/lib/support-labels";

type Row = { id: string; code: string; spaceTitle: string };

export default function ContactSupportPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [category, setCategory] = useState("ACCOUNT");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Contact support · Place2Park";
    api.get("/support/bookings").then(({ data }) => setRows(data.data.bookings as Row[])).catch(() => setRows([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (subject.trim().length < 4 || description.trim().length < 20) {
      setError("Add a subject and describe the problem in at least 20 characters.");
      return;
    }
    setBusy(true);
    try {
      const chosen = acceptedImages(files, 4);
      if (chosen.error) {
        setError(chosen.error);
        setBusy(false);
        return;
      }
      const evidenceIds: string[] = [];
      for (const file of chosen.ok) {
        const body = new FormData();
        body.append("file", file);
        const uploaded = await api.post("/support/evidence", body);
        evidenceIds.push(uploaded.data.data.id as string);
      }
      const { data } = await api.post("/support/tickets", {
        category,
        subject: subject.trim(),
        description: description.trim(),
        bookingId,
        evidenceIds,
      });
      toast.success(`Ticket ${data.data.reference} submitted.`);
      navigate(`/help/tickets/SUPPORT/${data.data.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't submit the ticket."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DashboardHeader title="Contact Place2Park support" description="This goes to Place2Park, not to another driver or host." />
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-card">
        <label className="block text-sm font-medium text-ink">
          Category
          <select className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            {SUPPORT_TOPICS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Subject
          <input className="mt-1 h-11 w-full rounded-lg border border-line px-3 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required />
        </label>
        <label className="block text-sm font-medium text-ink">
          Description
          <textarea className="mt-1 min-h-32 w-full rounded-lg border border-line px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} required />
        </label>
        <label className="block text-sm font-medium text-ink">
          Related booking
          <select className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
            <option value="">None</option>
            {rows.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.spaceTitle}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Screenshot
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-1 block w-full text-sm" onChange={(e) => {
              const chosen = acceptedImages([...(e.target.files ?? [])], 4);
              setFiles(chosen.ok);
              if (chosen.error) setError(chosen.error);
            }} />
            <span className="mt-1 block text-xs font-normal text-muted">JPEG, PNG or WebP, up to 5 MB each.</span>
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit ticket"}</Button>
      </form>
    </div>
  );
}
