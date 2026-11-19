import type { ApiClient } from "./client";
import { parseFavoriteSpaces, parseListingDetail, parseSearchPayload } from "../lib/listings";
import { parsePredictions } from "../lib/search";
import type { ListingDetail, PlacePrediction, SearchCenter, SpaceSummary } from "../types/listing";

export async function searchParking(client: ApiClient, query: string, signal?: AbortSignal): Promise<{
  results: SpaceSummary[];
  center: SearchCenter | null;
  resolvedArea: string | null;
}> {
  const data = await client.request<unknown>(`/parking/search${query ? `?${query}` : ""}`, { signal });
  return parseSearchPayload(data);
}

export async function suggestPlaces(client: ApiClient, q: string, signal?: AbortSignal): Promise<PlacePrediction[]> {
  const data = await client.request<unknown>(`/parking/places/suggest?q=${encodeURIComponent(q)}`, { signal });
  return parsePredictions(data);
}

export async function fetchListing(client: ApiClient, id: string): Promise<ListingDetail> {
  const data = await client.request<unknown>(`/parking/${encodeURIComponent(id)}`);
  const listing = parseListingDetail(data);
  if (!listing) throw new Error("This listing could not be read.");
  return listing;
}

export async function fetchFavorites(client: ApiClient): Promise<SpaceSummary[]> {
  const data = await client.request<unknown>("/favorites");
  return parseFavoriteSpaces(data);
}

export async function toggleFavorite(client: ApiClient, spaceId: string): Promise<boolean> {
  const data = await client.request<unknown>("/favorites/toggle", { method: "POST", body: { spaceId } });
  if (typeof data !== "object" || data === null || typeof (data as { favorited?: unknown }).favorited !== "boolean") {
    throw new Error("The saved parking response was incomplete.");
  }
  return (data as { favorited: boolean }).favorited;
}
