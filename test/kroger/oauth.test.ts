import { describe, expect, test } from "vitest";
import { buildAuthorizationUrl, createPkce, decryptToken, encryptToken, exchangeAuthorizationCode, validateOAuthState } from "../../src/kroger/oauth";
import { vi } from "vitest";

const key = "MDAxMTIyMzM0NDU1NjY3Nzg4OTlhYWJiY2NkZGVlZmY";

describe("Kroger OAuth", () => {
  test("creates S256 PKCE values", async () => {
    const pkce = await createPkce(new Uint8Array(32).fill(9));

    expect(pkce.verifier).toHaveLength(43);
    expect(pkce.challenge).not.toBe(pkce.verifier);
  });

  test("builds authorization URL with state and required scopes", () => {
    const url = new URL(buildAuthorizationUrl({ clientId: "client", redirectUri: "https://cart.example/api/oauth/callback", state: "state", challenge: "challenge" }));

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("cart.basic:write product.compact profile.compact");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  test("encrypts refresh tokens with authenticated encryption", async () => {
    const encrypted = await encryptToken("refresh-secret", key, new Uint8Array(12).fill(4));

    expect(encrypted).not.toContain("refresh-secret");
    await expect(decryptToken(encrypted, key)).resolves.toBe("refresh-secret");
    await expect(decryptToken(`${encrypted}x`, key)).rejects.toThrow();
  });

  test("rejects mismatched and expired OAuth state", () => {
    const record = { state: "expected", expiresAt: "2026-11-12T14:05:00.000Z" };

    expect(() => validateOAuthState("wrong", record, new Date("2026-11-12T14:00:00Z"))).toThrow("state");
    expect(() => validateOAuthState("expected", record, new Date("2026-11-12T14:05:01Z"))).toThrow("expired");
  });

  test("exchanges a code with PKCE and basic client authentication", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 1800 }));

    const tokens = await exchangeAuthorizationCode({ code: "code", verifier: "verifier", clientId: "client", clientSecret: "secret", redirectUri: "https://cart.example/callback" }, fetcher);

    const request = fetcher.mock.calls[0]!;
    expect(new URLSearchParams(request[1]!.body as string).get("code_verifier")).toBe("verifier");
    expect(new Headers(request[1]!.headers).get("authorization")).toBe(`Basic ${btoa("client:secret")}`);
    expect(tokens.refreshToken).toBe("refresh");
  });
});
