import { describe, expect, test } from "vitest";
import { createSession, sessionCookie } from "../../src/auth/session";
import { handleProducts, productSearchInput } from "../../src/routes/products";

describe("product search input", () => {
  test("trims a valid term and caps the result limit", () => {
    expect(productSearchInput(new URL("https://cart.example/api/products?q=%20milk%20&limit=500"))).toEqual({ term: "milk", limit: 50 });
  });

  test("rejects empty and single-character terms", () => {
    expect(() => productSearchInput(new URL("https://cart.example/api/products?q=%20"))).toThrow("Search term");
    expect(() => productSearchInput(new URL("https://cart.example/api/products?q=m"))).toThrow("Search term");
  });

  test("requires an authenticated household session", async () => {
    const response = await handleProducts(new Request("https://cart.example/api/products?q=milk"), { SESSION_SECRET: "secret" } as never, async () => { throw new Error("must not load"); });

    expect(response.status).toBe(401);
  });

  test("forces the preferred store when searching", async () => {
    const secret = "a-test-secret-long-enough-for-hmac";
    const token = await createSession(secret);
    const calls: unknown[][] = [];
    const client = { async searchProducts(...args: unknown[]) { calls.push(args); return [{ id: "p1" }]; } };
    const env = { SESSION_SECRET: secret, DB: { prepare: () => ({ bind: () => ({ first: async () => ({ preferred_store_id: "01400513" }) }) }) } } as never;
    const request = new Request("https://cart.example/api/products?q=milk", { headers: { cookie: sessionCookie(token).split(";")[0]! } });

    const response = await handleProducts(request, env, async () => client as never);

    expect(response.status).toBe(200);
    expect(calls).toEqual([["milk", "01400513", 10]]);
  });
});
