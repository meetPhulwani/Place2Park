import * as React from "react";
import { consoleApi, errorMessage } from "@/services/console-api";
import { useAuth } from "@/context/auth";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  status: string;
  hostVerified: boolean;
  createdAt: string;
  bookings: number;
  listings: number;
  payoutSubmitted?: boolean;
  payoutVerified?: boolean;
}

export default function AdminUsersPage() {
  const { user: admin } = useAuth();
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<AdminUser | null>(null);

  const load = React.useCallback(() => {
    consoleApi.get("/users").then(({ data }) => setUsers(data.data.users)).catch(() => setUsers([]));
  }, []);

  React.useEffect(() => {
    document.title = "Users — Admin · Place2Park";
    load();
  }, [load]);

  if (users === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">Directory</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[#111827]">Users</h1>
        <p className="mt-1 text-sm text-slate-500">{users.length} accounts</p>
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name or email"
        className="h-11 w-full max-w-md rounded-xl border border-[#C7D1DD] bg-white px-3 text-sm"
      />
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
              <th className="px-5 py-3.5 text-left font-medium">User</th>
              <th className="px-5 py-3.5 text-left font-medium">Role</th>
              <th className="px-5 py-3.5 text-left font-medium">Joined</th>
              <th className="px-5 py-3.5 text-right font-medium">Bookings</th>
              <th className="px-5 py-3.5 text-right font-medium">Listings</th>
              <th className="px-5 py-3.5 text-left font-medium">Status</th>
              <th className="px-5 py-3.5 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.filter((user) => `${user.name ?? ""} ${user.email}`.toLowerCase().includes(query.trim().toLowerCase())).map((u) => (
              <tr key={u.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60" onClick={() => setSelected(u)}>
                <td className="px-5 py-3 align-middle">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} image={u.image} size={36} />
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-5 text-slate-900">{u.name ?? "—"}</p>
                      <p className="truncate text-xs leading-4 text-slate-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 align-middle">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={u.role === "ADMIN" ? "danger" : "neutral"}>{u.role}</Badge>
                    {u.hostVerified && <Badge variant="brand">Verified host</Badge>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-5 py-3 align-middle text-slate-500">{formatDate(u.createdAt)}</td>
                <td className="px-5 py-3 text-right align-middle tabular-nums text-slate-600">{u.bookings}</td>
                <td className="px-5 py-3 text-right align-middle tabular-nums text-slate-600">{u.listings}</td>
                <td className="px-5 py-3 align-middle">
                  <Badge variant={u.status === "ACTIVE" ? "success" : "danger"}>{u.status}</Badge>
                </td>
                <td className="whitespace-nowrap px-5 py-3 align-middle" onClick={(event) => event.stopPropagation()}>
                  <UserActions
                    userId={u.id}
                    status={u.status}
                    role={u.role}
                    hostVerified={u.hostVerified}
                    payoutVerified={!!u.payoutVerified}
                    payoutSubmitted={!!u.payoutSubmitted}
                    isSelf={u.id === admin?.id}
                    onChanged={load}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#012456]/30" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-pop" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">{selected.name ?? "User"}</h2>
                <p className="text-sm text-[#64748b]">{selected.email}</p>
              </div>
              <button type="button" className="text-sm font-semibold text-[#0251B0]" onClick={() => setSelected(null)}>Close</button>
            </div>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between"><dt>Role</dt><dd>{selected.role}</dd></div>
              <div className="flex justify-between"><dt>Status</dt><dd>{selected.status}</dd></div>
              <div className="flex justify-between"><dt>Joined</dt><dd>{formatDate(selected.createdAt)}</dd></div>
              <div className="flex justify-between"><dt>Bookings</dt><dd>{selected.bookings}</dd></div>
              <div className="flex justify-between"><dt>Listings</dt><dd>{selected.listings}</dd></div>
            </dl>
            <div className="mt-6" onClick={(event) => event.stopPropagation()}>
              <UserActions
                userId={selected.id}
                status={selected.status}
                role={selected.role}
                hostVerified={selected.hostVerified}
                payoutVerified={!!selected.payoutVerified}
                payoutSubmitted={!!selected.payoutSubmitted}
                isSelf={selected.id === admin?.id}
                onChanged={load}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function UserActions({
  userId,
  status,
  role,
  hostVerified,
  payoutVerified,
  payoutSubmitted,
  isSelf,
  onChanged,
}: {
  userId: string;
  status: string;
  role: string;
  hostVerified: boolean;
  payoutVerified: boolean;
  payoutSubmitted: boolean;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = React.useState<null | "suspend">(null);
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Action failed."));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (isSelf || role === "ADMIN") return <span className="text-xs text-slate-300">—</span>;

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {status === "ACTIVE" ? (
        <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => setConfirm("suspend")}>
          Suspend
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => run(() => consoleApi.post(`/users/${userId}/status`, { status: "ACTIVE" }), "Account reactivated.")}
        >
          Reactivate
        </Button>
      )}
      {["HOST", "BOTH"].includes(role) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              () => consoleApi.post(`/users/${userId}/verify-host`, { verified: !hostVerified }),
              hostVerified ? "Host verification removed." : "Host marked verified."
            )
          }
        >
          {hostVerified ? "Unverify" : "Verify host"}
        </Button>
      )}
      {payoutSubmitted && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              () => consoleApi.post(`/users/${userId}/verify-payout`, { verified: !payoutVerified }),
              payoutVerified ? "Payout details unverified." : "Payout details verified."
            )
          }
        >
          {payoutVerified ? "Unverify payout" : "Verify payout"}
        </Button>
      )}
      <ConfirmDialog
        open={confirm === "suspend"}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => consoleApi.post(`/users/${userId}/status`, { status: "SUSPENDED" }), "Account suspended.")}
        loading={busy}
        danger
        title="Suspend this account?"
        description="The user will be logged out and unable to sign in until reactivated."
        confirmLabel="Suspend account"
      />
    </div>
  );
}
