import * as React from "react";
import { api, errorMessage } from "@/services/api";
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
}

export default function AdminUsersPage() {
  const { user: admin } = useAuth();
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);

  const load = React.useCallback(() => {
    api.get("/admin/users").then(({ data }) => setUsers(data.data.users)).catch(() => setUsers([]));
  }, []);

  React.useEffect(() => {
    document.title = "Users — Admin · Parkly";
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
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">{users.length} accounts</p>
      </div>
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
              <th className="px-5 py-3.5 font-medium">User</th>
              <th className="px-5 py-3.5 font-medium">Role</th>
              <th className="px-5 py-3.5 font-medium">Joined</th>
              <th className="px-5 py-3.5 font-medium">Bookings</th>
              <th className="px-5 py-3.5 font-medium">Listings</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
              <th className="px-5 py-3.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} image={u.image} size={32} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{u.name ?? "—"}</p>
                      <p className="truncate text-xs text-slate-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={u.role === "ADMIN" ? "danger" : "neutral"}>{u.role}</Badge>
                  {u.hostVerified && <Badge variant="brand" className="ml-1">Verified host</Badge>}
                </td>
                <td className="px-5 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
                <td className="px-5 py-3 text-slate-600">{u.bookings}</td>
                <td className="px-5 py-3 text-slate-600">{u.listings}</td>
                <td className="px-5 py-3">
                  <Badge variant={u.status === "ACTIVE" ? "success" : "danger"}>{u.status}</Badge>
                </td>
                <td className="px-5 py-3">
                  <UserActions
                    userId={u.id}
                    status={u.status}
                    role={u.role}
                    hostVerified={u.hostVerified}
                    isSelf={u.id === admin?.id}
                    onChanged={load}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserActions({
  userId,
  status,
  role,
  hostVerified,
  isSelf,
  onChanged,
}: {
  userId: string;
  status: string;
  role: string;
  hostVerified: boolean;
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
    <div className="flex items-center gap-2">
      {status === "ACTIVE" ? (
        <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => setConfirm("suspend")}>
          Suspend
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => run(() => api.post(`/admin/users/${userId}/status`, { status: "ACTIVE" }), "Account reactivated.")}
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
              () => api.post(`/admin/users/${userId}/verify-host`, { verified: !hostVerified }),
              hostVerified ? "Host verification removed." : "Host marked verified."
            )
          }
        >
          {hostVerified ? "Unverify" : "Verify host"}
        </Button>
      )}
      <ConfirmDialog
        open={confirm === "suspend"}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => api.post(`/admin/users/${userId}/status`, { status: "SUSPENDED" }), "Account suspended.")}
        loading={busy}
        danger
        title="Suspend this account?"
        description="The user will be logged out and unable to sign in until reactivated."
        confirmLabel="Suspend account"
      />
    </div>
  );
}
