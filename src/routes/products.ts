import type { Env } from "../config";
import { readSessionCookie, verifySession } from "../auth/session";
import type { KrogerClient } from "../kroger/client";
import { KrogerClient as OfficialKrogerClient } from "../kroger/client";
import { decryptToken, encryptToken, refreshAccessToken } from "../kroger/oauth";

export function productSearchInput(url: URL): { term: string; limit: number; start: number } {
  const term = (url.searchParams.get("q") ?? "").trim();
  if (term.length < 2 || term.length > 100) throw new Error("Search term must be between 2 and 100 characters");
  const requested = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);
  const start = Number(url.searchParams.get("start") ?? "0");
  if (!Number.isInteger(start) || start < 0) throw new Error("Search start must be a non-negative integer");
  return { term, limit: Number.isFinite(requested) ? Math.min(50, Math.max(1, requested)) : 10, start };
}

export type KrogerClientLoader = (env: Env) => Promise<KrogerClient>;

export async function loadKrogerClient(env: Env): Promise<KrogerClient> {
  const row = await env.DB.prepare("SELECT encrypted_refresh_token FROM oauth_tokens WHERE provider = 'kroger'").first<{ encrypted_refresh_token: string }>();
  if (!row) throw new Error("Kroger is not connected");
  const refreshToken = await decryptToken(row.encrypted_refresh_token, env.TOKEN_ENCRYPTION_KEY);
  const tokens = await refreshAccessToken({ refreshToken, clientId: env.KROGER_CLIENT_ID, clientSecret: env.KROGER_CLIENT_SECRET });
  const encrypted = await encryptToken(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY);
  await env.DB.prepare("UPDATE oauth_tokens SET encrypted_refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE provider = 'kroger'").bind(encrypted, new Date(Date.now() + tokens.expiresIn * 1000).toISOString()).run();
  return new OfficialKrogerClient(tokens.accessToken);
}

export async function handleProducts(request: Request, env: Env, loadClient: KrogerClientLoader = loadKrogerClient): Promise<Response> {
  const token = readSessionCookie(request);
  if (!token || !(await verifySession(env.SESSION_SECRET, token))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { term, limit, start } = productSearchInput(new URL(request.url));
    const household = await env.DB.prepare("SELECT preferred_store_id FROM households WHERE id = 1").bind().first<{ preferred_store_id: string | null }>();
    if (!household?.preferred_store_id) return Response.json({ error: "Preferred store is not configured" }, { status: 409 });
    const page = await (await loadClient(env)).searchProducts(term, household.preferred_store_id, limit, start);
    return Response.json(page, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Product search failed" }, { status: 400 });
  }
}
