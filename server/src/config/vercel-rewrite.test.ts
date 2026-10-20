import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { SERVER_ROOT } from "./paths.js";

describe("Vercel SPA rewrite", () => {
  it("rewrites client routes to index.html and does not send /api to the SPA", () => {
    const file = path.join(SERVER_ROOT, "..", "client", "vercel.json");
    assert.equal(fs.existsSync(file), true, "client/vercel.json must exist");
    const config = JSON.parse(fs.readFileSync(file, "utf8")) as {
      rewrites?: { source: string; destination: string }[];
    };
    const rewrites = config.rewrites ?? [];
    assert.ok(rewrites.some((r) => r.destination === "/index.html"));
    const spa = rewrites.find((r) => r.destination === "/index.html");
    assert.ok(spa?.source.includes("api"), "SPA rewrite must exclude /api");
    assert.ok(!rewrites.some((r) => r.source.startsWith("/api") && r.destination === "/index.html"));
  });
});
