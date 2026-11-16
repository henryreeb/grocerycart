import { describe, expect, test } from "vitest";
import worker from "../../src/worker";

const env = { APP_ORIGIN: "https://cart.example", ASSETS: { fetch: () => Promise.resolve(new Response("app")) } } as never;

describe("worker security boundary", () => {
  test("sets browser security and no-store headers", async () => {
    const response = await worker.fetch(new Request("https://cart.example/api/health"), env, {} as never);

    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("content-security-policy")).toContain("img-src 'self' data: https:");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("rejects cross-origin state changes", async () => {
    const response = await worker.fetch(new Request("https://cart.example/api/health", { method: "POST", headers: { origin: "https://evil.example" } }), env, {} as never);

    expect(response.status).toBe(403);
  });

  test("allows same-origin state changes when local Wrangler has no APP_ORIGIN", async () => {
    const localEnv = { ASSETS: { fetch: () => Promise.resolve(new Response("app")) } } as never;
    const response = await worker.fetch(new Request("http://localhost:8787/api/health", { method: "POST", headers: { origin: "http://localhost:8787" } }), localEnv, {} as never);

    expect(response.status).toBe(200);
  });

  test("allows credential-authenticated extension pairing through the Worker boundary", async () => {
    const db = { prepare: () => ({ bind() { return this; }, first: async () => null }) };
    const response = await worker.fetch(new Request("https://cart.example/api/extension/pair", { method: "POST", headers: { origin: "chrome-extension://test", "content-type": "application/json" }, body: JSON.stringify({ code: "bad" }) }), { APP_ORIGIN: "https://cart.example", ASSETS: { fetch: () => Promise.resolve(new Response("app")) }, DB: db } as never, {} as never);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid pairing code" });
  });
});
