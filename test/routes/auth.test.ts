import { describe, expect, test } from "vitest";
import { hashPassword } from "../../src/auth/password";
import { handleAuth } from "../../src/routes/auth";

function authEnv(passwordHash: string) {
  let failures = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM households")) return { password_hash: passwordHash };
              if (sql.includes("FROM login_attempts")) return { failures };
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO login_attempts")) failures += 1;
              if (sql.includes("DELETE FROM login_attempts")) failures = 0;
              return { success: true, meta: {}, results: values };
            }
          };
        }
      };
    }
  };
  return { DB: db, SESSION_SECRET: "a-test-secret-long-enough-for-hmac", APP_ORIGIN: "https://cart.example" } as never;
}

describe("auth routes", () => {
  test("sets a hardened cookie after a correct login", async () => {
    const env = authEnv(await hashPassword("family-password", new Uint8Array(16).fill(3)));
    const request = new Request("https://cart.example/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.8" },
      body: JSON.stringify({ password: "family-password" })
    });

    const response = await handleAuth(request, env, new Date("2026-11-12T14:00:00Z"));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Strict");
  });

  test("rejects missing CSRF on logout", async () => {
    const env = authEnv(await hashPassword("family-password", new Uint8Array(16).fill(3)));
    const response = await handleAuth(new Request("https://cart.example/api/logout", { method: "POST" }), env);

    expect(response.status).toBe(403);
  });

  test("throttles the sixth failed login from one address", async () => {
    const env = authEnv(await hashPassword("family-password", new Uint8Array(16).fill(3)));
    let response = new Response();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await handleAuth(new Request("https://cart.example/api/login", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.8" },
        body: JSON.stringify({ password: "wrong" })
      }), env);
    }

    expect(response.status).toBe(429);
  });
});
