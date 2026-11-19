import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCESS_TOKEN_KEY, createMemoryTokenStore, createSecureTokenStore } from "./token-store";

describe("token store", () => {
  it("keeps the access token only in the secure key", async () => {
    const saved = new Map<string, string>();
    const store = createSecureTokenStore({
      async getItemAsync(key) {
        return saved.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        saved.set(key, value);
      },
      async deleteItemAsync(key) {
        saved.delete(key);
      },
    });
    assert.equal(await store.get(), null);
    await store.set("access-jwt");
    assert.deepEqual([...saved.keys()], [ACCESS_TOKEN_KEY]);
    assert.equal(await store.get(), "access-jwt");
    await store.clear();
    assert.equal(saved.size, 0);
  });

  it("uses memory only inside tests", async () => {
    const store = createMemoryTokenStore();
    await store.set("one");
    assert.equal(await store.get(), "one");
    await store.clear();
    assert.equal(await store.get(), null);
  });
});
