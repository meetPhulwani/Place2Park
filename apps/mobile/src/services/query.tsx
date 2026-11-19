import { useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiRequestError } from "../api/client";
import { useAuth } from "./auth-context";

export function isExpiredSession(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (isExpiredSession(error)) return false;
        if (error instanceof Error && error.name === "AbortError") return false;
        return failureCount < 1;
      },
      staleTime: 30_000,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function useExpireSession(error: unknown) {
  const { logout } = useAuth();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !isExpiredSession(error)) return;
    handled.current = true;
    void logout();
  }, [error, logout]);
}
