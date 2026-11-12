import { describe, expect, test } from "vitest";
import { createSession, verifySession } from "../../src/auth/session";
import { createCsrfToken, verifyCsrfToken } from "../../src/auth/csrf";

const secret = "a-test-secret-long-enough-for-hmac";
const now = new Date("2026-11-12T14:00:00Z");

describe("sessions", () => {
  test("verifies an untampered session and rejects tampering", async () => {
    const token = await createSession(secret, now);

    expect((await verifySession(secret, token, now))?.expiresAt).toBe("2026-11-19T14:00:00.000Z");
    expect(await verifySession(secret, `${token}x`, now)).toBeNull();
  });

  test("rejects an expired session", async () => {
    const token = await createSession(secret, now);

    expect(await verifySession(secret, token, new Date("2026-11-19T14:00:01Z"))).toBeNull();
  });

  test("binds CSRF tokens to the session", async () => {
    const token = await createSession(secret, now);
    const csrf = await createCsrfToken(secret, token);

    expect(await verifyCsrfToken(secret, token, csrf)).toBe(true);
    expect(await verifyCsrfToken(secret, `${token}x`, csrf)).toBe(false);
  });
});
