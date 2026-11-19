import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError, NETWORK_MESSAGE, TIMEOUT_MESSAGE, createApiClient, loginFailureMessage, messageFrom } from "./client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  it("sends JSON and returns the data envelope", async () => {
    const client = createApiClient({
      baseUrl: "https://api.example.test/api",
      fetchImpl: async (input, init) => {
        assert.equal(String(input), "https://api.example.test/api/auth/login");
        assert.equal(init?.method, "POST");
        assert.equal(new Headers(init?.headers).get("Authorization"), null);
        assert.deepEqual(JSON.parse(String(init?.body)), { email: "a@b.co" });
        return jsonResponse(200, { success: true, data: { ok: true } });
      },
    });
    const data = await client.request<{ ok: boolean }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email: "a@b.co" },
    });
    assert.equal(data.ok, true);
  });

  it("attaches a bearer token without putting it in the error", async () => {
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/",
      getAccessToken: async () => "session-token",
      fetchImpl: async (_input, init) => {
        assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer session-token");
        return jsonResponse(401, { success: false, message: "Your session has expired. Please log in again." });
      },
    });
    await assert.rejects(
      () => client.request("/auth/me"),
      (err: unknown) => {
        assert.ok(err instanceof ApiRequestError);
        assert.equal(err.status, 401);
        assert.equal(err.message, "Your session has expired. Please log in again.");
        assert.equal(err.message.includes("session-token"), false);
        return true;
      }
    );
  });

  it("maps validation errors and network failures", async () => {
    const invalid = createApiClient({
      baseUrl: "https://api.example.test/api",
      fetchImpl: async () =>
        jsonResponse(400, { success: false, message: "Enter a valid email", errors: { email: ["Enter a valid email"] } }),
    });
    await assert.rejects(
      () => invalid.request("/auth/login", { method: "POST", auth: false, body: {} }),
      (err: unknown) => {
        assert.ok(err instanceof ApiRequestError);
        assert.equal(err.fieldErrors.email, "Enter a valid email");
        return true;
      }
    );

    const offline = createApiClient({
      baseUrl: "https://api.example.test/api",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await assert.rejects(() => offline.request("/auth/me"), (err: unknown) => {
      assert.ok(err instanceof ApiRequestError);
      assert.equal(err.message, NETWORK_MESSAGE);
      return true;
    });
  });

  it("maps an aborted request to the timeout message", async () => {
    const client = createApiClient({
      baseUrl: "https://api.example.test/api",
      timeoutMs: 5,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });
    await assert.rejects(() => client.request("/auth/me"), (err: unknown) => {
      assert.ok(err instanceof ApiRequestError);
      assert.equal(err.message, TIMEOUT_MESSAGE);
      return true;
    });
  });

  it("keeps an API message and includes the status when the body is not JSON", () => {
    assert.equal(messageFrom({ success: false, message: "Incorrect email or password.", code: "AUTH" }, 401), "Incorrect email or password.");
    assert.equal(messageFrom(null, 404), "The server returned 404. Please try again.");
    assert.equal(loginFailureMessage(new ApiRequestError("Incorrect email or password.", 401)), "Incorrect email or password.");
    assert.match(loginFailureMessage(new Error("Set EXPO_PUBLIC_API_URL to the API origin, including /api.")), /EXPO_PUBLIC_API_URL/);
    assert.equal(loginFailureMessage(new Error("unexpected")), "Something went wrong. Please try again.");
  });
});
