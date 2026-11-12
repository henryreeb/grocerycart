import type { Env } from "../config";
import { encodeBase64Url } from "../auth/encoding";
import { readSessionCookie, verifySession } from "../auth/session";
import { buildAuthorizationUrl, createPkce, encryptToken, exchangeAuthorizationCode, validateOAuthState } from "../kroger/oauth";

export async function handleOAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/oauth/start") {
    const session = readSessionCookie(request);
    if (!session || !(await verifySession(env.SESSION_SECRET, session))) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const state = encodeBase64Url(crypto.getRandomValues(new Uint8Array(24)));
    const pkce = await createPkce();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    await env.DB.prepare("INSERT INTO oauth_states (state, verifier, expires_at) VALUES (?, ?, ?)").bind(state, pkce.verifier, expiresAt).run();
    return Response.redirect(buildAuthorizationUrl({ clientId: env.KROGER_CLIENT_ID, redirectUri: env.KROGER_REDIRECT_URI, state, challenge: pkce.challenge }), 302);
  }
  if (url.pathname === "/api/oauth/callback") {
    const state = url.searchParams.get("state");
    const record = state ? await env.DB.prepare("SELECT state, verifier, expires_at FROM oauth_states WHERE state = ?").bind(state).first<{ state: string; verifier: string; expires_at: string }>() : null;
    validateOAuthState(state, record ? { state: record.state, expiresAt: record.expires_at } : null);
    const code = url.searchParams.get("code");
    if (!code || !record) return Response.json({ error: "Missing OAuth code" }, { status: 400 });
    const tokens = await exchangeAuthorizationCode({ code, verifier: record.verifier, clientId: env.KROGER_CLIENT_ID, clientSecret: env.KROGER_CLIENT_SECRET, redirectUri: env.KROGER_REDIRECT_URI });
    const encrypted = await encryptToken(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY);
    await env.DB.prepare("INSERT INTO oauth_tokens (provider, encrypted_refresh_token, expires_at) VALUES ('kroger', ?, ?) ON CONFLICT(provider) DO UPDATE SET encrypted_refresh_token = excluded.encrypted_refresh_token, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP").bind(encrypted, new Date(Date.now() + tokens.expiresIn * 1000).toISOString()).run();
    await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
    return Response.redirect(env.APP_ORIGIN, 302);
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}
