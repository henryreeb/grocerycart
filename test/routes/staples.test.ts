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
});
