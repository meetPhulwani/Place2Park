import { useMemo } from "react";
import { createApiClient } from "../api/client";
import { apiBaseUrl } from "../constants/env";
import { secureTokenStore } from "../lib/secure-storage";

export function useApiClient() {
  return useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: () => secureTokenStore.get() }),
    []
  );
}
