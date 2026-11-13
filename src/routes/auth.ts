import type { Env } from "../config";
import { createCsrfToken, verifyCsrfToken } from "../auth/csrf";
import { createSession, readSessionCookie, sessionCookie, verifySession } from "../auth/session";
import { verifyPassword } from "../auth/password";

async function login(request: Request, env: Env, now: Date): Promise<Response> {
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  const attempts = await env.DB.prepare("SELECT failures, updated_at FROM login_attempts WHERE address = ?").bind(address).first<{ failures: number; updated_at: string }>();
  const cooldownActive = attempts && now.getTime() - new Date(attempts.updated_at).getTime() < 15 * 60_000;
  if ((attempts?.failures ?? 0) >= 5 && cooldownActive) return Response.json({ error: "Too many attempts" }, { status: 429 });
  if (attempts && !cooldownActive) await env.DB.prepare("DELETE FROM login_attempts WHERE address = ?").bind(address).run();

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  const body: { password?: string } = await request.json<{ password?: string }>().catch(() => ({}));
  const household = await env.DB.prepare("SELECT password_hash FROM households WHERE id = 1").bind().first<{ password_hash: string | null }>();
  if (!household?.password_hash || typeof body.password !== "string" || !(await verifyPassword(body.password, household.password_hash))) {
    await env.DB.prepare("INSERT INTO login_attempts (address, failures) VALUES (?, 1) ON CONFLICT(address) DO UPDATE SET failures = failures + 1").bind(address).run();
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await env.DB.prepare("DELETE FROM login_attempts WHERE address = ?").bind(address).run();
  const token = await createSession(env.SESSION_SECRET, now);
  const csrf = await createCsrfToken(env.SESSION_SECRET, token);
  return Response.json({ csrf }, { headers: { "set-cookie": sessionCookie(token), "cache-control": "no-store" } });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const token = readSessionCookie(request);
  const csrf = request.headers.get("x-csrf-token");
  if (!token || !csrf || !(await verifySession(env.SESSION_SECRET, token)) || !(await verifyCsrfToken(env.SESSION_SECRET, token, csrf))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return new Response(null, { status: 204, headers: { "set-cookie": "household_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" } });
}

export async function handleAuth(request: Request, env: Env, now = new Date()): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/api/session") {
    const token = readSessionCookie(request);
    if (!token || !(await verifySession(env.SESSION_SECRET, token, now))) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ csrf: await createCsrfToken(env.SESSION_SECRET, token) }, { headers: { "cache-control": "no-store" } });
  }
  if (request.method === "POST" && path === "/api/login") return login(request, env, now);
  if (request.method === "POST" && path === "/api/logout") return logout(request, env);
  return Response.json({ error: "Not found" }, { status: 404 });
}
