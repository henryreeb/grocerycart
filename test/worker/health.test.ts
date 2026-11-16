import { describe, expect, test } from "vitest";
import { createCsrfToken } from "../../src/auth/csrf";
import { createSession, sessionCookie } from "../../src/auth/session";
import worker from "../../src/worker";

describe("worker shell", () => {
  test("returns a minimal health response", async () => {
    const response = await worker.fetch(new Request("https://cart.example/api/health"), { KROGER_CLIENT_ID: "id", KROGER_CLIENT_SECRET: "secret" } as never, {} as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, krogerConfigured: true });
  });

  test("falls back to the static app binding", async () => {
    const assets = { fetch: () => Promise.resolve(new Response("app shell")) };
    const response = await worker.fetch(new Request("https://cart.example/"), { ASSETS: assets } as never, {} as never);

    expect(await response.text()).toBe("app shell");
  });

  test("routes the exact staple approval path to the API", async () => {
    const secret = "a-test-secret-long-enough-for-hmac";
    const token = await createSession(secret);
    const cookie = sessionCookie(token).split(";")[0]!;
    const db = { prepare: () => ({ bind() { return this; }, first: async () => ({ id: "milk" }), run: async () => ({ success: true, meta: { changes: 1 } }) }) };
    const request = new Request("https://cart.example/api/staples", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-csrf-token": await createCsrfToken(secret, token) },
      body: JSON.stringify({ productId: "milk", quantity: 1 })
    });
    const response = await worker.fetch(request, { DB: db, SESSION_SECRET: secret, ASSETS: { fetch: () => Promise.resolve(new Response()) } } as never, {} as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ staple: { productId: "milk", quantity: 1 } });
  });
});
