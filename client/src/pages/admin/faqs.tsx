import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { FAQ_CATEGORY_LABELS } from "@/lib/faq-search";
import { api, errorMessage } from "@/services/api";

type Row = {
  id: string;
  question: string;
  answer: string;
  category: string;
  featured: boolean;
  active: boolean;
  order: number;
};

const empty = { question: "", answer: "", category: "GETTING_STARTED", featured: false, active: true };

export default function AdminFaqsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    api.get("/admin/faqs").then(({ data }) => setRows(data.data.faqs as Row[])).catch((err) => {
      setRows([]);
      setError(errorMessage(err, "Couldn't load FAQs."));
    });
  }

  useEffect(() => {
    document.title = "FAQs · Place2Park";
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) await api.patch(`/admin/faqs/${editing}`, form);
      else await api.post("/admin/faqs", form);
      setForm(empty);
      setEditing(null);
      toast.success(editing ? "FAQ updated." : "FAQ added.");
      load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the FAQ."));
    }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!rows) return;
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setRows(next);
    try {
      await api.post("/admin/faqs/reorder", { ids: next.map((row) => row.id) });
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't reorder FAQs."));
      load();
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHeader title="Help center FAQs" description="Add, edit, hide, or reorder questions. Hidden questions stay out of the public help center." />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <form onSubmit={save} className="grid gap-3 rounded-xl border border-line bg-white p-5">
        <label className="text-sm font-medium text-ink">Question
          <input className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} required />
        </label>
        <label className="text-sm font-medium text-ink">Answer
          <textarea className="mt-1 min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} required />
        </label>
        <label className="text-sm font-medium text-ink">Category
          <select className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {FAQ_CATEGORY_LABELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Featured</label>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
        <div className="flex gap-2">
          <Button type="submit">{editing ? "Save changes" : "Add FAQ"}</Button>
          {editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</Button>}
        </div>
      </form>
      {rows === null ? (
        <div className="h-40 animate-pulse rounded-xl bg-line" />
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={row.id} className="rounded-xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{row.question}</p>
                  <p className="mt-1 text-xs text-muted">{row.category}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.featured && <Badge variant="volt">Featured</Badge>}
                  {!row.active && <Badge variant="neutral">Hidden</Badge>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => { setEditing(row.id); setForm({ question: row.question, answer: row.answer, category: row.category, featured: row.featured, active: row.active }); }}>Edit</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => void move(index, -1)}>Up</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => void move(index, 1)}>Down</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => void api.patch(`/admin/faqs/${row.id}`, { active: !row.active }).then(load)}>
                  {row.active ? "Deactivate" : "Activate"}
                </Button>
                <Button type="button" size="sm" variant="danger" onClick={() => void api.delete(`/admin/faqs/${row.id}`).then(() => { toast.success("FAQ deleted."); load(); })}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
