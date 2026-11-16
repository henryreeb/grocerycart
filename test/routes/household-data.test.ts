import { describe, expect, test } from "vitest";
import { createCsrfToken } from "../../src/auth/csrf";
import { hashPassword } from "../../src/auth/password";
import { createSession, sessionCookie } from "../../src/auth/session";
import { handleHouseholdData } from "../../src/routes/household-data";
import type { Env } from "../../src/config";

async function dataEnv() {
  const passwordHash = await hashPassword("family password");
  const deleted: string[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind() { return this; },
        async first() { return sql.includes("password_hash") ? { password_hash: passwordHash } : null; },
        async all() {
          if (sql.includes("FROM products")) return { results: [{ id: "p1", upc: "0001", description: "Milk", image_url: "https://www.kroger.com/milk.jpg" }], success: true, meta: {} };
          if (sql.includes("FROM weekly_drafts")) return { results: [{ id: 1, draft_week: "2026-11-09", status: "draft" }], success: true, meta: {} };
          return { results: [], success: true, meta: {} };
        },
        async run() { deleted.push(sql); return { success: true, meta: {} }; }
      };
    },
    async batch(statements: unknown[]) { deleted.push(...statements.map(() => "batched")); return statements.map(() => ({ success: true, meta: {} })); }
  };
  return { env: { DB: db, SESSION_SECRET: "session-secret", TOKEN_ENCRYPTION_KEY: "never-export", KROGER_CLIENT_SECRET: "never-export" } as unknown as Env, deleted };
}

async function request(method: string, secret: string, body?: unknown) {
  const token = await createSession(secret);
  return new Request("https://cart.example/api/household-data", {
    method,
    headers: { cookie: sessionCookie(token).split(";")[0]!, "content-type": "application/json", ...(method === "POST" ? { "x-csrf-token": await createCsrfToken(secret, token) } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

describe("household data route", () => {
  test("exports only household grocery records, never credentials or tokens", async () => {
    const { env } = await dataEnv();
    const response = await handleHouseholdData(await request("GET", env.SESSION_SECRET), env);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Milk");
    expect(text).toContain("https://www.kroger.com/milk.jpg");
    expect(text).not.toMatch(/password_hash|oauth|nonce|never-export/i);
  });

  test("requires password reauthentication and explicit confirmation before deletion", async () => {
    const { env } = await dataEnv();
    const missing = await handleHouseholdData(await request("POST", env.SESSION_SECRET, { password: "family password" }), env);
    const wrong = await handleHouseholdData(await request("POST", env.SESSION_SECRET, { password: "wrong", confirmation: "DELETE" }), env);

    expect(missing.status).toBe(400);
    expect(wrong.status).toBe(401);
  });

  test("deletes private household records after reauthentication", async () => {
    const { env, deleted } = await dataEnv();
    const response = await handleHouseholdData(await request("POST", env.SESSION_SECRET, { password: "family password", confirmation: "DELETE" }), env);

    expect(response.status).toBe(204);
    expect(deleted.length).toBeGreaterThan(5);
  });
});
