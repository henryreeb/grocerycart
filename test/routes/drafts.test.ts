import { describe, expect, test } from "vitest";
import { createCsrfToken } from "../../src/auth/csrf";
import { createSession, sessionCookie } from "../../src/auth/session";
import { handleDrafts } from "../../src/routes/drafts";
import type { Env } from "../../src/config";

function draftEnv(status = "draft") {
  const staged = new Map<string, number>();
  const db = {
    async batch(statements: Array<{ run(): Promise<unknown> }>) { return Promise.all(statements.map((statement) => statement.run())); },
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async first() {
          if (sql.includes("ORDER BY created_at DESC")) return { id: 1, draft_week: "2026-11-09", status: "draft" };
          if (sql.includes("FROM weekly_drafts")) return { status };
          if (sql.includes("FROM households")) return { preferred_store_id: "01400513" };
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO draft_items")) staged.set(String(values[1]), Number(values[2]));
          if (sql.includes("DELETE FROM draft_items")) staged.delete(String(values[1]));
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          return { success: true, meta: {}, results: [{ product_id: "p1", quantity: 2, description: "Milk", current_price_cents: 349 }] };
        }
      };
    }
  };
  return { env: { DB: db, SESSION_SECRET: "a-test-secret-long-enough-for-hmac" } as unknown as Env, staged };
}

async function authenticatedGet(secret: string) {
  const token = await createSession(secret);
  return new Request("https://cart.example/api/drafts/current", { headers: { cookie: sessionCookie(token).split(";")[0]! } });
}

async function authenticatedRequest(body: unknown, secret: string) {
  const token = await createSession(secret);
  return new Request("https://cart.example/api/drafts/1/items", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie(token).split(";")[0]!,
      "x-csrf-token": await createCsrfToken(secret, token)
    },
    body: JSON.stringify(body)
  });
}

async function authenticatedDelete(secret: string) {
  const token = await createSession(secret);
  return new Request("https://cart.example/api/drafts/1/items/p1", {
    method: "DELETE",
    headers: { cookie: sessionCookie(token).split(";")[0]!, "x-csrf-token": await createCsrfToken(secret, token) }
  });
}

describe("draft routes", () => {
  test("returns the current staged draft", async () => {
    const { env } = draftEnv();
    const response = await handleDrafts(await authenticatedGet(env.SESSION_SECRET), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ draft: { id: 1, items: [{ productId: "p1", quantity: 2 }] } });
  });

  test("stages an exact Kroger product in an editable draft", async () => {
    const { env, staged } = draftEnv();
    const client = { getProduct: async () => ({ id: "p1", upc: "0001", description: "Milk", brand: "Kroger", size: "1 gal", available: true, regularPriceCents: 399, promoPriceCents: 349, weightPriceCents: null, weightUnit: null }) };

    const response = await handleDrafts(await authenticatedRequest({ productId: "p1", quantity: 2 }, env.SESSION_SECRET), env, async () => client as never);

    expect(response.status).toBe(201);
    expect(staged.get("p1")).toBe(2);
  });

  test("rejects edits to a submitted draft", async () => {
    const { env } = draftEnv("submitted");
    const response = await handleDrafts(await authenticatedRequest({ productId: "p1", quantity: 2 }, env.SESSION_SECRET), env, async () => { throw new Error("must not load"); });

    expect(response.status).toBe(409);
  });

  test("rejects invalid quantities before contacting Kroger", async () => {
    const { env } = draftEnv();
    const response = await handleDrafts(await authenticatedRequest({ productId: "p1", quantity: 1.5 }, env.SESSION_SECRET), env, async () => { throw new Error("must not load"); });

    expect(response.status).toBe(400);
  });

  test("removes a staged item from an editable draft", async () => {
    const { env, staged } = draftEnv();
    staged.set("p1", 2);

    const response = await handleDrafts(await authenticatedDelete(env.SESSION_SECRET), env);

    expect(response.status).toBe(204);
    expect(staged.has("p1")).toBe(false);
  });
});
