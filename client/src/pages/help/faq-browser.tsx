import { useEffect, useMemo, useState } from "react";
import { CircleHelp, Search } from "lucide-react";
import Link from "@/components/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/context/auth";
import { FAQ_CATEGORY_LABELS, filterFaqs, type FaqItem } from "@/lib/faq-search";
import { api, errorMessage } from "@/services/api";

export function FaqBrowser({ initialCategory = "" }: { initialCategory?: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<FaqItem[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [openId, setOpenId] = useState("");
  const [votes, setVotes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    document.title = "How can we help? · Place2Park";
    api.get("/faqs").then(({ data }) => setRows(data.data.faqs as FaqItem[])).catch(() => {
      setRows([]);
      setError("Couldn't load the help center.");
    });
  }, []);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  const visible = useMemo(() => filterFaqs(rows ?? [], query, category), [rows, query, category]);
  const byKey = useMemo(() => new Map((rows ?? []).map((row) => [row.key, row])), [rows]);

  async function vote(id: string, helpful: boolean) {
    setVotes((current) => ({ ...current, [id]: helpful }));
    try {
      await api.post(`/faqs/${id}/feedback`, { helpful });
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that feedback."));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">How can we help?</h1>
        <p className="mt-2 text-sm text-muted">Search the help center, or contact Place2Park if you still need a person.</p>
      </div>
      <label className="relative block">
        <span className="sr-only">Search for answers</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for answers..."
          className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="FAQ categories">
        <button type="button" role="tab" aria-selected={category === ""} onClick={() => setCategory("")} className={chip(category === "")}>All</button>
        {FAQ_CATEGORY_LABELS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={category === id} onClick={() => setCategory(id)} className={chip(category === id)}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-line" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={CircleHelp}
          title="No matching answers"
          description="Try another word, or contact Place2Park support."
          action={<Link href={user ? "/help/contact" : "/support"} className="text-sm font-medium text-brand-600">Contact support</Link>}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const open = openId === item.id;
            const related = (item.related ?? []).map((key) => byKey.get(key)).filter((row): row is FaqItem => !!row && row.active !== false);
            return (
              <article key={item.id} className="rounded-xl border border-line bg-white shadow-card">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? "" : item.id)}
                >
                  <span className="font-medium text-ink">{item.question}</span>
                  <span className="text-muted" aria-hidden>{open ? "–" : "+"}</span>
                </button>
                {open && (
                  <div className="space-y-4 border-t border-line px-5 py-4">
                    <p className="text-sm leading-6 text-ink">{item.answer}</p>
                    {related.length > 0 && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted">Related</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {related.map((row) => (
                            <button key={row.id} type="button" className="rounded-lg bg-page px-3 py-1.5 text-sm text-brand-700" onClick={() => { setQuery(""); setCategory(row.category); setOpenId(row.id); }}>
                              {row.question}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-muted">Was this helpful?</p>
                      <Button type="button" size="sm" variant="secondary" disabled={item.id in votes} onClick={() => void vote(item.id, true)}>Yes</Button>
                      <Button type="button" size="sm" variant="secondary" disabled={item.id in votes} onClick={() => void vote(item.id, false)}>No</Button>
                      {votes[item.id] === false && (
                        <Link href={user ? "/help/contact" : "/login?next=/help/contact"} className="text-sm font-medium text-brand-600">
                          Contact support
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function chip(active: boolean) {
  return active
    ? "shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-sm font-medium text-white"
    : "shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink";
}
