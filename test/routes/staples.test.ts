import { describe, expect, test } from "vitest";
import { createCsrfToken } from "../../src/auth/csrf";
import { createSession, sessionCookie } from "../../src/auth/session";
import { handleStaples } from "../../src/routes/staples";

describe("staple routes", () => {
  test("returns frequency suggestions from an authenticated two-month import", async () => {
    const secret = "a-test-secret-long-enough-for-hmac";
    const token = await createSession(secret);
    const request = new Request("https://cart.example/api/staples/suggest", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie(token).split(";")[0]!, "x-csrf-token": await createCsrfToken(secret, token) },
      body: JSON.stringify({ purchases: [
        { orderId: "a", orderedAt: "2026-11-01T12:00:00Z", productId: "milk", description: "Milk" },
        { orderId: "b", orderedAt: "2026-10-20T12:00:00Z", productId: "milk", description: "Milk" },
        { orderId: "c", orderedAt: "2026-10-05T12:00:00Z", productId: "milk", description: "Milk" }
      ] })
    });

    const response = await handleStaples(request, { SESSION_SECRET: secret } as never, new Date("2026-11-12T12:00:00Z"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ suggestions: [{ productId: "milk", category: "core" }] });
  });

  test("reads stored purchase imports and persists approved staple quantities", async () => {
    const secret = "a-test-secret-long-enough-for-hmac";
    const token = await createSession(secret);
    let approved: unknown[] = [];
    const db = { prepare(sql: string) { let values: unknown[] = []; return { bind(...bound: unknown[]) { values = bound; return this; }, async all() { return { results: [{ payload_json: JSON.stringify([{ orderId: "a", orderedAt: "2026-11-01T12:00:00Z", productId: "milk", description: "Milk" }]) }], success: true, meta: {} }; }, async first() { return sql.includes("FROM products") ? { id: "milk" } : null; }, async run() { if (sql.includes("INSERT INTO staples")) approved = values; return { success: true, meta: {} }; } }; } };
    const cookie = sessionCookie(token).split(";")[0]!;
    const suggestions = await handleStaples(new Request("https://cart.example/api/staples/suggestions", { headers: { cookie } }), { DB: db, SESSION_SECRET: secret } as never, new Date("2026-11-12T12:00:00Z"));
    const approval = await handleStaples(new Request("https://cart.example/api/staples", { method: "POST", headers: { cookie, "content-type": "application/json", "x-csrf-token": await createCsrfToken(secret, token) }, body: JSON.stringify({ productId: "milk", quantity: 2 }) }), { DB: db, SESSION_SECRET: secret } as never);

    expect(await suggestions.json()).toMatchObject({ suggestions: [{ productId: "milk" }] });
    expect(approval.status).toBe(201);
    expect(approved).toEqual(["milk", 2]);
  });
});
