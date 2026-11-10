import * as React from "react";
import { trackParkingSearch } from "@/lib/ga";
import { api } from "@/services/api";
import type { SpaceSummary } from "@/types";

export type SearchLocationState = {
  results?: SpaceSummary[];
  searchKey?: string;
  editSearch?: boolean;
};

export function useParkingSearch(
  paramString: string,
  seedKey?: string | null,
  seedResults?: SpaceSummary[] | null
) {
  const seeded = seedKey === paramString && seedResults ? seedResults : null;
  const [spaces, setSpaces] = React.useState<SpaceSummary[] | null>(seeded);
  const [apiDestination, setApiDestination] = React.useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [pending, setPending] = React.useState(seeded == null);

  React.useEffect(() => {
    if (seedKey === paramString && seedResults) {
      setSpaces(seedResults);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    setApiDestination(null);
    const qs = new URLSearchParams(paramString);
    if (qs.get("start") && !qs.get("durationMins")) qs.set("durationMins", "120");
    api
      .get(`/parking/search?${qs.toString()}`)
      .then(({ data }) => {
        if (cancelled) return;
        const results = Array.isArray(data.data.results) ? (data.data.results as SpaceSummary[]) : [];
        setSpaces(results);
        if (qs.get("q") || (qs.get("lat") && qs.get("lng"))) trackParkingSearch(results.length);
        const center = data.data.center as { lat: number; lng: number } | null;
        setApiDestination(center ? { ...center, name: data.data.resolvedArea ?? qs.get("q") ?? undefined } : null);
      })
      .catch(() => {
        if (!cancelled) setSpaces([]);
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
    // seedResults is read only when seedKey matches this query, so a new array
    // identity must not start another request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramString, seedKey]);

  return { spaces, apiDestination, pending };
}
