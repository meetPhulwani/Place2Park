import { Navigate, useLocation } from "react-router-dom";
import { useAuth, isHostRole } from "@/context/auth";
import { Skeleton } from "@/components/ui/skeleton";

/** Full-page loading shim while the session is being restored. */
export function AuthLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 sm:px-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

export function useGuard(requirement?: "host" | "admin") {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return { state: "loading" as const, user: null, redirect: null };
  if (!user)
    return {
      state: "redirect" as const,
      user: null,
      redirect: `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
    };
  if (requirement === "host" && !isHostRole(user.role))
    return { state: "redirect" as const, user: null, redirect: "/become-a-host" };
  if (requirement === "admin" && user.role !== "ADMIN")
    return { state: "redirect" as const, user: null, redirect: "/dashboard" };
  return { state: "ok" as const, user, redirect: null };
}

export function GuardGate({
  requirement,
  children,
}: {
  requirement?: "host" | "admin";
  children: React.ReactNode;
}) {
  const guard = useGuard(requirement);
  if (guard.state === "loading") return <AuthLoading />;
  if (guard.state === "redirect") return <Navigate to={guard.redirect!} replace />;
  return <>{children}</>;
}
