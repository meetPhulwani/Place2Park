import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toaster";
import { api, errorMessage } from "@/services/api";
import { acceptedImages } from "@/lib/image-upload";
import { DRIVER_REPORTS, HOST_REPORTS } from "@/lib/support-labels";
import { CalendarClock } from "lucide-react";

type Row = {
  id: string;
  code: string;
  spaceTitle: string;
  direction: "DRIVER_REPORTS_HOST" | "HOST_REPORTS_DRIVER";
  reportedUserId: string;
  reportedName: string;
};

export default function ReportUserPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [bookingId, setBookingId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [incidentAt, setIncidentAt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Report a driver or host · Place2Park";
    api
      .get("/support/bookings")
      .then(({ data }) => setRows(data.data.bookings as Row[]))
      .catch(() => setRows([]));
  }, []);

  const selected = rows?.find((row) => row.id === bookingId);
  const categories = selected?.direction === "HOST_REPORTS_DRIVER" ? HOST_REPORTS : DRIVER_REPORTS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selected) {
      setError("Choose a booking.");
      return;
    }
    if (description.trim().length < 20) {
      setError("Describe what happened in at least 20 characters.");
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
      const { data } = await api.post("/support/reports", {
        bookingId: selected.id,
        reportedUserId: selected.reportedUserId,
        category,
        description: description.trim(),
        incidentAt: incidentAt ? new Date(incidentAt).toISOString() : "",
        evidenceIds,
      });
      toast.success(`Report ${data.data.reference} submitted.`);
      navigate(`/help/tickets/USER_REPORT/${data.data.id}`);
    } catch (err) {
      setError(errorMessage(err, "Couldn't submit the report."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DashboardHeader title="Report a driver or host" description="You can only report the other person on a booking you took part in." />
      {rows === null ? (
        <div className="h-40 animate-pulse rounded-xl bg-line" />
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No bookings to report" description="Reports are available after you have a booking as a driver or a host." />
      ) : (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-card">
          <label className="block text-sm font-medium text-ink">
            Related booking
            <select className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" value={bookingId} onChange={(e) => { setBookingId(e.target.value); setCategory(""); }} required>
              <option value="">Choose a booking</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>{row.code} · {row.spaceTitle}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-ink">
            Reported person
            <input className="mt-1 h-11 w-full rounded-lg border border-line bg-page px-3 text-sm" value={selected?.reportedName ?? ""} readOnly placeholder="Chosen from the booking" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Category
            <select className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} required>
              <option value="">Choose a category</option>
              {categories.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-ink">
            What happened
            <textarea className="mt-1 min-h-32 w-full rounded-lg border border-line px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} required />
          </label>
          <label className="block text-sm font-medium text-ink">
            Incident time
            <input type="datetime-local" className="mt-1 h-11 w-full rounded-lg border border-line px-3 text-sm" value={incidentAt} onChange={(e) => setIncidentAt(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Evidence
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-1 block w-full text-sm" onChange={(e) => {
              const chosen = acceptedImages([...(e.target.files ?? [])], 4);
              setFiles(chosen.ok);
              if (chosen.error) setError(chosen.error);
            }} />
            <span className="mt-1 block text-xs font-normal text-muted">JPEG, PNG or WebP, up to 5 MB each.</span>
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit report"}</Button>
        </form>
      )}
    </div>
  );
}
