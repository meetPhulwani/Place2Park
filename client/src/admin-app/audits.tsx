import * as React from "react";
import { consoleApi } from "@/services/console-api";

export function AuditsPage() {
  const [rows, setRows] = React.useState<Array<{ id: string; action: string; outcome: string; createdAt: string }>>([]);
  React.useEffect(() => {
    consoleApi.get("/audits").then(({ data }) => {
      const audits = (data.data.audits as Array<{ _id: string; action: string; outcome: string; createdAt: string }>).map((row) => ({
        id: row._id,
        action: row.action,
        outcome: row.outcome,
        createdAt: row.createdAt,
      }));
      setRows(audits);
    }).catch(() => setRows([]));
  }, []);
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">Security</p>
      <h1 className="mt-1 text-3xl font-bold">Audit log</h1>
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="p2p-card px-4 py-3 text-sm">
            {row.createdAt} · {row.action} · {row.outcome}
          </li>
        ))}
      </ul>
    </section>
  );
}
