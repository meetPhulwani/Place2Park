import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError, type ApiClient } from "./client";
import { fetchFavorites, searchParking, suggestPlaces, toggleFavorite } from "./parking";

function client(handler: (path: string, body: unknown) => unknown): ApiClient {
  return {
    async request(path, options) {
      return handler(path, options?.body) as never;
    },
  };
}

describe("parking API", () => {
  it("searches and suggests through the existing routes", async () => {
    const paths: string[] = [];
    const api = client((path) => {
      paths.push(path);
      if (path.startsWith("/parking/search")) {
        return {
          results: [
            {
              id: "abc",
              title: "Bay",
              pricePerHour: 4000,
              latitude: 19.1,
              longitude: 72.8,
              displayLocation: "Bandra, Mumbai",
              vehicleTypes: "CAR",
            },
          ],
          center: { lat: 19.1, lng: 72.8 },
          resolvedArea: "Bandra",
        };
      }
      return { predictions: [{ id: "p1", mainText: "Bandra", secondaryText: "Mumbai", lat: 19.1, lng: 72.8 }] };
    });
    const found = await searchParking(api, "q=Bandra");
    const suggestions = await suggestPlaces(api, "Ba");
    assert.equal(found.results[0]?.title, "Bay");
    assert.equal(suggestions[0]?.mainText, "Bandra");
    assert.deepEqual(paths, ["/parking/search?q=Bandra", "/parking/places/suggest?q=Ba"]);
  });

  it("saves and removes a listing through the existing toggle", async () => {
    const bodies: unknown[] = [];
    let saved = false;
    const api = client((path, body) => {
      if (path === "/favorites") {
        return {
          spaces: saved
            ? [{ id: "abc", title: "Bay", pricePerHour: 4000, latitude: 19.1, longitude: 72.8, displayLocation: "Bandra" }]
            : [],
        };
      }
      bodies.push(body);
      saved = !saved;
      return { favorited: saved };
    });
    assert.equal(await toggleFavorite(api, "abc"), true);
    assert.equal((await fetchFavorites(api)).length, 1);
    assert.equal(await toggleFavorite(api, "abc"), false);
    assert.deepEqual(bodies, [{ spaceId: "abc" }, { spaceId: "abc" }]);
    assert.equal((await fetchFavorites(api)).length, 0);
  });

  it("leaves an expired session as a 401", async () => {
    const api: ApiClient = {
      async request() {
        throw new ApiRequestError("Your session has expired. Please log in again.", 401);
      },
    };
    await assert.rejects(() => fetchFavorites(api), (err: unknown) => err instanceof ApiRequestError && err.status === 401);
  });
});
