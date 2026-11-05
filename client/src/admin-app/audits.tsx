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
      <h1 className="text-xl font-semibold">Audit log</h1>
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-[#C7D1DD] bg-white px-4 py-3 text-sm">
            {row.createdAt} · {row.action} · {row.outcome}
          </li>
        ))}
      </ul>
    </section>
  );
}
