import * as React from "react";
import Link from "@/components/link";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Lock, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

interface CalBooking {
  id: string;
  code: string;
  start: string;
  end: string;
  status: string;
}
interface CalBlock {
  id: string;
  start: string;
  end: string;
  reason: string;
}
interface CalData {
  bookings: CalBooking[];
  blocked: CalBlock[];
  spaces: { id: string; title: string }[];
  spaceId: string | null;
}

export default function HostCalendarPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState<CalData | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const now = new Date();
  const monthParam = params.get("month") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = monthParam.split("-").map(Number);
  const year = y || now.getFullYear();
  const month = (m || now.getMonth() + 1) - 1; // 0-based
  const spaceParam = params.get("space") ?? "";

  React.useEffect(() => {
    document.title = "Calendar · Parkly";
    const qs = new URLSearchParams({ year: String(year), month: String(month) });
    if (spaceParam) qs.set("spaceId", spaceParam);
    api.get(`/host/calendar?${qs.toString()}`).then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, [year, month, spaceParam, reloadKey]);

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (data.spaces.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Calendar</h1>
        <EmptyState
          icon={CalendarDays}
          title="No listings to schedule"
          description="Publish a listing first, then manage its availability here."
          action={
            <Link href="/host/listings/new">
              <Button>Create a listing</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Bookings and blocked periods per listing. Block times when your space isn&apos;t free.
        </p>
      </div>
      <CalendarView
        spaces={data.spaces}
        spaceId={data.spaceId ?? data.spaces[0].id}
        year={year}
        month={month}
        bookings={data.bookings}
        blocks={data.blocked}
        onNavigate={(next) => setParams(next, { replace: true })}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}

function CalendarView({
  spaces,
  spaceId,
  year,
  month,
  bookings,
  blocks,
  onNavigate,
  onChanged,
}: {
  spaces: { id: string; title: string }[];
  spaceId: string;
  year: number;
  month: number; // 0-based
  bookings: CalBooking[];
  blocks: CalBlock[];
  onNavigate: (params: URLSearchParams) => void;
  onChanged: () => void;
}) {
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ date: "", startTime: "08:00", endTime: "20:00", reason: "" });

  const monthStart = new Date(year, month, 1);
  const label = monthStart.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  function nav(delta: number) {
    const d = new Date(year, month + delta, 1);
    onNavigate(
      new URLSearchParams({
        space: spaceId,
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      })
    );
  }

  // Build weeks grid
  const firstDow = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  function dayItems(d: Date) {
    const dayStart = d.getTime();
    const dayEnd = dayStart + 86400000;
    return {
      bookings: bookings.filter(
        (b) => new Date(b.start).getTime() < dayEnd && new Date(b.end).getTime() > dayStart
      ),
      blocks: blocks.filter(
        (b) => new Date(b.start).getTime() < dayEnd && new Date(b.end).getTime() > dayStart
      ),
    };
  }

  async function submitBlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/host/calendar/block", {
        spaceId,
        start: `${form.date}T${form.startTime}`,
        end: `${form.date}T${form.endTime}`,
        reason: form.reason,
      });
      setBlockOpen(false);
      toast.success("Period blocked.");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(id: string) {
    try {
      await api.delete(`/host/calendar/block/${id}`);
      toast.success("Period unblocked.");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selItems = selectedDay ? dayItems(selectedDay) : null;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-72">
          <label htmlFor="cal-space" className="sr-only">Listing</label>
          <Select
            id="cal-space"
            value={spaceId}
            onChange={(e) => onNavigate(new URLSearchParams({ space: e.target.value }))}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => nav(-1)}
            aria-label="Previous month"
            className="rounded-xl border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-slate-900">{label}</span>
          <button
            onClick={() => nav(1)}
            aria-label="Next month"
            className="rounded-xl border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <Button
            size="sm"
            onClick={() => {
              setForm((f) => ({ ...f, date: new Date().toISOString().slice(0, 10) }));
              setBlockOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Block period
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} className="min-h-20 border-b border-r border-slate-100 bg-slate-50/40" />;
            const items = dayItems(d);
            const isToday = d.getTime() === today.getTime();
            const isSelected = selectedDay?.getTime() === d.getTime();
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelectedDay(isSelected ? null : d)}
                aria-label={`${d.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}: ${items.bookings.length} bookings, ${items.blocks.length} blocked periods`}
                className={cn(
                  "min-h-20 border-b border-r border-slate-100 p-1.5 text-left align-top transition-colors last:border-r-0 hover:bg-brand-50/40",
                  isSelected && "bg-brand-50 ring-1 ring-inset ring-brand-400"
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday ? "bg-brand-700 text-white" : "text-slate-600"
                  )}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {items.bookings.slice(0, 2).map((b) => (
                    <span
                      key={b.id}
                      className="block truncate rounded bg-brand-100 px-1 py-0.5 text-[10px] font-medium text-brand-900"
                    >
                      {formatTime(new Date(b.start))} {b.code}
                    </span>
                  ))}
                  {items.bookings.length > 2 && (
                    <span className="block text-[10px] text-slate-400">+{items.bookings.length - 2} more</span>
                  )}
                  {items.blocks.map((b) => (
                    <span
                      key={b.id}
                      className="flex items-center gap-0.5 truncate rounded bg-slate-200 px-1 py-0.5 text-[10px] font-medium text-slate-600"
                    >
                      <Lock className="size-2.5 shrink-0" aria-hidden />
                      Blocked
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && selItems && (
        <div className="glass rounded-2xl p-5 animate-fade-in">
          <h3 className="font-semibold text-slate-900">
            {selectedDay.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {selItems.bookings.length === 0 && selItems.blocks.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Fully available — no bookings or blocks.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {selItems.bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-2.5 text-sm">
                  <span className="font-medium text-brand-900">
                    {b.code} · {formatTime(new Date(b.start))} – {formatTime(new Date(b.end))}
                  </span>
                  <span className="text-xs text-brand-700">{b.status}</span>
                </div>
              ))}
              {selItems.blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2.5 text-sm">
                  <span className="text-slate-700">
                    <Lock className="mr-1 inline size-3.5" aria-hidden />
                    Blocked: {formatDateTime(new Date(b.start))} – {formatTime(new Date(b.end))}
                    {b.reason && <span className="text-slate-400"> · {b.reason}</span>}
                  </span>
                  <button
                    onClick={() => removeBlock(b.id)}
                    aria-label="Remove this block"
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => {
              setForm((f) => ({
                ...f,
                date: `${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, "0")}-${String(selectedDay.getDate()).padStart(2, "0")}`,
              }));
              setBlockOpen(true);
            }}
          >
            <Lock className="size-3.5" aria-hidden />
            Block time on this day
          </Button>
        </div>
      )}

      {/* Block dialog */}
      <Dialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="Block a period"
        description="Drivers won't be able to book during blocked times."
      >
        <form onSubmit={submitBlock} className="space-y-4">
          <div>
            <Label htmlFor="blk-date">Date</Label>
            <Input
              id="blk-date"
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="blk-start">From</Label>
              <Input
                id="blk-start"
                type="time"
                required
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="blk-end">Until</Label>
              <Input
                id="blk-end"
                type="time"
                required
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="blk-reason" hint="(optional)">Reason</Label>
            <Input
              id="blk-reason"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Family visiting"
              maxLength={200}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setBlockOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Block period
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
