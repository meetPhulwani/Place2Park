import * as React from "react";
import { consoleApi } from "@/services/console-api";
import { formatDateTime } from "@/lib/utils";

export function AuditsPage() {
  const [rows, setRows] = React.useState<Array<{ id: string; action: string; outcome: string; createdAt: string; target: string }>>([]);
  React.useEffect(() => {
    consoleApi.get("/audits").then(({ data }) => {
      const audits = (data.data.audits as Array<{ _id: string; action: string; outcome: string; createdAt: string; target?: string }>).map((row) => ({
        id: row._id,
        action: row.action,
        outcome: row.outcome,
        createdAt: row.createdAt,
        target: row.target ?? "",
      }));
      setRows(audits);
    }).catch(() => setRows([]));
  }, []);
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">System</p>
      <h2 className="mt-1 font-display text-3xl font-bold">Audit log</h2>
      <p className="mt-1 text-sm text-[#64748b]">Actions recorded for this console. Hashes and network details stay on the server.</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[#64748b]">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#E2E8F0]">
                <td className="px-4 py-3 text-[#64748b]">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3 font-medium">{row.action}</td>
                <td className="px-4 py-3">{row.target || "—"}</td>
                <td className="px-4 py-3">{row.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-8 text-sm text-[#64748b]">No audit events yet.</p>}
      </div>
    </section>
  );
}
